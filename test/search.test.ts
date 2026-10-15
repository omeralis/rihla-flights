import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bookingUrl, defaultSearch, searchParams, validate, type SearchCriteria } from '../lib/search';
import { parseResults } from '../lib/parse-results';
import { createSearchHandler } from '../lib/search-service';

const search: SearchCriteria = { ...defaultSearch(), date: '2026-10-21', currency: 'USD' };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8').replaceAll('\r', '');

test('reads actual fares, next-day arrivals and split decimals without multiplying passengers', () => {
  for (const [name, price, departure, duration] of [['badr', 270, '23:00', '02h30'], ['sudanair', 361.75, '23:30', '02h00']] as const) {
    const result = parseResults(fixture(name), { ...search, passengers: 3 });
    assert.equal(result.status, 'ok');
    assert.equal(result.flights.length, 1);
    assert.deepEqual([result.flights[0].price, result.flights[0].departure, result.flights[0].duration, result.flights[0].arrivalDayOffset, result.flights[0].priceScope], [price, departure, duration, 1, 'source_displayed']);
  }
});

test('calendar fares and changed pages never become fabricated flights', () => {
  for (const suffix of ['', '-sdg', '-sar']) assert.deepEqual(parseResults(fixture(`tarco${suffix}`), { ...search, currency: suffix === '-sdg' ? 'SDG' : suffix === '-sar' ? 'SAR' : 'USD' }), { status: 'no_results', flights: [] });
  for (const text of ['Session expired', 'From $270.00', 'Error. An error occurred while processing your request.']) assert.throws(() => parseResults(text, search));
  assert.throws(() => parseResults(fixture('badr').replaceAll('$', 'EUR'), search));
});

test('SDG and SAR fares retain source currencies and directional decimal formatting', () => {
  for (const [name, currency, price] of [['badr-sdg', 'SDG', 2565000], ['sudanair-sdg', 'SDG', 1800000], ['sudanair-sar', 'SAR', 1106.46]] as const) {
    const result = parseResults(fixture(name), { ...search, currency });
    assert.equal(result.status, 'ok');
    assert.equal(result.flights[0].price, price);
    assert.equal(result.flights[0].currency, currency);
  }
  assert.deepEqual(parseResults(fixture('badr'), { ...search, currency: 'SDG' }), { status: 'currency_unavailable', flights: [] });
  assert.deepEqual(parseResults(fixture('sudanair-sar'), search), { status: 'currency_unavailable', flights: [] });
});

test('parses Khartoum and both round-trip legs while excluding unrelated routes', () => {
  for (const [name, price] of [['badr', 2090000], ['sudanair', 1000000]] as const) {
    const result = parseResults(fixture(`${name}-krt-sdg`), { ...search, to: 'KRT', date: '2026-10-18', currency: 'SDG' });
    assert.equal(result.flights[0].price, price);
    assert.equal(result.flights[0].to, 'KRT');
  }
  const outbound = fixture('badr');
  const inbound = outbound.replace('PZU\n23:00\nstraight\nCAI', 'CAI\n23:00\nstraight\nPZU');
  const result = parseResults(`${outbound}\n${inbound}`, { ...search, round: true, returnDate: '2026-10-28' });
  assert.deepEqual(result.flights.map(f => [f.leg, f.date]), [['outbound', '2026-10-21'], ['return', '2026-10-28']]);
});

test('validation rejects malformed inputs and booking links preserve the entire query', () => {
  const future = { ...defaultSearch(), round: true, returnDate: '2099-12-31', passengers: 3 };
  const valid = searchParams(future);
  assert.deepEqual(validate(valid), future);
  valid.delete('currency');
  assert.equal(validate(valid).currency, 'SDG');
  for (const [key, value] of [['from', 'https://example.com'], ['to', 'PZU'], ['date', '2026-02-31'], ['date', '2000-01-01'], ['passengers', '1.5'], ['passengers', '99'], ['airline', 'constructor'], ['airline', '__proto__'], ['currency', 'SDG&Currency=USD'], ['trip', 'bad'], ['return', '2000-01-01']]) {
    const params = new URLSearchParams(valid); params.set(key, value);
    assert.throws(() => validate(params), key);
  }
  for (const id of search.airlines) for (const currency of ['SDG', 'SAR', 'USD'] as const) {
    const query = new URL(bookingUrl(id, { ...future, currency })).searchParams;
    assert.equal(query.get('Currency'), currency);
    assert.equal(query.get('InboundDate'), future.returnDate);
    assert.equal(query.get('TravelerTypes[0].Key'), 'AD');
    assert.equal(query.get('TravelerTypes[0].Value'), '3');
    assert.equal(query.get('OriginAirportCode'), 'PZU');
    assert.equal(query.get('DestinationAirportCode'), 'CAI');
  }
});

test('API validates before launch, limits concurrent browsers and caches only successful complete searches', async () => {
  let calls = 0;
  let release!: () => void;
  let clock = Date.now();
  const handle = createSearchHandler(async criteria => {
    calls++;
    await new Promise<void>(resolve => { release = resolve; });
    return criteria.airlines.map(id => ({ id, name: id, bookingUrl: bookingUrl(id, criteria), status: 'no_results', flights: [] }));
  }, () => clock);
  const request = (currency = 'SDG') => new Request(`http://localhost/api/search?${searchParams({ ...defaultSearch(), currency: currency as SearchCriteria['currency'] })}`);
  assert.equal((await handle(new Request('http://localhost/api/search'))).status, 400);
  assert.equal(calls, 0);
  const first = handle(request());
  const busy = await handle(request('USD'));
  assert.equal(busy.status, 429); assert.equal(busy.headers.get('Retry-After'), '15');
  release();
  const response = await first;
  const payload = await response.json();
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await (await handle(request())).json()).checkedAt, payload.checkedAt);
  assert.equal(calls, 1);
  clock += 30_001;
  const expired = handle(request()); release(); await expired;
  assert.equal(calls, 2);
  let failures = 0;
  const failing = createSearchHandler(async criteria => { failures++; return [{ id: 'badr', name: 'بدر', bookingUrl: bookingUrl('badr', criteria), status: 'blocked', flights: [] }]; });
  await failing(request()); await failing(request());
  assert.equal(failures, 2);
});

test('launch failures return a sanitized 503 and release the browser slot', async t => {
  t.mock.method(console, 'error', () => {});
  let calls = 0;
  const handle = createSearchHandler(async () => { calls++; throw Error('cookies=private-session'); });
  const request = () => new Request(`http://localhost/api/search?${searchParams(defaultSearch())}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await handle(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private-session|cookies/);
  }
  assert.equal(calls, 2);
});
