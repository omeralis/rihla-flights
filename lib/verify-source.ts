import { dateValid, type SearchCriteria } from './search';

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function sourceDate(value: string): string | undefined {
  const match = /^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/i.exec(value.trim());
  if (!match) return undefined;
  const month = months.indexOf(match[2].toLowerCase()) + 1;
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return month && dateValid(date) ? date : undefined;
}

export function verifySource(body: string, search: SearchCriteria) {
  const text = body.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  const headers = [...text.matchAll(/^(Outbound|Inbound|Return)\s*\n([\s\S]{1,1200}?)\nexpand_more\b/gm)].map(match => ({ leg: match[1], date: sourceDate(match[2].split('\n')[0]), airports: [...match[2].matchAll(/^([A-Z]{3})\s*$/gm)].map(code => code[1]) }));
  const outbound = headers.find(header => header.leg === 'Outbound');
  const inbound = headers.find(header => header.leg !== 'Outbound');
  const observedDate = outbound?.date;
  if (!outbound?.date || outbound.airports.length < 2) return { matches: false, mismatch: 'unverified' as const, observedDate, returnVerified: false };
  if (outbound.airports[0] !== search.from || outbound.airports[1] !== search.to) return { matches: false, mismatch: 'route' as const, observedDate, returnVerified: false };
  if (observedDate !== search.date) return { matches: false, mismatch: 'date' as const, observedDate, returnVerified: false };
  const returnVerified = Boolean(search.round && inbound?.date === search.returnDate && inbound.airports[0] === search.to && inbound.airports[1] === search.from);
  if (search.round && inbound && !returnVerified) return { matches: false, mismatch: inbound.date !== search.returnDate ? 'date' as const : 'route' as const, observedDate: inbound.date, returnVerified: false };
  return { matches: true, mismatch: undefined, observedDate, returnVerified };
}
