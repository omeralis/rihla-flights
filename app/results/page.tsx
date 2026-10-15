import Link from 'next/link';
import type { Metadata } from 'next';
import { FlightResults } from '@/components/flight-results';
import { defaultSearch, pageParams, searchParams, validate, type PageParams, type SearchCriteria } from '@/lib/search';

export const metadata: Metadata = { title: 'نتائج البحث' };

export default async function Results({ searchParams: query }: { searchParams: Promise<PageParams> }) {
  const params = pageParams(await query);
  let criteria: SearchCriteria;
  try { criteria = validate(params.size ? params : searchParams(defaultSearch())); }
  catch (error) {
    return <main id="main" className="results-main"><div className="empty-state"><h1>تحقق من بيانات البحث</h1><p role="alert">{(error as Error).message}</p><Link className="primary" href={`/?${params}`}>تعديل البحث</Link></div></main>;
  }
  return <FlightResults key={JSON.stringify(criteria)} initial={criteria} />;
}
