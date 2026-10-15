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
const read = (browser: FakeBrowser, criteria = search, sourceTimeoutMs = 1000) => searchAirlines(criteria, { launch: async () => browser as unknown as Browser, retryDelayMs: 1, sourceTimeoutMs });

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
