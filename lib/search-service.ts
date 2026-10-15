import { searchAirlines } from './search-airlines';
import { validate, type SearchCriteria, type SearchResponse, type SourceResult } from './search';

export function createSearchHandler(reader: (search: SearchCriteria) => Promise<SourceResult[]> = searchAirlines, now = Date.now) {
  const cache = new Map<string, { until: number; payload: SearchResponse }>();
  let busy = false;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
  return async function search(request: Request): Promise<Response> {
    let criteria: SearchCriteria;
    try { criteria = validate(new URL(request.url).searchParams); }
    catch (error) { return json({ error: 'INVALID_SEARCH', message: (error as Error).message }, 400); }
    const key = JSON.stringify({ ...criteria, airlines: [...criteria.airlines].sort() });
    for (const [oldKey, entry] of cache) if (entry.until <= now()) cache.delete(oldKey);
    const cached = cache.get(key);
    if (cached) return json(cached.payload);
    if (busy) return json({ error: 'BUSY', message: 'يجري بحث آخر حاليًا. حاول مجددًا بعد قليل.' }, 429, { 'Retry-After': '15' });
    busy = true;
    try {
      const sources = await reader(criteria);
      const payload: SearchResponse = { search: criteria, sources, checkedAt: new Date(now()).toISOString() };
      if (sources.every(source => ['ok', 'no_results'].includes(source.status)) && cache.size < 100) cache.set(key, { until: now() + 30_000, payload });
      return json(payload);
    } catch (error) {
      console.error('Flight search engine failed', { errorClass: error instanceof Error ? error.name : 'Error' });
      return json({ error: 'SOURCE_UNAVAILABLE', message: 'تعذّر تشغيل البحث لدى الشركات. حاول مجددًا أو افتح صفحة الشركة.' }, 503);
    } finally { busy = false; }
  };
}
