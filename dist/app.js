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
const list=document.getElementById('flight-list');
if(list){
 const from=cities[params.get('from')]?params.get('from'):'PZU',to=cities[params.get('to')]?params.get('to'):'CAI';
 const date=validDate(params.get('date'))?params.get('date'):localISO(tomorrow),passengers=/^[1-6]$/.test(params.get('passengers')||'')?Number(params.get('passengers')):1;
 const round=params.get('trip')==='round',returnDate=validDate(params.get('return'))?params.get('return'):date;
 document.getElementById('route-title').textContent=`${cities[from]} ← ${cities[to]}`;
 document.getElementById('search-summary').textContent=`${dateText(date)}${round?` · العودة: ${dateText(returnDate)}`:''} · ${passengers} ${passengers===1?'مسافر':'مسافرين'} · ${round?'ذهاب وعودة':'ذهاب فقط'} · اقتصادية`;
 document.getElementById('edit-link').href=`index.html?${params.toString()}`;
 const chosen=params.getAll('airline');document.querySelectorAll('.air-filter').forEach(e=>{e.checked=chosen.length?chosen.includes(e.value):true;e.addEventListener('change',render)});
 const flights=[{airline:'tarco',number:'412',departure:'07:30',arrival:'10:10',duration:'ساعتان و40 دقيقة',price:215},{airline:'badr',number:'620',departure:'10:15',arrival:'13:00',duration:'ساعتان و45 دقيقة',price:235},{airline:'sudanair',number:'204',departure:'14:00',arrival:'16:50',duration:'ساعتان و50 دقيقة',price:250},{airline:'tarco',number:'416',departure:'17:30',arrival:'20:10',duration:'ساعتان و40 دقيقة',price:265},{airline:'badr',number:'626',departure:'20:00',arrival:'22:45',duration:'ساعتان و45 دقيقة',price:280}];
 const money=n=>n.toLocaleString('en-US');
 function render(){const selected=[...document.querySelectorAll('.air-filter:checked')].map(e=>e.value),time=document.getElementById('time-filter').value,sort=document.getElementById('sort').value;const results=from===to?[]:flights.filter(f=>selected.includes(f.airline)&&(time==='all'||(time==='morning'?Number(f.departure.slice(0,2))<12:Number(f.departure.slice(0,2))>=12))).sort((a,b)=>sort==='price'?a.price-b.price:a.departure.localeCompare(b.departure));document.getElementById('result-count').textContent=`${results.length} رحلات تجريبية`;list.replaceChildren();
 if(!results.length){list.innerHTML='<div class="empty-state"><span style="font-size:40px">⌕</span><h2>لا توجد نتائج تطابق اختيارك</h2><p>جرّب تغيير شركات الطيران أو وقت المغادرة.</p><a class="back" href="index.html">ابدأ بحثًا جديدًا ←</a></div>';return}
 results.forEach((f,i)=>{const a=airlines[f.airline],price=f.price*passengers*(round?2:1);const card=document.createElement('article');card.className='flight-card';card.innerHTML=`<div class="flight-top"><div class="airline-name" style="color:${a.color}"><span class="airline-mark">${a.code}</span>${a.name}</div><span>نموذج رحلة · ${a.code} ${f.number}</span></div><div class="flight-body"><div class="flight-route"><div class="airport"><strong>${f.departure}</strong><span>${cities[from]}</span><small>${from}</small></div><div class="journey">${f.duration}<div class="route-line"><span>✈</span></div><span>نموذج رحلة مباشرة</span></div><div class="airport"><strong>${f.arrival}</strong><span>${cities[to]}</span><small>${to}</small></div></div><div class="price-box"><div><strong>${money(price)} <span style="font-size:12px">USD</span></strong><small>إجمالي تجريبي لـ ${passengers} ${passengers===1?'مسافر':'مسافرين'}</small></div><button class="primary" type="button">تفاصيل الرحلة ↖</button></div></div><div class="flight-bottom"><span>▣ الدرجة الاقتصادية</span><span>◷ أوقات توضيحية</span>${round?'<span>↔ يشمل نموذج العودة</span>':''}</div>`;
 card.querySelector('button').addEventListener('click',()=>{const content=document.getElementById('details-content');content.replaceChildren();const rows=[['شركة الطيران',a.name],['المسار',`${cities[from]} ← ${cities[to]}`],['تاريخ المغادرة',dateText(date)],['وقت المغادرة والوصول',`${f.departure} — ${f.arrival}`],['المسافرون',String(passengers)],['السعر التجريبي الإجمالي',`${money(price)} USD`]];if(round)rows.push(['تاريخ العودة',dateText(returnDate)],['نموذج العودة',`${cities[to]} ← ${cities[from]} · 10:00 — 12:45`]);rows.forEach(([label,value])=>{const row=document.createElement('div');row.className='detail-row';const l=document.createElement('span'),v=document.createElement('b');l.textContent=label;v.textContent=value;row.append(l,v);content.append(row)});document.getElementById('details').showModal()});list.append(card)})}
 document.getElementById('time-filter').addEventListener('change',render);document.getElementById('sort').addEventListener('change',render);document.querySelectorAll('.close,.close-details').forEach(e=>e.addEventListener('click',()=>document.getElementById('details').close()));render();
}
