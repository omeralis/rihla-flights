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
  requests: URL[] = [];
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
          this.requests.push(new URL(url));
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
  for (const [behavior, reason] of [[{ title: 'Booking engine' }, 'unexpected_page'], [{ text: body.replace('21 October, 2026', '22 October, 2026') }, 'query_mismatch'], [{ text: body.replaceAll('$', 'EUR') }, 'parse_failed']] as const) {
    const browser = new FakeBrowser({ badr: [behavior] });
    const [result] = await read(browser, { ...search, airlines: ['badr'] });
    assert.equal(result.reason, reason); assert.deepEqual(result.flights, []); assert.equal(browser.attempts.badr, 1);
  }
});

test('waits for asynchronous fares, reports unsupported currency and survives cleanup failures', async t => {
  t.mock.method(console, 'warn', () => {});
  const browser = new FakeBrowser({ badr: [{ text: body.replaceAll('$', 'EUR'), settledText: body, cleanupError: Error(privateError) }] });
  assert.equal((await read(browser, { ...search, airlines: ['badr'] }))[0].status, 'ok');
  const unsupported = new FakeBrowser({ badr: ['SAR', 'SDG', 'USD'].map(currency => ({ text: `The currency ${currency} is not valid` })) });
  const [result] = await read(unsupported, { ...search, currency: 'SAR', airlines: ['badr'] });
  assert.equal(result.reason, 'unsupported_currency'); assert.equal(result.status, 'currency_unavailable');
  assert.equal(unsupported.contexts[0].settled, false); assert.equal(unsupported.attempts.badr, 3);
  assert.deepEqual(result.attemptedCurrencies, ['SAR', 'SDG', 'USD']);
});

test('each airline keeps its supported currency, falling back independently to SDG then USD', async t => {
  t.mock.method(console, 'warn', () => {});
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8');
  const browser = new FakeBrowser({
    tarco: [{ text: 'The currency SAR is not valid' }, { text: 'The currency SDG is not valid' }, { text: body }],
    badr: [{ text: 'The currency SAR is not valid' }, { text: fixture('badr-sdg') }],
    sudanair: [{ text: fixture('sudanair-sar') }],
  });
  const results = await read(browser, { ...search, airlines: ['tarco', 'badr', 'sudanair'], currency: 'SAR' });
  assert.deepEqual(results.map(source => source.status), ['ok', 'ok', 'ok']);
  assert.deepEqual(results.map(source => source.currency), ['USD', 'SDG', 'SAR']);
  assert.deepEqual(results.map(source => source.currencyFallback), [true, true, false]);
  assert.deepEqual(results.map(source => source.flights[0].price), [270, 2565000, 1106.46]);
  assert.ok(results.every(source => source.requestedCurrency === 'SAR'));
  for (const source of results) {
    assert.ok(source.flights.every(flight => flight.currency === source.currency));
    assert.equal(new URL(source.bookingUrl).searchParams.get('Currency'), source.currency);
  }
  assert.deepEqual(browser.requests.filter(url => url.pathname.includes('tarcoair')).map(url => url.searchParams.get('Currency')), ['SAR', 'SDG', 'USD']);
  assert.ok(browser.contexts.every(context => context.closed));
});

test('mismatched fare currency is requested again and failed fallback connections do not trigger other currencies', async t => {
  t.mock.method(console, 'warn', () => {});
  const browser = new FakeBrowser({ badr: [{ text: body }, { text: body }, { text: body }] });
  const [result] = await read(browser, { ...search, currency: 'SAR', airlines: ['badr'] });
  assert.equal(result.status, 'ok'); assert.equal(result.currency, 'USD'); assert.equal(result.flights[0].price, 270);
  assert.deepEqual(result.attemptedCurrencies, ['SAR', 'SDG', 'USD']);
  const down = new FakeBrowser({ badr: [{ text: 'The currency SAR is not valid' }, { navigationError: Error(privateError) }] });
  const [failure] = await read(down, { ...search, currency: 'SAR', airlines: ['badr'] });
  assert.equal(failure.status, 'unavailable'); assert.equal(failure.currency, 'SDG');
  assert.deepEqual(failure.attemptedCurrencies, ['SAR', 'SDG']);
});

test('Tarco retries a different selected date using an explicit time and verifies the corrected header', async t => {
  t.mock.method(console, 'warn', () => {});
  const tarco = readFileSync(new URL('./fixtures/tarco-krt-sdg.txt', import.meta.url), 'utf8');
  const criteria = { ...search, date: '2026-10-22', to: 'KRT' as const, currency: 'SDG' as const, airlines: ['tarco' as const] };
  const browser = new FakeBrowser({ tarco: [{ text: tarco }, { text: tarco.replace('17 October, 2026', '22 October, 2026') }] });
  const [result] = await read(browser, criteria);
  assert.equal(result.status, 'ok'); assert.equal(result.observedDate, '2026-10-22');
  assert.equal(result.dateCorrectionAttempted, true); assert.equal(result.queryMismatch, undefined);
  assert.equal(result.flights[0].date, criteria.date);
  assert.deepEqual(browser.requests.map(url => url.searchParams.get('OutboundDate')), ['2026-10-22', '2026-10-22T12:00:00']);
  const mismatched = new FakeBrowser({ tarco: [{ text: `${tarco}\n22 October, 2026` }] });
  const [rejected] = await read(mismatched, criteria);
  assert.equal(rejected.status, 'unrecognized'); assert.equal(rejected.reason, 'query_mismatch');
  assert.equal(rejected.queryMismatch, 'date'); assert.equal(rejected.observedDate, '2026-10-17');
  assert.deepEqual(rejected.flights, []); assert.equal(mismatched.attempts.tarco, 2);
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
