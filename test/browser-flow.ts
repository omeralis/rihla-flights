import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { launch } from 'cloakbrowser';
import { parseResults } from '../lib/parse-results';
import { bookingUrl, defaultSearch, providers, validate } from '../lib/search';

process.env.CLOAKBROWSER_VERSION ??= '146.0.7680.177.5';
process.env.CLOAKBROWSER_AUTO_UPDATE ??= 'false';
const port = process.env.TEST_PORT ?? '3100';
const base = process.env.TEST_BASE_URL ?? `http://127.0.0.1:${port}`;
let serverLogs = '';
const server = process.env.TEST_BASE_URL ? undefined : spawn(process.execPath, ['scripts/start.mjs'], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
server?.stdout.on('data', data => { serverLogs += data; });
server?.stderr.on('data', data => { serverLogs += data; });
let browser: Awaited<ReturnType<typeof launch>> | undefined;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* Starting server. */ }
    if (server?.exitCode !== null && server?.exitCode !== undefined) throw Error(serverLogs);
    await delay(250);
  }
  assert.ok(ready, `Server failed to start: ${serverLogs}`);
  assert.equal((await fetch(`${base}/api/search?from=PZU&to=PZU`)).status, 400);
  browser = await launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let failed = false;
  // Fixtures are intercepted only inside this test browser, never in the app.
  await page.route('**/api/search?**', async route => {
    if (failed) { await route.fulfill({ status: 503, json: { message: 'تعذّر تشغيل البحث لدى الشركات.' } }); return; }
    const search = validate(new URL(route.request().url()).searchParams);
    const sources = await Promise.all(search.airlines.map(async id => {
      const suffix = search.currency === 'USD' ? '' : `-${search.currency.toLowerCase()}`;
      const text = await readFile(new URL(`./fixtures/${id}${suffix}.txt`, import.meta.url), 'utf8');
      const parsed = id === 'badr' && search.currency === 'SAR' ? { status: 'currency_unavailable', reason: 'unsupported_currency', flights: [] } : parseResults(text, search);
      return { id, name: providers[id].name, bookingUrl: bookingUrl(id, search), ...parsed };
    }));
    await route.fulfill({ json: { search, sources, checkedAt: new Date().toISOString() } });
  });
  await mkdir(new URL('./artifacts/', import.meta.url), { recursive: true });
  await page.goto(base);
  await page.locator('#from').selectOption('PZU');
  await page.locator('#to').selectOption('PZU');
  await page.getByRole('button', { name: /ابحث عن رحلات/ }).click();
  assert.match(await page.locator('#form-error').innerText(), /مختلفتين/);
  await page.locator('#to').selectOption('CAI');
  const search = defaultSearch();
  await page.locator('#date').fill(search.date);
  await page.screenshot({ path: 'test/artifacts/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /ابحث عن رحلات/ }).click();
  await page.waitForURL('**/results?**');
  await page.waitForFunction(() => document.querySelectorAll('.price-box').length === 2);
  assert.equal(await page.locator('#route-title').innerText(), 'بورتسودان ← القاهرة');
  assert.equal(await page.locator('#currency-filter').inputValue(), 'SDG');
  for (const currency of ['USD', 'SAR', 'SDG']) {
    await page.locator('#currency-filter').selectOption(currency);
    await page.waitForFunction(() => !(document.querySelector('#currency-filter') as HTMLSelectElement).disabled);
    const prices = await page.locator('.price-box strong').allInnerTexts();
    assert.ok(prices.length > 0);
    assert.ok(prices.every(price => price.includes(currency === 'SDG' ? 'ج.س' : currency === 'SAR' ? 'ر.س' : 'USD')));
    assert.ok(page.url().includes(`currency=${currency}`));
    for (const link of await page.locator('.official-link').evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href))) assert.equal(new URL(link).searchParams.get('Currency'), currency);
    if (currency === 'SAR') assert.match(await page.locator('[data-airline=badr] .source-body').innerText(), /لا تدعم/);
  }
  await page.locator('#sort').selectOption('time');
  for (const id of ['tarco', 'badr', 'sudanair']) await page.locator(`.air-filter[value=${id}]`).uncheck();
  assert.equal(await page.locator('.price-box').count(), 0);
  assert.match(await page.locator('#source-status').innerText(), /اختر شركة/);
  await page.locator('.air-filter[value=badr]').check();
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'test/artifacts/results-mobile.png', fullPage: true });
  failed = true;
  await page.locator('#retry').click();
  await page.waitForFunction(() => !(document.querySelector('#retry') as HTMLButtonElement).disabled);
  assert.equal(await page.locator('.price-box').count(), 0);
  assert.equal(await page.locator('.source-card .official-link').count(), 1);
  failed = false;
  await page.locator('#retry').click();
  await page.waitForFunction(() => document.querySelectorAll('.price-box').length === 1);
  await page.locator('#edit-link').click();
  await page.waitForURL(url => url.pathname === '/');
  assert.equal(await page.locator('#currency').inputValue(), 'SDG');
  await page.locator('[name=trip][value=round]').check();
  const back = new Date(`${search.date}T12:00:00Z`); back.setUTCDate(back.getUTCDate() + 7);
  await page.locator('#return-date').fill(back.toISOString().slice(0, 10));
  await page.locator('[name=passengers]').selectOption('3');
  await page.getByRole('button', { name: /ابحث عن رحلات/ }).click();
  await page.waitForURL('**/results?**');
  await page.waitForFunction(() => document.querySelectorAll('.price-box').length === 2);
  const booking = new URL((await page.locator('.official-link').first().getAttribute('href'))!);
  assert.equal(booking.searchParams.get('InboundDate'), back.toISOString().slice(0, 10));
  assert.equal(booking.searchParams.get('TravelerTypes[0].Value'), '3');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.goto(`${base}/results.html?from=PZU&to=CAI&date=${search.date}&airline=badr&currency=USD`);
  await page.waitForURL('**/results?**');
  assert.ok(page.url().includes('currency=USD'));
  await page.goto(`${base}/index.html?currency=SAR`);
  assert.equal(await page.locator('#currency').inputValue(), 'SAR');
  assert.deepEqual(errors, []);
  console.log('Browser flow passed: validation, search, currencies, source errors, retry, filters, sorting, round trips, passenger counts, form persistence, legacy redirects and mobile layout.');
} catch (error) {
  console.error(serverLogs);
  throw error;
} finally {
  await browser?.close();
  server?.kill();
}
