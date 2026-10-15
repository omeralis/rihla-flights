import type { Browser, BrowserContext } from 'playwright-core';
import { bookingUrl, providers, type Airline, type SearchCriteria, type SourceResult } from './search';
import { parseResults } from './parse-results';

class SourceTimeout extends Error { override name = 'TimeoutError'; }
const errorClass = (error: unknown) => (error instanceof Error ? error.name : 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 80);

async function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SourceTimeout()), ms); })]); }
  finally { clearTimeout(timer!); }
}

async function cleanup(resource: { close(): Promise<void> } | undefined) {
  if (!resource) return;
  try { await timeout(resource.close(), 2_000); }
  catch (error) { console.warn('Browser cleanup failed', { errorClass: errorClass(error) }); }
}

async function launchBrowser(): Promise<Browser> {
  process.env.CLOAKBROWSER_AUTO_UPDATE ??= 'false';
  process.env.CLOAKBROWSER_VERSION ??= '146.0.7680.177.5';
  const { launch } = await import('cloakbrowser');
  return launch({ headless: true });
}

interface ReaderOptions {
  launch?: () => Promise<Browser>;
  sourceTimeoutMs?: number;
  retryDelayMs?: number;
}

export async function searchAirlines(search: SearchCriteria, options: ReaderOptions = {}): Promise<SourceResult[]> {
  let abandoned = false;
  const launching = (options.launch ?? launchBrowser)().then(async browser => {
    if (abandoned) { await cleanup(browser); throw new SourceTimeout(); }
    return browser;
  });
  let browser: Browser;
  try { browser = await timeout(launching, 10_000); }
  catch (error) { abandoned = true; throw error; }

  async function read(id: Airline): Promise<SourceResult> {
    const result: SourceResult = { id, name: providers[id].name, bookingUrl: bookingUrl(id, search), status: 'unavailable', flights: [] };
    let stage = 'context';
    let context: BrowserContext | undefined;
    let expired = false;
    const deadline = Date.now() + (options.sourceTimeoutMs ?? 65_000);
    const remaining = (limit: number) => Math.max(1, Math.min(limit, deadline - Date.now()));
    const failure = (reason: string, status: SourceResult['status'] = 'unavailable', httpStatus?: number, error?: unknown) => {
      Object.assign(result, { status, reason, stage, flights: [] });
      if (httpStatus !== undefined) result.httpStatus = httpStatus;
      if (error) result.errorClass = errorClass(error);
      // Never log browser messages, session URLs, cookies or source page text.
      console.warn('Airline read failed', { provider: id, currency: search.currency, stage, reason, httpStatus, errorClass: result.errorClass });
    };
    const unsupported = (text: string) => new RegExp(`The currency\\s+${search.currency}\\s+is not valid`).test(text);

    async function attemptSearch() {
      for (let attempt = 0; attempt < 2 && !expired; attempt++) {
        let retryable = false;
        for (const key of ['reason', 'stage', 'httpStatus', 'errorClass'] as const) delete result[key];
        stage = 'context';
        try {
          const created = await browser.newContext({ locale: 'en-GB' });
          if (expired) { await cleanup(created); return; }
          context = created;
          const page = await context.newPage();
          stage = 'navigation';
          const response = await page.goto(result.bookingUrl, { waitUntil: 'domcontentloaded', timeout: remaining(45_000) });
          const status = response?.status();
          if (status !== undefined && [401, 403, 429].includes(status)) { failure('upstream_http', 'blocked', status); return; }
          if (status !== 200) {
            failure(response ? 'upstream_http' : 'network_error', 'unavailable', status);
            retryable = !response || (status !== undefined && status >= 500 && status <= 599);
          } else {
            stage = 'readiness';
            await page.waitForFunction(() => /Travel time|No results|The currency .* is not valid/.test(document.body.innerText), undefined, { timeout: remaining(20_000) });
            stage = 'source_check';
            let text = await page.locator('body').innerText();
            if (unsupported(text)) { failure('unsupported_currency', 'currency_unavailable'); return; }
            stage = 'settle';
            try { await page.waitForLoadState('networkidle', { timeout: remaining(5_000) }); } catch { /* Background requests may keep running. */ }
            stage = 'source_check';
            text = await page.locator('body').innerText();
            if (expired) return;
            if (unsupported(text)) { failure('unsupported_currency', 'currency_unavailable'); return; }
            if ((await page.title()).trim().toLowerCase() !== 'search result') { failure('unexpected_page', 'unrecognized'); return; }
            stage = 'query_check';
            const requestedDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${search.date}T12:00:00Z`)).replace(/ (\d{4})$/, ', $1');
            if (!text.includes(search.from) || !text.includes(search.to) || !text.includes(requestedDate)) { failure('query_mismatch', 'unrecognized'); return; }
            stage = 'parse';
            if (expired) return;
            try { Object.assign(result, parseResults(text, search)); }
            catch (error) { failure('parse_failed', 'unrecognized', undefined, error); }
            return;
          }
        } catch (error) {
          if (expired) return;
          const isTimeout = errorClass(error).includes('Timeout');
          const reason = stage === 'navigation' ? isTimeout ? 'navigation_timeout' : 'network_error' : stage === 'readiness' && isTimeout ? 'result_timeout' : stage === 'context' ? 'context_failed' : 'read_failed';
          failure(reason, 'unavailable', undefined, error);
          retryable = stage === 'navigation' || (stage === 'readiness' && isTimeout);
        } finally {
          const closing = context;
          context = undefined;
          await cleanup(closing);
        }
        if (!retryable || attempt === 1 || deadline - Date.now() <= (options.retryDelayMs ?? 500)) break;
        await new Promise(resolve => setTimeout(resolve, options.retryDelayMs ?? 500));
      }
    }

    try { await timeout(attemptSearch(), remaining(65_000)); }
    catch (error) {
      expired = true;
      failure(error instanceof SourceTimeout ? 'source_timeout' : 'read_failed', 'unavailable', undefined, error);
    } finally {
      expired = true;
      const closing = context;
      context = undefined;
      await cleanup(closing);
    }
    return result;
  }

  try { return await Promise.all(search.airlines.map(read)); }
  finally { await cleanup(browser); }
}
