import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProxyList, RotateProxy } from '../lib/rotate-proxy';

const entry = (ip: string, port = 1080) => ({ proxy: `socks4://${ip}:${port}`, protocol: 'socks4', ip, port, https: false });

test('accepts public SOCKS4 endpoints and rejects private, reserved, malformed and credential URLs', () => {
  const valid = entry('8.8.8.8');
  assert.deepEqual(parseProxyList([valid, valid, entry('1.1.1.1', 65535)]), [valid.proxy, 'socks4://1.1.1.1:65535']);
  const denied = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '192.0.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '0.0.0.0', '999.1.1.1'];
  assert.deepEqual(parseProxyList([...denied.map(ip => entry(ip)), entry('8.8.8.8', 0), entry('8.8.8.8', 65536), { ...valid, proxy: 'http://8.8.8.8:1080' }, { ...valid, ip: '1.1.1.1' }, { ...valid, port: 80 }, { ...valid, proxy: 'socks4://user:pass@8.8.8.8:1080' }, { ...valid, proxy: 'socks4://localhost:1080' }, { ...valid, proxy: 'socks4://[::1]:1080' }, null, 'socks4://8.8.8.8:1080']), []);
  assert.deepEqual(parseProxyList({ proxies: [valid] }), []);
});

test('deduplicates concurrent list fetches, rotates, cools failures and refreshes after five minutes', async () => {
  let calls = 0;
  let now = 1000;
  const proxy = new RotateProxy(async () => { calls++; return [entry('8.8.8.8'), entry('1.1.1.1')]; }, () => now, () => 0.99);
  const [first, second] = await Promise.all([proxy.next(new Set()), proxy.next(new Set())]);
  assert.equal(calls, 1); assert.notEqual(first, second);
  proxy.fail(first!);
  assert.equal(await proxy.next(new Set([second!])), undefined);
  proxy.succeed(first!);
  assert.equal(await proxy.next(new Set([second!])), first);
  proxy.fail(first!);
  now += 300_001;
  assert.ok(await proxy.next(new Set([second!])));
  assert.equal(calls, 2);
});

test('list outages are cached briefly and existing endpoints survive a refresh outage', async t => {
  t.mock.method(console, 'warn', () => {});
  let calls = 0;
  let now = 1000;
  const empty = new RotateProxy(async () => { calls++; throw Error('private-list-error'); }, () => now);
  assert.equal(await empty.next(new Set()), undefined);
  assert.equal(await empty.next(new Set()), undefined);
  assert.equal(calls, 1);
  now += 30_001;
  await empty.next(new Set()); assert.equal(calls, 2);
  let available = true;
  const proxy = new RotateProxy(async () => { if (!available) throw Error('list unavailable'); return [entry('8.8.8.8')]; }, () => now);
  assert.equal(await proxy.next(new Set()), 'socks4://8.8.8.8:1080');
  available = false; now += 300_001;
  assert.equal(await proxy.next(new Set()), 'socks4://8.8.8.8:1080');
});
