const cities={PZU:'بورتسودان',CAI:'القاهرة',JED:'جدة',RUH:'الرياض',DXB:'دبي',SHJ:'الشارقة',ADD:'أديس أبابا',EBB:'عنتيبي',DOH:'الدوحة',KRT:'الخرطوم'};
const airlines={tarco:{name:'تاركو',code:'TC',color:'#355c48'},badr:{name:'بدر',code:'J4',color:'#344f64'},sudanair:{name:'سودانير',code:'SD',color:'#9b7340'}};
const params=new URLSearchParams(location.search);
const today=new Date(); const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s));
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
const sources={
 tarco:{name:'تاركو',code:'TC',url:'https://fo-emea.ttinteractive.com/zenith/frontoffice/tarcoair/en-GB/BookingEngine/SearchFlights'},
 badr:{name:'بدر',code:'J4',url:'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/badrairlines/en-GB/BookingEngine/SearchFlights'},
 sudanair:{name:'سودانير',code:'SD',url:'https://emea.ttinteractive.com/Zenith/FrontOffice/SudanAirways/en-GB/BookingEngine/SearchFlights'}
};
const list=document.getElementById('flight-list');
if(list){
 const from=cities[params.get('from')]?params.get('from'):'PZU',to=cities[params.get('to')]?params.get('to'):'CAI';
 const date=validDate(params.get('date'))?params.get('date'):localISO(tomorrow),passengers=/^[1-6]$/.test(params.get('passengers')||'')?Number(params.get('passengers')):1;
 const round=params.get('trip')==='round',returnDate=validDate(params.get('return'))?params.get('return'):date;
 document.getElementById('route-title').textContent=`${cities[from]} ← ${cities[to]}`;
 document.getElementById('search-summary').textContent=`${dateText(date)}${round?` · العودة: ${dateText(returnDate)}`:''} · ${passengers} ${passengers===1?'مسافر':'مسافرين'} · ${round?'ذهاب وعودة':'ذهاب فقط'} · اقتصادية`;
 document.getElementById('edit-link').href=`index.html?${params.toString()}`;
 const chosen=params.getAll('airline');
 const filters=[...document.querySelectorAll('.air-filter')];
 filters.forEach(e=>{e.checked=chosen.length?chosen.includes(e.value):true;e.addEventListener('change',check)});
 const summary=document.getElementById('source-status'),retry=document.getElementById('retry');
 let pending,requestId=0;
 function render(ids,statuses,loading=false){
  list.replaceChildren();document.getElementById('result-count').textContent=`${ids.length} ${ids.length===1?'مصدر بحث':'مصادر بحث'}`;
  if(!ids.length){summary.textContent='اختر شركة طيران واحدة على الأقل.';return}
  summary.textContent=loading?'جارٍ التحقق من إمكانية الوصول إلى مصادر الحجز…':'لا توجد بيانات رحلات مؤكدة متاحة للعرض داخل الموقع.';
  ids.forEach(id=>{
   const source=sources[id],status=statuses[id];
   const card=document.createElement('article');card.className='flight-card source-card';
   const top=document.createElement('div');top.className='flight-top';
   const name=document.createElement('div');name.className='airline-name';
   const mark=document.createElement('span');mark.className='airline-mark';mark.textContent=source.code;
   name.append(mark,document.createTextNode(source.name));
   const badge=document.createElement('span');badge.textContent=loading?'جارٍ التحقق…':status==='blocked'?'الوصول غير متاح':'البيانات غير متاحة';
   top.append(name,badge);
   const body=document.createElement('div');body.className='source-body';
   const text=document.createElement('p');text.textContent=loading?'نتحقق من إمكانية قراءة صفحة الحجز.':status==='blocked'?'موقع الشركة رفض قراءة صفحته آليًا عبر هذه الخدمة.':status==='integration_required'?'صفحة الحجز متاحة، لكن عرض الرحلات والأسعار هنا يحتاج إلى ربط مصدر بيانات الشركة.':'تعذّر التحقق من صفحة الشركة. يمكنك متابعة البحث من الرابط الأصلي.';
   const link=document.createElement('a');link.className='primary official-link';link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`افتح صفحة حجز ${source.name} ↗`;
   const note=document.createElement('small');note.textContent='ستفتح صفحة الشركة في نافذة جديدة. أعد إدخال المدن والتواريخ وعدد المسافرين هناك.';
   body.append(text,link,note);card.append(top,body);list.append(card);
  });
 }
 async function check(){
  const id=++requestId;pending?.abort();const controller=new AbortController();pending=controller;
  const selected=filters.filter(e=>e.checked).map(e=>e.value);render(selected,{},true);retry.disabled=true;
  if(!selected.length){retry.disabled=false;return}
  const query=new URLSearchParams();selected.forEach(a=>query.append('airline',a));
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(`/api/sources?${query}`,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('Source check failed');
   const data=await response.json();if(!Array.isArray(data.sources))throw Error('Invalid source response');
   if(id!==requestId)return;
   const statuses={};data.sources.forEach(s=>{if(s&&selected.includes(s.id)&&['blocked','integration_required','unavailable'].includes(s.status))statuses[s.id]=s.status});
   render(selected,statuses);
  }catch{if(id===requestId)render(selected,{})}
  finally{clearTimeout(timer);if(id===requestId)retry.disabled=false}
 }
 retry.addEventListener('click',check);check();
}
