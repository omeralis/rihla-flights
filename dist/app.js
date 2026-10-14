const cities={PZU:'بورتسودان',CAI:'القاهرة',JED:'جدة',RUH:'الرياض',DXB:'دبي',SHJ:'الشارقة',ADD:'أديس أبابا',EBB:'عنتيبي',DOH:'الدوحة',KRT:'الخرطوم'};
const params=new URLSearchParams(location.search);
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
 const search={from:params.get('from')||'PZU',to:params.get('to')||'CAI',date:params.get('date')||localISO(tomorrow),passengers:Number(params.get('passengers')||1),round:params.get('trip')==='round',returnDate:params.get('return')};
 const requested=[...new Set(params.getAll('airline').filter(a=>Object.hasOwn(providers,a)))];
 if(!requested.length)requested.push('tarco','badr','sudanair');
 document.getElementById('route-title').textContent=`${cities[search.from]||search.from} ← ${cities[search.to]||search.to}`;
 document.getElementById('search-summary').textContent=`${dateText(search.date)}${search.round?` · العودة: ${dateText(search.returnDate)}`:''} · ${search.passengers} مسافر · ${search.round?'ذهاب وعودة':'ذهاب فقط'} · اقتصادية`;
 document.getElementById('edit-link').href=`index.html?${params.toString()}`;
 const filters=[...document.querySelectorAll('.air-filter')];
 filters.forEach(e=>{e.checked=requested.includes(e.value);e.disabled=!requested.includes(e.value);e.addEventListener('change',render)});
 const summary=document.getElementById('source-status'),retry=document.getElementById('retry'),count=document.getElementById('result-count'),sort=document.getElementById('sort');
 let responseData=null,failure='',loading=false;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
 function link(id,label){let url=providers[id].base;try{url=RihlaSearch.build(id,search)}catch{}const a=el('a','primary official-link',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
 function render(){
  list.replaceChildren();const selected=filters.filter(e=>e.checked).map(e=>e.value);
  if(loading){count.textContent='جارٍ البحث لدى الشركات…';summary.textContent='قد يستغرق البحث حتى دقيقة. نقرأ صفحات الشركات الآن.';list.append(el('div','empty-state','✈ جارٍ البحث عن رحلاتك…'));return}
  if(failure){count.textContent='تعذّر إكمال البحث';summary.textContent=failure;selected.forEach(id=>{const box=el('article','flight-card source-card');const body=el('div','source-body');body.append(el('h2','',providers[id].name),link(id,`تابع البحث لدى ${providers[id].name} ↗`));box.append(body);list.append(box)});return}
  if(!selected.length){count.textContent='اختر شركة';summary.textContent='اختر شركة طيران واحدة على الأقل لعرض النتائج.';return}
  if(!responseData)return;
  const sourceList=responseData.sources.filter(s=>selected.includes(s.id));
  const flights=sourceList.flatMap(s=>(s.flights||[]).map(f=>({...f,airline:s.id}))).sort((a,b)=>sort.value==='time'?a.departure.localeCompare(b.departure):a.price-b.price);
  count.textContent=flights.length?`${flights.length} رحلات من المصادر`:sourceList.some(s=>!['ok','no_results'].includes(s.status))?'النتائج غير مكتملة':'لم تظهر رحلات للتاريخ المختار';
  const checked=new Date(responseData.checkedAt);summary.textContent=Number.isNaN(checked.getTime())?'':`آخر تحقق: ${checked.toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})} · السعر كما يعرضه المصدر${search.round?' · راجع إجمالي الذهاب والعودة لدى الشركة':''}`;
  for(const f of flights){
   const card=el('article','flight-card'),top=el('div','flight-top');
   top.append(el('div','airline-name',providers[f.airline].name),el('span','',`${f.leg==='return'?'العودة':'الذهاب'} · ${dateText(f.date)}`));
   const body=el('div','flight-body'),route=el('div','flight-route');
   for(const [airport,time] of [[f.from,f.departure],[f.to,f.arrival]]){
    const box=el('div','airport');box.append(el('strong','',time),el('span','',cities[airport]||airport),el('small','',airport));
    if(airport===f.to&&f.arrivalDayOffset)box.append(el('span','next-day','اليوم التالي'));
    route.append(box);
   }
   const journey=el('div','journey',f.duration),line=el('div','route-line');line.append(el('span','','✈'));journey.append(line,el('span','',f.connection==='Direct'?'رحلة مباشرة':f.connection));route.insertBefore(journey,route.children[1]);
   const price=el('div','price-box');price.append(el('strong','',`${Number(f.price).toLocaleString('en-US',{maximumFractionDigits:2})} ${f.currency}`),el('small','','السعر المعروض لدى الشركة'),link(f.airline,'راجع السعر والحجز ↖'));
   body.append(route,price);const bottom=el('div','flight-bottom');bottom.append(el('span','','بيانات من صفحة الشركة'),el('span','','الإجمالي وشروط السعر يُؤكَّدان عند الحجز'));card.append(top,body,bottom);list.append(card);
  }
  for(const source of sourceList){
   if(source.status==='ok')continue;
   const box=el('article','flight-card source-card'),body=el('div','source-body');
   body.append(el('h2','',providers[source.id].name),el('p','',source.status==='no_results'?'لم يعرض المصدر رحلات للتاريخ والمسار المختارين.':'تعذّر قراءة نتائج هذه الشركة. النتائج المعروضة للشركات الأخرى تبقى متاحة.'),link(source.id,'افتح نتائج الشركة ↗'));box.append(body);list.append(box);
  }
 }
 async function run(){
  loading=true;failure='';retry.disabled=true;render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  try{
   const query=new URLSearchParams({from:search.from,to:search.to,date:search.date,passengers:String(search.passengers),trip:search.round?'round':'oneway'});
   if(search.round)query.set('return',search.returnDate||'');requested.forEach(a=>query.append('airline',a));
   const r=await fetch(`/api/search?${query}`,{signal:controller.signal,cache:'no-store'});const data=await r.json();
   if(!r.ok)throw Error(data.message||'تعذّر إكمال البحث. حاول مجددًا.');
   if(!Array.isArray(data.sources)||data.sources.some(s=>!requested.includes(s.id)||!Array.isArray(s.flights)))throw Error('تعذّر قراءة استجابة البحث.');
   responseData=data;
  }catch(error){responseData=null;failure=error.name==='AbortError'?'استغرق البحث وقتًا أطول من المتوقع. حاول مجددًا أو افتح نتائج الشركة.':error.message||'تعذّر الاتصال بخدمة البحث.'}
  finally{clearTimeout(timer);loading=false;retry.disabled=false;render()}
 }
 sort.addEventListener('change',render);retry.addEventListener('click',run);run();
}
