(function(root){
 const providers=Object.freeze({
  tarco:{name:'تاركو',base:'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/tarcoair/en-GB'},
  badr:{name:'بدر',base:'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/badrairlines/en-GB'},
  sudanair:{name:'سودانير',base:'https://emea.ttinteractive.com/Zenith/FrontOffice/SudanAirways/en-GB'}
 });
 const currencies=Object.freeze({USD:'الدولار الأمريكي',SDG:'الجنيه السوداني'});
 function dateValid(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
 }
 function build(id,search,{embedded=false}={}){
  if(!Object.hasOwn(providers,id))throw Error('Unknown airline');
  if(!/^[A-Z]{3}$/.test(search.from)||!/^[A-Z]{3}$/.test(search.to)||search.from===search.to)throw Error('Invalid route');
  if(!dateValid(search.date)||!Number.isInteger(search.passengers)||search.passengers<1||search.passengers>6)throw Error('Invalid search');
  if(search.round&&(!dateValid(search.returnDate)||search.returnDate<search.date))throw Error('Invalid return date');
  const currency=search.currency??'USD';
  if(!Object.hasOwn(currencies,currency))throw Error('Invalid currency');
  const url=new URL(`${providers[id].base}/BookingEngine/SearchResult`);
  url.searchParams.set('OriginAirportCode',search.from);
  url.searchParams.set('DestinationAirportCode',search.to);
  url.searchParams.set('OutboundDate',search.date);
  if(search.round)url.searchParams.set('InboundDate',search.returnDate);
  [['AD',search.passengers],['CHD',0],['INF',0]].forEach(([type,count],i)=>{
   url.searchParams.set(`TravelerTypes[${i}].Key`,type);
   url.searchParams.set(`TravelerTypes[${i}].Value`,String(count));
  });
  url.searchParams.set('Currency',currency);
  if(embedded)url.searchParams.set('mode','iframe');
  return url.href;
 }
 const api={providers,currencies,dateValid,build};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.RihlaSearch=api;
})(typeof globalThis!=='undefined'?globalThis:this);
