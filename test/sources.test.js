const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/sources');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
async function request(query, method = 'GET') {
  const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n;return this; }, json(data) { this.data=data;return this; } };
  await handler({method, url:'/api/sources?'+query}, res);
  return res;
}
test('rejects unknown sources before making any request', async () => {
  global.fetch = () => { throw Error('must not fetch'); };
  assert.equal((await request('airline=https://example.com')).code,400);
  assert.equal((await request('')).code,400);
  assert.equal((await request('airline=constructor')).code,400);
  assert.equal((await request('airline=tarco','POST')).code,405);
});
test('reports a blocked source without invented offers', async () => {
  global.fetch = async () => new Response('',{status:403});
  const r=await request('airline=tarco');
  assert.equal(r.data.sources[0].status,'blocked');
  assert.equal(r.data.sources[0].httpStatus,403);
  assert.equal(r.data.flightDataAvailable,false);
  assert.equal(r.data.flights,undefined);
});
test('a readable booking page is not treated as flight data', async () => {
  global.fetch = async () => new Response('<html>Booking form</html>');
  const r=await request('airline=tarco&airline=badr');
  assert.equal(r.data.sources.length,2);
  assert.ok(r.data.sources.every(s=>s.status==='integration_required'));
  assert.equal(r.data.flightDataAvailable,false);
});
test('one failing source does not hide the other sources', async () => {
  global.fetch = async url => { if(url.includes('tarcoair')) throw Error('timeout'); return new Response('',{status:403}); };
  const r=await request('airline=tarco&airline=badr&airline=tarco');
  assert.deepEqual(r.data.sources.map(s=>s.status),['unavailable','blocked']);
  assert.equal(r.headers['Cache-Control'],'no-store');
});
