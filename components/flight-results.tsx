'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { airlineIds, bookingUrl, cities, currencies, dateText, providers, searchParams, sortOffers, type Airline, type Currency, type Flight, type SearchCriteria, type SearchResponse, type SourceResult } from '@/lib/search';
import { Icon } from './icon';

function BookingLink({ id, search, source, children }: { id: Airline; search: SearchCriteria; source?: SourceResult; children: React.ReactNode }) {
  const actualSearch = { ...search, currency: source?.currency ?? search.currency };
  return <a className="primary official-link" href={bookingUrl(id, actualSearch, source?.dateCorrectionAttempted)} target="_blank" rel="noopener noreferrer">{children}<Icon name="arrow" width="14" height="14" /></a>;
}

function FlightCard({ flight, id, search, source }: { flight: Flight; id: Airline; search: SearchCriteria; source: SourceResult }) {
  return <article className="flight-card" data-airline={id}>
    <div className="flight-top"><div className="airline-name"><span className="airline-mark">{providers[id].code}</span><span>{providers[id].name}</span></div><span>{flight.leg === 'return' ? 'العودة' : 'الذهاب'} · {dateText(flight.date)}</span></div>
    <div className="flight-body"><div className="flight-route">
      <div className="airport"><strong>{flight.departure}</strong><span>{cities[flight.from]}</span><small>{flight.from}</small></div>
      <div className="journey">{flight.duration}<div className="route-line"><Icon className="journey-plane" /></div><span>{flight.connection === 'Direct' ? 'رحلة مباشرة' : flight.connection}</span></div>
      <div className="airport"><strong>{flight.arrival}</strong><span>{cities[flight.to]}</span><small>{flight.to}</small>{flight.arrivalDayOffset ? <span className="next-day">اليوم التالي</span> : null}</div>
    </div><div className="price-box"><strong>{flight.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} {flight.currency === 'SDG' ? 'ج.س' : flight.currency === 'SAR' ? 'ر.س' : flight.currency}</strong><small className={flight.currency !== search.currency ? 'currency-fallback' : undefined}>{flight.currency !== search.currency ? `السعر بعملة ${currencies[flight.currency]} بدلًا من ${currencies[search.currency]}` : 'السعر المعروض لدى الشركة'}</small><BookingLink id={id} search={{ ...search, currency: flight.currency }} source={{ ...source, currency: flight.currency }}>راجع السعر والحجز</BookingLink></div></div>
    <div className="flight-bottom"><span>بيانات من صفحة الشركة</span><span>الإجمالي وشروط السعر يُؤكَّدان عند الحجز</span></div>
  </article>;
}

function sourceMessage(source: SourceResult, currency: Currency) {
  if (source.status === 'no_results') return 'لم يعرض المصدر رحلات للتاريخ والمسار المختارين.';
  if (source.status === 'currency_unavailable') return source.attemptedCurrencies && source.attemptedCurrencies.length > 1 ? `لم تعرض الشركة سعرًا بالعملات التي جُرّبت: ${source.attemptedCurrencies.map(code => currencies[code]).join('، ')}. راجع الشركة مباشرة.` : source.reason === 'unsupported_currency' ? `هذه الشركة لا تدعم البحث بعملة ${currencies[currency]}. اختر عملة أخرى.` : `لم يعرض المصدر سعرًا بعملة ${currencies[currency]}. جرّب عملة أخرى أو راجع الشركة.`;
  if (source.status === 'blocked') return source.httpStatus === 429 ? 'الشركة تحدّ عدد طلبات البحث. انتظر قليلًا أو تابع البحث في موقعها مباشرة.' : 'رفض موقع الشركة اتصال خدمة البحث. تابع البحث في موقع الشركة مباشرة.';
  if (source.reason?.includes('timeout')) return 'استغرق رد الشركة وقتًا طويلًا. حاول تحديث البحث أو افتح موقع الشركة.';
  if (source.status === 'unrecognized') return source.queryMismatch === 'date' && source.observedDate ? `لم نتمكن من تأكيد رحلات لتاريخك؛ عرضت الشركة تاريخ ${dateText(source.observedDate)}. راجع تاريخ السفر في موقعها مباشرة.` : source.reason === 'query_mismatch' ? 'أعادت الشركة نتائج لا تطابق تاريخ أو مسار البحث. راجع نتائجها في موقع الشركة مباشرة.' : 'لم نستطع التحقق من بيانات صفحة الشركة. راجع النتائج في موقعها مباشرة.';
  return 'تعذّر الاتصال بالشركة. حاول تحديث البحث أو افتح موقعها مباشرة.';
}

export function FlightResults({ initial }: { initial: SearchCriteria }) {
  const [search, setSearch] = useState(initial);
  const [selected, setSelected] = useState(initial.airlines);
  const [sort, setSort] = useState('price');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const query = searchParams(search).toString();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 90_000);
    setLoading(true); setFailure(''); setData(null);
    async function run() {
      try {
        const response = await fetch(`/api/search?${query}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw Error(body.message || 'تعذّر إكمال البحث. حاول مجددًا.');
        if (!Array.isArray(body.sources) || body.sources.some((source: SourceResult) => !initial.airlines.includes(source.id) || !Array.isArray(source.flights))) throw Error('تعذّر قراءة استجابة البحث.');
        if (active) setData(body);
      } catch (error) {
        if (active) setFailure(controller.signal.aborted ? 'استغرق البحث وقتًا أطول من المتوقع. حاول مجددًا أو افتح نتائج الشركة.' : error instanceof Error ? error.message : 'تعذّر الاتصال بخدمة البحث.');
      } finally { clearTimeout(timer); if (active) setLoading(false); }
    }
    void run();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, refresh, initial.airlines]);

  function changeCurrency(currency: Currency) {
    const updated = { ...search, currency };
    setLoading(true); setSearch(updated);
    window.history.replaceState(null, '', `/results?${searchParams(updated)}`);
  }
  const sources = data?.sources.filter(source => selected.includes(source.id)) ?? [];
  const flights = sortOffers(sources.flatMap(source => source.flights.map(flight => ({ flight, id: source.id, source }))), sort, search.currency);
  const mixedCurrencies = new Set(flights.map(({ flight }) => flight.currency)).size > 1;
  const count = loading ? 'جارٍ البحث لدى الشركات…' : failure ? 'تعذّر إكمال البحث' : !selected.length ? 'اختر شركة' : flights.length ? `${flights.length} رحلات من المصادر` : sources.length && sources.every(source => source.status === 'blocked') ? 'مصادر الحجز رفضت الاتصال' : sources.some(source => !['ok', 'no_results'].includes(source.status)) ? 'النتائج غير مكتملة' : 'لم تظهر رحلات للتاريخ المختار';
  const checked = data ? new Date(data.checkedAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
  const summary = loading ? 'قد يستغرق البحث حتى دقيقة. نقرأ صفحات الشركات الآن.' : failure || (!selected.length ? 'اختر شركة طيران واحدة على الأقل لعرض النتائج.' : `آخر تحقق: ${checked} · السعر كما يعرضه المصدر${search.round ? ' · راجع إجمالي الذهاب والعودة لدى الشركة' : ''}`);

  return <main id="main" className="results-main">
    <Link className="back" id="edit-link" href={`/?${query}`}><Icon name="back" width="16" height="16" /> تعديل البحث</Link>
    <div className="results-heading"><div><div className="eyebrow"><i /> كل الخيارات، في مكان واحد</div><h1 id="route-title">{cities[search.from]} ← {cities[search.to]}</h1><p id="search-summary">{dateText(search.date)}{search.round ? ` · العودة: ${dateText(search.returnDate)}` : ''} · {search.passengers} مسافر · {search.round ? 'ذهاب وعودة' : 'ذهاب فقط'} · {currencies[search.currency]}</p></div><span className="results-symbol"><Icon width="23" height="23" /></span></div>
    <div className="results-note"><span className="note-icon" aria-hidden="true">i</span><p>مواعيد وأسعار من صفحات الحجز. راجع الإجمالي وشروط السعر لدى الشركة قبل إتمام الحجز.</p></div>
    <div className="results-layout"><aside className="filters" aria-label="فلاتر البحث"><div className="filters-title"><h2>فلتر رحلتك</h2><span aria-hidden="true">☷</span></div><div className="filter-section"><h3>شركات الطيران</h3>{airlineIds.map(id => <label key={id}><input type="checkbox" value={id} checked={selected.includes(id)} disabled={!initial.airlines.includes(id)} className="air-filter" onChange={event => setSelected(previous => event.target.checked ? [...previous, id] : previous.filter(airline => airline !== id))} /> {providers[id].name} <span>{providers[id].code}</span></label>)}</div><div className="filter-section"><label className="currency-label" htmlFor="currency-filter">عملة البحث</label><select id="currency-filter" name="currency" value={search.currency} disabled={loading} onChange={event => changeCurrency(event.target.value as Currency)}>{Object.entries(currencies).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></div><div className="filter-tip"><Icon name="arrow" /><p>رحلتك تبدأ<br />باختيارك.</p><small>راجع التوفر والسعر في صفحة الشركة قبل الحجز.</small></div></aside>
    <section className="results-content" aria-label="نتائج الرحلات"><div className="results-toolbar"><b id="result-count">{count}</b><div className="toolbar-actions"><label>ترتيب حسب <select id="sort" value={sort} onChange={event => setSort(event.target.value)}><option value="price">السعر المعروض</option><option value="time">وقت المغادرة</option></select></label><button type="button" className="retry" id="retry" disabled={loading} onClick={() => { setLoading(true); setRefresh(previous => previous + 1); }}>تحديث البحث <Icon name="refresh" width="16" height="16" /></button></div></div>
    <div id="source-status" role="status" className="source-summary">{summary}{!loading && mixedCurrencies ? ' · الأسعار بعملات مختلفة؛ ترتيب السعر يجمع كل عملة على حدة.' : ''}</div>
    <div id="flight-list" aria-live="polite" aria-busy={loading}>
      {loading ? <div className="empty-state loading-state">جارٍ البحث عن رحلاتك…</div> : failure ? selected.map(id => <article key={id} className="flight-card source-card" data-airline={id}><div className="source-body"><h2>{providers[id].name}</h2><BookingLink id={id} search={search}>تابع البحث لدى {providers[id].name}</BookingLink></div></article>) : <>{flights.map(({ flight, id, source }, index) => <FlightCard key={`${id}-${flight.leg}-${flight.departure}-${index}`} flight={flight} id={id} source={source} search={search} />)}{sources.filter(source => source.status !== 'ok').map(source => <article key={source.id} className="flight-card source-card" data-airline={source.id}><div className="source-body"><h2>{providers[source.id].name}</h2><p>{sourceMessage(source, search.currency)}</p><BookingLink id={source.id} search={search} source={source}>افتح نتائج الشركة</BookingLink></div></article>)}</>}
    </div></section></div>
  </main>;
}
