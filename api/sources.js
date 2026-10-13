const SOURCES = Object.freeze({
  tarco: { name: 'تاركو', url: 'https://fo-emea.ttinteractive.com/zenith/frontoffice/tarcoair/en-GB/BookingEngine/SearchFlights' },
  badr: { name: 'بدر', url: 'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/badrairlines/en-GB/BookingEngine/SearchFlights' },
  sudanair: { name: 'سودانير', url: 'https://emea.ttinteractive.com/Zenith/FrontOffice/SudanAirways/en-GB/BookingEngine/SearchFlights' }
});

// This endpoint checks access to the supplied booking pages. A successful page
// response does not establish flight availability, fares, or API integration.
// Never generate offers or treat a source error as an empty flight search.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = new URL(req.url, 'https://rihla.invalid');
  const selected = [...new Set(url.searchParams.getAll('airline'))];
  if (!selected.length || selected.length > 3 || selected.some(id => !Object.hasOwn(SOURCES, id))) {
    return res.status(400).json({ error: 'INVALID_AIRLINES' });
  }
  const sources = await Promise.all(selected.map(async id => {
    const source = SOURCES[id];
    const result = { id, name: source.name, url: source.url, status: 'unavailable' };
    try {
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(10000), redirect: 'manual',
        headers: { Accept: 'text/html', 'User-Agent': 'Rihla/1.0 (booking source availability check)' }
      });
      result.httpStatus = response.status;
      result.status = [401, 403, 429].includes(response.status) ? 'blocked'
        : response.ok ? 'integration_required' : 'unavailable';
      await response.body?.cancel();
    } catch {
      result.status = 'unavailable';
    }
    return result;
  }));
  return res.status(200).json({ sources, checkedAt: new Date().toISOString(), flightDataAvailable: false });
};
