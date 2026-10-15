import assert from 'node:assert/strict';
import { defaultSearch, searchParams, type SearchResponse } from '../lib/search';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const future = new Date(); future.setUTCDate(future.getUTCDate() + 6);
const date = process.env.TEST_DATE ?? future.toISOString().slice(0, 10);
for (const currency of ['USD', 'SDG', 'SAR'] as const) {
  const criteria = { ...defaultSearch(), date, currency };
  const response = await fetch(`${base}/api/search?${searchParams(criteria)}`, { signal: AbortSignal.timeout(100_000) });
  assert.equal(response.status, 200);
  const data: SearchResponse = await response.json();
  assert.equal(data.search.currency, currency);
  assert.equal(data.sources.length, 3);
  console.log(currency, data.sources.map(source => ({ id: source.id, status: source.status, reason: source.reason, flights: source.flights.length })));
  assert.ok(data.sources.every(source => ['ok', 'no_results', 'currency_unavailable'].includes(source.status)), 'Some airline sources could not be verified');
  assert.ok(data.sources.some(source => source.flights.length), 'No actual fares were verified for this date');
  for (const source of data.sources) for (const flight of source.flights) {
    assert.equal(flight.from, criteria.from); assert.equal(flight.to, criteria.to); assert.equal(flight.date, date);
    assert.equal(flight.currency, currency); assert.equal(flight.priceScope, 'source_displayed'); assert.ok(flight.price >= 0);
    assert.equal(new URL(source.bookingUrl).searchParams.get('Currency'), currency);
  }
}
