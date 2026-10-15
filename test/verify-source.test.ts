import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { defaultSearch, currencyOrder, sortOffers } from '../lib/search';
import { parseResults } from '../lib/parse-results';
import { verifySource } from '../lib/verify-source';

const body = readFileSync(new URL('./fixtures/badr.txt', import.meta.url), 'utf8').replaceAll('\r', '');
const search = { ...defaultSearch(), date: '2026-10-21', currency: 'USD' as const };

test('verifies the active header rather than a date or airport anywhere in the calendar', () => {
  assert.equal(verifySource(body, search).matches, true);
  assert.equal(verifySource(body.replace('21 October, 2026', '22 October, 2026') + '\n21 October, 2026', search).mismatch, 'date');
  assert.equal(verifySource(body.replace('Cairo Intl\nCAI\nexpand_more', 'Khartoum\nKRT\nexpand_more') + '\nCAI', search).mismatch, 'route');
  assert.equal(verifySource('PZU CAI 21 October, 2026 Travel time', search).mismatch, 'unverified');
  assert.equal(verifySource(body.replace('21 October, 2026', '\u200f21\u00a0October 2026'), search).matches, true);
});

test('normalizes leading zeroes and verifies the return date and reverse route independently', () => {
  const leading = body.replace('21 October, 2026', '07 October, 2026');
  assert.equal(verifySource(leading, { ...search, date: '2026-10-07' }).matches, true);
  const inbound = body.split('expand_more')[0].replace('Outbound', 'Inbound').replace('21 October, 2026', '28 October, 2026').replace('Port Sudan\nPZU\nflight\nCairo Intl\nCAI', 'Cairo Intl\nCAI\nflight\nPort Sudan\nPZU') + 'expand_more';
  const round = { ...search, round: true, returnDate: '2026-10-28' };
  assert.equal(verifySource(`${body}\n${inbound}`, round).returnVerified, true);
  assert.equal(verifySource(`${body}\n${inbound.replace('28 October', '29 October')}`, round).matches, false);
});

test('fallback currencies are deduplicated and mixed prices are sorted only inside each currency', () => {
  assert.deepEqual(currencyOrder('SAR'), ['SAR', 'SDG', 'USD']);
  assert.deepEqual(currencyOrder('SDG'), ['SDG', 'USD']);
  assert.deepEqual(currencyOrder('USD'), ['USD', 'SDG']);
  const base = parseResults(body, search).flights[0];
  const offers = [{ flight: { ...base, price: 270, currency: 'USD' as const } }, { flight: { ...base, price: 2565000, currency: 'SDG' as const } }, { flight: { ...base, price: 1200, currency: 'SAR' as const } }, { flight: { ...base, price: 1100, currency: 'SAR' as const } }];
  assert.deepEqual(sortOffers(offers, 'price', 'SAR').map(({ flight }) => [flight.currency, flight.price]), [['SAR', 1100], ['SAR', 1200], ['SDG', 2565000], ['USD', 270]]);
  assert.equal(offers[0].flight.currency, 'USD');
});
