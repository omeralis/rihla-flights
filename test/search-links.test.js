const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build,dateValid,currencies}=require('../dist/search-links');
const search={from:'PZU',to:'CAI',date:'2026-10-21',passengers:3,round:false};
test('passes the actual route, date and adult count using Zenith fields',()=>{
 const url=new URL(build('tarco',search,{embedded:true}));
 assert.equal(url.origin,'https://fo-emea.ttinteractive.com');
 assert.equal(url.pathname,'/Zenith/FrontOffice/tarcoair/en-GB/BookingEngine/SearchResult');
 assert.equal(url.searchParams.get('OriginAirportCode'),'PZU');
 assert.equal(url.searchParams.get('DestinationAirportCode'),'CAI');
 assert.equal(url.searchParams.get('OutboundDate'),'2026-10-21');
 assert.equal(url.searchParams.get('TravelerTypes[0].Key'),'AD');
 assert.equal(url.searchParams.get('TravelerTypes[0].Value'),'3');
 assert.equal(url.searchParams.get('TravelerTypes[1].Value'),'0');
 assert.equal(url.searchParams.get('TravelerTypes[2].Value'),'0');
 assert.equal(url.searchParams.get('mode'),'iframe');
 assert.equal(url.searchParams.has('InboundDate'),false);
 assert.equal(url.searchParams.get('Currency'),'SDG');
});
test('defaults to Sudanese pounds in every airline booking link',()=>{
 for(const id of ['tarco','badr','sudanair']){
  const url=new URL(build(id,search));
  assert.equal(url.searchParams.get('Currency'),'SDG');
 }
});
test('preserves each selected currency for every airline',()=>{
 assert.deepEqual(Object.keys(currencies),['SDG','SAR','USD']);
 for(const id of ['tarco','badr','sudanair']){
  for(const currency of ['SDG','SAR','USD']){
   const url=new URL(build(id,{...search,currency}));
   assert.equal(url.searchParams.get('Currency'),currency);
   assert.equal(url.searchParams.getAll('Currency').length,1);
  }
 }
});
test('rejects unsupported or malformed currencies',()=>{
 for(const currency of ['EUR','','SAR&Currency=USD','constructor','usd']){
  assert.throws(()=>build('badr',{...search,currency}),/Invalid currency/);
 }
});
test('preserves round-trip details for all three airline tenants',()=>{
 for(const id of ['tarco','badr','sudanair']){
  const url=new URL(build(id,{...search,round:true,returnDate:'2026-10-28'}));
  assert.equal(url.searchParams.get('InboundDate'),'2026-10-28');
  assert.equal(url.searchParams.has('mode'),false);
 }
 assert.equal(new URL(build('sudanair',search)).hostname,'emea.ttinteractive.com');
});
test('rejects invalid dates, routes and destinations outside the provider list',()=>{
 assert.equal(dateValid('2026-02-31'),false);
 assert.throws(()=>build('constructor',search));
 assert.throws(()=>build('https://example.com',search));
 assert.throws(()=>build('tarco',{...search,date:'2026-02-31'}));
 assert.throws(()=>build('tarco',{...search,passengers:0}));
 assert.throws(()=>build('tarco',{...search,to:'PZU'}));
 assert.throws(()=>build('tarco',{...search,round:true,returnDate:'2026-10-20'}));
});
