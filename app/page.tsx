import { Hero } from '@/components/hero';
import { SearchForm } from '@/components/search-form';
import { Icon } from '@/components/icon';
import { airlineIds, formSearch, pageParams, providers, type PageParams } from '@/lib/search';

export default async function Home({ searchParams }: { searchParams: Promise<PageParams> }) {
  const initial = formSearch(pageParams(await searchParams));
  return <main id="main"><Hero /><SearchForm key={JSON.stringify(initial)} initial={initial} /><section className="partners" id="airlines" aria-labelledby="airlines-title"><div className="partners-intro"><span className="eyebrow">شركاتك المفضّلة</span><h2 id="airlines-title">ثلاث شركات.<br /> بحث واحد.</h2></div>{airlineIds.map(id => <div key={id} className={`partner ${id}`}><span className="partner-code">{providers[id].code}</span><div><b>{providers[id].name}</b><small>{providers[id].english}</small></div><span className="partner-arrow"><Icon name="arrow" /></span></div>)}</section><div className="demo-note"><span aria-hidden="true">◌</span> الأسعار والتوفر يُجلبان وقت البحث، ويؤكَّدان لدى الشركة عند الحجز.</div></main>;
}
