import { isIPv4 } from 'node:net';

export const PROXY_LIST_URL = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.json';
const CACHE_MS = 5 * 60_000;

function publicIPv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)) || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

export function parseProxyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const proxies = new Set<string>();
  for (const entry of value.slice(0, 10_000)) {
    if (!entry || typeof entry !== 'object' || entry.protocol !== 'socks4' || typeof entry.proxy !== 'string') continue;
    const match = /^socks4:\/\/(\d+\.\d+\.\d+\.\d+):(\d{1,5})$/.exec(entry.proxy);
    if (!match || !publicIPv4(match[1])) continue;
    const port = Number(match[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    if (entry.ip !== match[1] || entry.port !== port) continue;
    proxies.add(`socks4://${match[1]}:${port}`);
  }
  return [...proxies];
}

async function loadProxyList(): Promise<unknown> {
  const response = await fetch(PROXY_LIST_URL, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(4_000) });
  if (!response.ok || !response.body) throw Error('ProxyListUnavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_000_000) throw Error('ProxyListTooLarge');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export interface ProxyRotation {
  next(excluded: ReadonlySet<string>): Promise<string | undefined>;
  fail(proxy: string): void;
  succeed(proxy: string): void;
}

export class RotateProxy implements ProxyRotation {
  private proxies: string[] = [];
  private refreshAt = 0;
  private pending?: Promise<void>;
  private cooldown = new Map<string, number>();
  private cursor = 0;

  constructor(private load: () => Promise<unknown> = loadProxyList, private now = Date.now, private random = Math.random) {}

  async next(excluded: ReadonlySet<string>): Promise<string | undefined> {
    if (this.now() >= this.refreshAt) {
      this.pending ??= this.refresh().finally(() => { this.pending = undefined; });
      await this.pending;
    }
    for (const [proxy, until] of this.cooldown) if (until <= this.now()) this.cooldown.delete(proxy);
    for (let count = 0; count < this.proxies.length; count++) {
      const proxy = this.proxies[this.cursor++ % this.proxies.length];
      if (!excluded.has(proxy) && !this.cooldown.has(proxy)) return proxy;
    }
    return undefined;
  }

  fail(proxy: string) { this.cooldown.set(proxy, this.now() + CACHE_MS); }
  succeed(proxy: string) { this.cooldown.delete(proxy); }

  private async refresh() {
    try {
      const candidates = parseProxyList(await this.load());
      if (!candidates.length) throw Error('ProxyListEmpty');
      for (let index = candidates.length - 1; index > 0; index--) {
        const next = Math.floor(this.random() * (index + 1));
        [candidates[index], candidates[next]] = [candidates[next], candidates[index]];
      }
      this.proxies = candidates;
      this.cursor = 0;
      this.refreshAt = this.now() + CACHE_MS;
      const current = new Set(candidates);
      for (const proxy of this.cooldown.keys()) if (!current.has(proxy)) this.cooldown.delete(proxy);
    } catch {
      // A list outage must preserve the direct airline results and never leak addresses.
      this.refreshAt = this.now() + 30_000;
      console.warn('Proxy list unavailable');
    }
  }
}

export const rotateProxy = new RotateProxy();
