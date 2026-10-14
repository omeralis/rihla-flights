const cities={PZU:'بورتسودان',CAI:'القاهرة',JED:'جدة',RUH:'الرياض',DXB:'دبي',SHJ:'الشارقة',ADD:'أديس أبابا',EBB:'عنتيبي',DOH:'الدوحة',KRT:'الخرطوم'};
const params=new URLSearchParams(location.search);
const currencies=RihlaSearch.currencies;
const selectedCurrency=Object.hasOwn(currencies,params.get('currency'))?params.get('currency'):'SDG';
const today=new Date(); const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
const validDate=RihlaSearch.dateValid;
const dateText=s=>validDate(s)?new Date(`${s}T12:00:00`).toLocaleDateString('ar',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'';
document.querySelectorAll('.year').forEach(e=>e.textContent=today.getFullYear());
const form=document.getElementById('search-form');
if(form){
 const from=document.getElementById('from'),to=document.getElementById('to'),date=document.getElementById('date'),backDate=document.getElementById('return-date');
 for(const [code,name] of Object.entries(cities)){for(const select of [from,to]){const option=new Option(`${name} (${code})`,code);select.add(option)}}
 from.value=cities[params.get('from')]?params.get('from'):'PZU';to.value=cities[params.get('to')]?params.get('to'):'CAI';
 date.min=localISO(today);date.value=validDate(params.get('date'))&&params.get('date')>=date.min?params.get('date'):localISO(tomorrow);
 form.elements.passengers.value=/^[1-6]$/.test(params.get('passengers')||'')?params.get('passengers'):'1';
 form.elements.currency.value=selectedCurrency;
 const selected=params.getAll('airline');if(selected.length)form.querySelectorAll('[name=airline]').forEach(e=>e.checked=selected.includes(e.value));
 function setTrip(){const round=document.querySelector('[name=trip]:checked').value==='round';document.querySelector('.return-field').hidden=!round;backDate.disabled=!round;backDate.required=round;backDate.min=date.value; if(!backDate.value||backDate.value<date.value){const d=new Date(`${date.value}T12:00:00`);d.setDate(d.getDate()+7);backDate.value=localISO(d)}}
 if(params.get('trip')==='round')document.querySelector('[name=trip][value=round]').checked=true;
 if(validDate(params.get('return')))backDate.value=params.get('return');setTrip();
 document.querySelectorAll('[name=trip]').forEach(e=>e.addEventListener('change',setTrip));date.addEventListener('change',setTrip);
 document.getElementById('swap').addEventListener('click',()=>{const old=from.value;from.value=to.value;to.value=old});
 form.addEventListener('submit',e=>{let message='';if(from.value===to.value)message='اختر مدينة وصول مختلفة عن مدينة المغادرة.';else if(!form.querySelector('[name=airline]:checked'))message='اختر شركة طيران واحدة على الأقل.';else if(!backDate.disabled&&backDate.value<date.value)message='تاريخ العودة يجب أن يكون بعد تاريخ المغادرة أو في اليوم نفسه.';const error=document.getElementById('form-error');error.hidden=!message;error.textContent=message;if(message)e.preventDefault()});
}
const list=document.getElementById('flight-list');
if(list){
 const providers=RihlaSearch.providers;
 const search={from:params.get('from')||'PZU',to:params.get('to')||'CAI',date:params.get('date')||localISO(tomorrow),passengers:Number(params.get('passengers')||1),round:params.get('trip')==='round',returnDate:params.get('return'),currency:selectedCurrency};
 const requested=[...new Set(params.getAll('airline').filter(a=>Object.hasOwn(providers,a)))];
 if(!requested.length)requested.push('tarco','badr','sudanair');
 document.getElementById('route-title').textContent=`${cities[search.from]||search.from} ← ${cities[search.to]||search.to}`;
 function updateSearchSummary(){
  document.getElementById('search-summary').textContent=`${dateText(search.date)}${search.round?` · العودة: ${dateText(search.returnDate)}`:''} · ${search.passengers} مسافر · ${search.round?'ذهاب وعودة':'ذهاب فقط'} · ${currencies[search.currency]}`;
  params.set('currency',search.currency);
  document.getElementById('edit-link').href=`index.html?${params.toString()}`;
 }
 updateSearchSummary();
 const filters=[...document.querySelectorAll('.air-filter')];
 filters.forEach(e=>{e.checked=requested.includes(e.value);e.disabled=!requested.includes(e.value);e.addEventListener('change',render)});
 const summary=document.getElementById('source-status'),retry=document.getElementById('retry'),count=document.getElementById('result-count'),sort=document.getElementById('sort'),currencyFilter=document.getElementById('currency-filter');
 currencyFilter.value=search.currency;
 let responseData=null,failure='',loading=false;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
 function icon(path,cls=''){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',width:'18',height:'18'}))svg.setAttribute(key,value);
  if(cls)svg.setAttribute('class',cls);
  const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',path);svg.append(shape);return svg;
 }
 function link(id,label){let url=providers[id].base;try{url=RihlaSearch.build(id,search)}catch{}const a=el('a','primary official-link',label.replace(/\s*[↖↗]$/,''));a.append(icon('M6 18 18 6M6 6h12v12'));a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
 function render(){
  list.setAttribute('aria-busy',String(loading));
  list.replaceChildren();const selected=filters.filter(e=>e.checked).map(e=>e.value);
  if(loading){count.textContent='جارٍ البحث لدى الشركات…';summary.textContent='قد يستغرق البحث حتى دقيقة. نقرأ صفحات الشركات الآن.';list.append(el('div','empty-state loading-state','جارٍ البحث عن رحلاتك…'));return}
  if(failure){count.textContent='تعذّر إكمال البحث';summary.textContent=failure;selected.forEach(id=>{const box=el('article','flight-card source-card');box.dataset.airline=id;const body=el('div','source-body');body.append(el('h2','',providers[id].name),link(id,`تابع البحث لدى ${providers[id].name} ↗`));box.append(body);list.append(box)});return}
  if(!selected.length){count.textContent='اختر شركة';summary.textContent='اختر شركة طيران واحدة على الأقل لعرض النتائج.';return}
  if(!responseData)return;
  const sourceList=responseData.sources.filter(s=>selected.includes(s.id));
  const flights=sourceList.flatMap(s=>(s.flights||[]).map(f=>({...f,airline:s.id}))).sort((a,b)=>sort.value==='time'?a.departure.localeCompare(b.departure):a.price-b.price);
  count.textContent=flights.length?`${flights.length} رحلات من المصادر`:sourceList.every(s=>s.status==='blocked')?'مصادر الحجز رفضت الاتصال':sourceList.some(s=>!['ok','no_results'].includes(s.status))?'النتائج غير مكتملة':'لم تظهر رحلات للتاريخ المختار';
  const checked=new Date(responseData.checkedAt);summary.textContent=Number.isNaN(checked.getTime())?'':`آخر تحقق: ${checked.toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})} · السعر كما يعرضه المصدر${search.round?' · راجع إجمالي الذهاب والعودة لدى الشركة':''}`;
  for(const f of flights){
   const card=el('article','flight-card'),top=el('div','flight-top');
   card.dataset.airline=f.airline;
   const airlineName=el('div','airline-name');airlineName.append(el('span','airline-mark',{tarco:'TC',badr:'J4',sudanair:'SD'}[f.airline]),el('span','',providers[f.airline].name));
   top.append(airlineName,el('span','',`${f.leg==='return'?'العودة':'الذهاب'} · ${dateText(f.date)}`));
   const body=el('div','flight-body'),route=el('div','flight-route');
   for(const [airport,time] of [[f.from,f.departure],[f.to,f.arrival]]){
    const box=el('div','airport');box.append(el('strong','',time),el('span','',cities[airport]||airport),el('small','',airport));
    if(airport===f.to&&f.arrivalDayOffset)box.append(el('span','next-day','اليوم التالي'));
    route.append(box);
   }
   const journey=el('div','journey',f.duration),line=el('div','route-line');line.append(icon('m21 3-8 18-3-8-7-3 18-7Zm0 0L10 13','journey-plane'));journey.append(line,el('span','',f.connection==='Direct'?'رحلة مباشرة':f.connection));route.insertBefore(journey,route.children[1]);
   const price=el('div','price-box');price.append(el('strong','',`${Number(f.price).toLocaleString('en-US',{maximumFractionDigits:2})} ${f.currency==='SDG'?'ج.س':f.currency==='SAR'?'ر.س':f.currency}`),el('small','','السعر المعروض لدى الشركة'),link(f.airline,'راجع السعر والحجز ↖'));
   body.append(route,price);const bottom=el('div','flight-bottom');bottom.append(el('span','','بيانات من صفحة الشركة'),el('span','','الإجمالي وشروط السعر يُؤكَّدان عند الحجز'));card.append(top,body,bottom);list.append(card);
  }
  for(const source of sourceList){
   if(source.status==='ok')continue;
   const box=el('article','flight-card source-card'),body=el('div','source-body');box.dataset.airline=source.id;
   const message=source.status==='no_results'?'لم يعرض المصدر رحلات للتاريخ والمسار المختارين.':source.status==='currency_unavailable'?source.reason==='unsupported_currency'?`هذه الشركة لا تدعم البحث بعملة ${currencies[search.currency]}. اختر عملة أخرى.`:`لم يعرض المصدر سعرًا بعملة ${currencies[search.currency]}. جرّب عملة أخرى أو راجع الشركة.`:source.status==='blocked'?source.httpStatus===429?'الشركة تحدّ عدد طلبات البحث. انتظر قليلًا أو تابع البحث في موقعها مباشرة.':'رفض موقع الشركة اتصال خدمة البحث. تابع البحث في موقع الشركة مباشرة.':source.reason?.includes('timeout')?'استغرق رد الشركة وقتًا طويلًا. حاول تحديث البحث أو افتح موقع الشركة.':source.status==='unrecognized'?source.reason==='query_mismatch'?'أعادت الشركة نتائج لا تطابق تاريخ أو مسار البحث. راجع نتائجها في موقع الشركة مباشرة.':'لم نستطع التحقق من بيانات صفحة الشركة. راجع النتائج في موقعها مباشرة.':'تعذّر الاتصال بالشركة. حاول تحديث البحث أو افتح موقعها مباشرة.';
   body.append(el('h2','',providers[source.id].name),el('p','',message),link(source.id,'افتح نتائج الشركة ↗'));box.append(body);list.append(box);
  }
 }
 async function run(){
  if(loading)return;
  loading=true;failure='';responseData=null;retry.disabled=true;currencyFilter.disabled=true;render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  try{
   const query=new URLSearchParams({from:search.from,to:search.to,date:search.date,passengers:String(search.passengers),trip:search.round?'round':'oneway',currency:search.currency});
   if(search.round)query.set('return',search.returnDate||'');requested.forEach(a=>query.append('airline',a));
   const r=await fetch(`/api/search?${query}`,{signal:controller.signal,cache:'no-store'});const data=await r.json();
   if(!r.ok)throw Error(data.message||'تعذّر إكمال البحث. حاول مجددًا.');
   if(!Array.isArray(data.sources)||data.sources.some(s=>!requested.includes(s.id)||!Array.isArray(s.flights)))throw Error('تعذّر قراءة استجابة البحث.');
   responseData=data;
  }catch(error){responseData=null;failure=error.name==='AbortError'?'استغرق البحث وقتًا أطول من المتوقع. حاول مجددًا أو افتح نتائج الشركة.':error.message||'تعذّر الاتصال بخدمة البحث.'}
  finally{clearTimeout(timer);loading=false;retry.disabled=false;currencyFilter.disabled=false;render()}
 }
 currencyFilter.addEventListener('change',()=>{search.currency=currencyFilter.value;updateSearchSummary();history.replaceState(null,'',`results.html?${params.toString()}`);run()});
 sort.addEventListener('change',render);retry.addEventListener('click',run);run();
}
