'use client';

import { useState, type FormEvent } from 'react';
import { cities, currencies, airlineIds, providers, searchParams, validate, type SearchCriteria } from '@/lib/search';
import { Icon } from './icon';

export function SearchForm({ initial }: { initial: SearchCriteria }) {
  const [search, setSearch] = useState(initial);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  function changeDate(date: string) {
    setSearch(previous => ({ ...previous, date, returnDate: previous.returnDate && previous.returnDate >= date ? previous.returnDate : date }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    try { validate(searchParams(search)); setError(''); }
    catch (error) { event.preventDefault(); setError((error as Error).message); }
  }
  return <section className="search-panel" aria-labelledby="search-title">
    <div className="panel-top"><div className="panel-title"><span className="panel-icon"><Icon width="23" height="23" /></span><h2 id="search-title">لنبحث عن رحلتك</h2></div><div className="trip-types">{(['oneway', 'round'] as const).map(trip => <label key={trip}><input type="radio" name="trip" value={trip} checked={search.round === (trip === 'round')} onChange={() => setSearch({ ...search, round: trip === 'round' })} form="search-form" /><span>{trip === 'round' ? 'ذهاب وعودة' : 'ذهاب فقط'}</span></label>)}</div><span className="step"><i /> بيانات مباشرة من الشركات</span></div>
    <form id="search-form" action="/results" method="get" onSubmit={submit}>
      <div className="search-fields"><div className="route-fields">
        <label className="field"><span>من أين؟ <Icon name="arrow" /></span><select name="from" id="from" aria-label="مدينة المغادرة" value={search.from} onChange={event => setSearch({ ...search, from: event.target.value as SearchCriteria['from'] })}>{Object.entries(cities).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label>
        <button type="button" className="swap" id="swap" aria-label="تبديل مدينة المغادرة والوصول" onClick={() => setSearch({ ...search, from: search.to, to: search.from })}><Icon name="swap" width="17" height="17" /></button>
        <label className="field"><span>إلى أين؟ <Icon name="arrow" /></span><select name="to" id="to" aria-label="مدينة الوصول" value={search.to} onChange={event => setSearch({ ...search, to: event.target.value as SearchCriteria['to'] })}>{Object.entries(cities).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label>
      </div>
      <label className="field"><span>تاريخ المغادرة <Icon name="calendar" /></span><input type="date" name="date" id="date" required min={today} value={search.date} onChange={event => changeDate(event.target.value)} /></label>
      <label className="field return-field" hidden={!search.round}><span>تاريخ العودة <Icon name="calendar" /></span><input type="date" name="return" id="return-date" disabled={!search.round} required={search.round} min={search.date} value={search.returnDate ?? ''} onChange={event => setSearch({ ...search, returnDate: event.target.value })} /></label>
      <label className="field passengers"><span>المسافرون <Icon name="person" /></span><select name="passengers" value={search.passengers} onChange={event => setSearch({ ...search, passengers: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count} {count === 1 ? 'مسافر' : count === 2 ? 'مسافران' : 'مسافرين'} · اقتصادية</option>)}</select></label>
      <button className="primary search-button" type="submit">ابحث عن رحلات <Icon name="arrow" /></button></div>
      <div className="panel-bottom"><div className="airline-options"><span>شركات الطيران</span>{airlineIds.map(id => <label key={id}><input type="checkbox" name="airline" value={id} checked={search.airlines.includes(id)} onChange={event => setSearch({ ...search, airlines: event.target.checked ? [...search.airlines, id] : search.airlines.filter(airline => airline !== id) })} /> {providers[id].name}</label>)}</div><label className="currency-picker" htmlFor="currency"><span>عملة البحث</span><select name="currency" id="currency" value={search.currency} onChange={event => setSearch({ ...search, currency: event.target.value as SearchCriteria['currency'] })}>{Object.entries(currencies).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label></div>
      <p id="form-error" role="alert" hidden={!error}>{error}</p>
    </form>
  </section>;
}
