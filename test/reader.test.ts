import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Browser } from 'playwright-core';
import { defaultSearch, type SearchCriteria } from '../lib/search';
import { searchAirlines } from '../lib/search-airlines';

const body = readFileSync(new URL('./fixtures/badr.txt', import.meta.url), 'utf8');
const search: SearchCriteria = { ...defaultSearch(), date: '2026-10-21', currency: 'USD', airlines: ['tarco', 'badr'] };
const privateError = 'https://example.invalid/(S(private-session))/ cookies=private-cookie';
interface Behavior { httpStatus?: number; navigationError?: Error; readinessError?: Error; cleanupError?: Error; hang?: boolean; text?: string; settledText?: string; title?: string }

class FakeBrowser {
  attempts: Record<string, number> = {};
  contexts: { closed: boolean; settled: boolean }[] = [];
  closed = false;
  constructor(public behaviors: Record<string, Behavior[]> = {}, public failContext = false) {}
  async newContext() {
    if (this.failContext && !this.contexts.length) { this.failContext = false; throw Error(privateError); }
    let behavior: Behavior = {};
    const state = { closed: false, settled: false };
    this.contexts.push(state);
    return {
      newPage: async () => ({
        goto: async (url: string) => {
          const id = url.includes('badrairlines') ? 'badr' : url.includes('SudanAirways') ? 'sudanair' : 'tarco';
          const attempt = this.attempts[id] ?? 0; this.attempts[id] = attempt + 1;
          const choices = this.behaviors[id] ?? [{}]; behavior = choices[Math.min(attempt, choices.length - 1)];
          if (behavior.navigationError) throw behavior.navigationError;
          return { status: () => behavior.httpStatus ?? 200 };
        },
        waitForFunction: async () => { if (behavior.hang) await new Promise(() => {}); if (behavior.readinessError) throw behavior.readinessError; },
        waitForLoadState: async () => { state.settled = true; },
        title: async () => behavior.title ?? 'Search result',
        locator: () => ({ innerText: async () => state.settled && behavior.settledText !== undefined ? behavior.settledText : behavior.text ?? body }),
      }),
      close: async () => { state.closed = true; if (behavior.cleanupError) throw behavior.cleanupError; },
    };
  }
  async close() { this.closed = true; }
}
const noRotation = { next: async () => undefined, fail: () => {}, succeed: () => {} };
const read = (browser: FakeBrowser, criteria = search, sourceTimeoutMs = 1000) => searchAirlines(criteria, { launch: async () => browser as unknown as Browser, retryDelayMs: 1, sourceTimeoutMs, rotation: noRotation });

test('401, 403, 429 are not retried and all contexts are closed', async t => {
  t.mock.method(console, 'warn', () => {});
  const browser = new FakeBrowser({ tarco: [{ httpStatus: 403 }], badr: [{ httpStatus: 401 }], sudanair: [{ httpStatus: 429 }] });
  const results = await read(browser, { ...search, airlines: ['tarco', 'badr', 'sudanair'] });
  assert.deepEqual(results.map(result => result.status), ['blocked', 'blocked', 'blocked']);
  assert.deepEqual(browser.attempts, { tarco: 1, badr: 1, sudanair: 1 });
  assert.ok(browser.closed && browser.contexts.every(context => context.closed));
});

test('transient HTTP, network and readiness failures retry once and clear old errors', async t => {
  t.mock.method(console, 'warn', () => {});
  const timeout = new Error(privateError); timeout.name = 'TimeoutError';
  for (const behavior of [{ httpStatus: 503 }, { navigationError: timeout }, { navigationError: Error(privateError) }, { readinessError: timeout }]) {
    const browser = new FakeBrowser({ badr: [behavior, {}] });
    const [result] = await read(browser, { ...search, airlines: ['badr'] });
    assert.equal(browser.attempts.badr, 2); assert.equal(result.status, 'ok');
    assert.equal(result.reason, undefined); assert.equal(result.httpStatus, undefined); assert.equal(result.errorClass, undefined);
  }
  const browser = new FakeBrowser({ badr: [{ httpStatus: 503 }] });
  const [result] = await read(browser, { ...search, airlines: ['badr'] });
  assert.equal(browser.attempts.badr, 2); assert.equal(result.status, 'unavailable');
});

test('one source timeout or context failure cannot discard other successful fares', async t => {
  const logs: unknown[] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  const browser = new FakeBrowser({ tarco: [{ hang: true }] });
  const result = await read(browser, search, 50);
  assert.equal(result[0].reason, 'source_timeout'); assert.equal(result[1].status, 'ok');
  assert.ok(browser.contexts.every(context => context.closed));
  const failedContext = await read(new FakeBrowser({}, true));
  assert.equal(failedContext[0].reason, 'context_failed'); assert.equal(failedContext[1].status, 'ok');
  assert.doesNotMatch(JSON.stringify([logs, failedContext]), /private-session|private-cookie/);
});

test('changed title, mismatched query and unreadable fares fail closed without retry', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const [behavior, reason] of [[{ title: 'Booking engine' }, 'unexpected_page'], [{ text: body.replace('21 October, 2026', '22 October, 2026') }, 'query_mismatch'], [{ text: 'PZU CAI 21 October, 2026 Travel time changed markup' }, 'parse_failed']] as const) {
    const browser = new FakeBrowser({ badr: [behavior] });
    const [result] = await read(browser, { ...search, airlines: ['badr'] });
    assert.equal(result.reason, reason); assert.deepEqual(result.flights, []); assert.equal(browser.attempts.badr, 1);
  }
});

test('waits for asynchronous fares, reports unsupported currency and survives cleanup failures', async t => {
  t.mock.method(console, 'warn', () => {});
  const browser = new FakeBrowser({ badr: [{ text: body.replaceAll('$', 'EUR'), settledText: body, cleanupError: Error(privateError) }] });
  assert.equal((await read(browser, { ...search, airlines: ['badr'] }))[0].status, 'ok');
  const unsupported = new FakeBrowser({ badr: [{ text: 'The currency SAR is not valid' }] });
  const [result] = await read(unsupported, { ...search, currency: 'SAR', airlines: ['badr'] });
  assert.equal(result.reason, 'unsupported_currency'); assert.equal(result.status, 'currency_unavailable');
  assert.equal(unsupported.contexts[0].settled, false); assert.equal(unsupported.attempts.badr, 1);
});

test('403 rotates browser-level proxies, keeps successful sources and never reuses a failed IP', async t => {
  t.mock.method(console, 'warn', () => {});
  const direct = new FakeBrowser({ tarco: [{ httpStatus: 403 }] });
  const first = new FakeBrowser({ tarco: [{ navigationError: Error(privateError) }] });
  const second = new FakeBrowser();
  const browsers = [direct, first, second];
  const proxies = ['socks4://8.8.8.8:1080', 'socks4://1.1.1.1:1080'];
  const launches: (string | undefined)[] = [];
  const failures: string[] = [];
  const successes: string[] = [];
  const result = await searchAirlines(search, {
    launch: async proxy => {
      assert.ok(browsers.slice(0, launches.length).every(browser => browser.closed));
      launches.push(proxy);
      return browsers[launches.length - 1] as unknown as Browser;
    },
    sourceTimeoutMs: 1000, retryDelayMs: 1,
    rotation: { next: async excluded => proxies.find(proxy => !excluded.has(proxy)), fail: proxy => { failures.push(proxy); }, succeed: proxy => { successes.push(proxy); } },
  });
  assert.deepEqual(launches, [undefined, ...proxies]);
  assert.deepEqual(result.map(source => source.status), ['ok', 'ok']);
  assert.equal(result[0].connection, 'proxy'); assert.equal(result[0].proxyAttempts, 2);
  assert.equal(result[1].connection, 'direct');
  assert.deepEqual(direct.attempts, { tarco: 1, badr: 1 });
  assert.equal(first.attempts.badr, undefined); assert.equal(second.attempts.badr, undefined);
  assert.deepEqual(failures, [proxies[0]]); assert.deepEqual(successes, [proxies[1]]);
  assert.doesNotMatch(JSON.stringify(result), /socks4|private-cookie|private-session/);
});

test('authentication, rate limits, unsupported currency, empty results and query mismatches do not rotate', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const behavior of [{ httpStatus: 401 }, { httpStatus: 429 }, { text: 'The currency USD is not valid' }, { text: 'PZU CAI 21 October, 2026\nNo results' }, { text: body.replace('21 October, 2026', '22 October, 2026') }]) {
    let rotations = 0;
    const browser = new FakeBrowser({ badr: [behavior] });
    await searchAirlines({ ...search, airlines: ['badr'] }, { launch: async () => browser as unknown as Browser, rotation: { ...noRotation, next: async () => { rotations++; return undefined; } } });
    assert.equal(rotations, 0);
  }
});

test('unavailable list preserves original source failure and proxy launch failures remain bounded', async t => {
  t.mock.method(console, 'warn', () => {});
  const browser = new FakeBrowser({ badr: [{ httpStatus: 403 }] });
  const [original] = await searchAirlines({ ...search, airlines: ['badr'] }, { launch: async () => browser as unknown as Browser, rotation: { ...noRotation, next: async () => { throw Error(privateError); } } });
  assert.equal(original.status, 'blocked'); assert.equal(original.httpStatus, 403);
  let launches = 0;
  let failures = 0;
  await searchAirlines({ ...search, airlines: ['badr'] }, { launch: async proxy => { launches++; if (proxy) throw Error(privateError); return new FakeBrowser({ badr: [{ httpStatus: 403 }] }) as unknown as Browser; }, rotation: { ...noRotation, next: async excluded => ['socks4://8.8.8.8:1080', 'socks4://1.1.1.1:1080'].find(proxy => !excluded.has(proxy)), fail: () => { failures++; } } });
  assert.equal(launches, 3); assert.equal(failures, 2);
});
