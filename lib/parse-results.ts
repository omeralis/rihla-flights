import { currencies, type Flight, type SearchCriteria } from './search';

// Calendar prices above these rows are never offers for the requested date.
const row = /^([A-Z]{3})\s*\n(\d{2}:\d{2})\s*\nstraight\s*\n([A-Z]{3})\s*\n(\d{2}:\d{2})(?:\s+(plus_one))?\s*\nTravel time\s*\n([^\n]+)\s*\nFlight connection\s*\n([^\n]+)/gm;
const money = /(\$|USD\b|SDG\b|SAR\b|ج\.س\.|ر\.س\.)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(\.\d{1,2})?/;

export function parseResults(body: string, search: SearchCriteria): { status: 'ok' | 'no_results' | 'currency_unavailable'; flights: Flight[] } {
  if (!Object.hasOwn(currencies, search.currency)) throw Error('Invalid currency');
  const text = body.replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  const matches = [...text.matchAll(row)];
  const flights: Flight[] = [];
  for (const [index, match] of matches.entries()) {
    const [, from, departure, to, arrival, nextDay, duration, connection] = match;
    let leg: Flight['leg'];
    let date: string;
    if (from === search.from && to === search.to) { leg = 'outbound'; date = search.date; }
    else if (search.round && from === search.to && to === search.from && search.returnDate) { leg = 'return'; date = search.returnDate; }
    else continue;
    const tail = text.slice(match.index! + match[0].length, matches[index + 1]?.index ?? text.length);
    const fare = money.exec(tail);
    if (!fare) throw Error('The flight row has no readable fare');
    const currency = ['$', 'USD'].includes(fare[1]) ? 'USD' : ['SAR', 'ر.س.'].includes(fare[1]) ? 'SAR' : 'SDG';
    if (currency !== search.currency) return { status: 'currency_unavailable', flights: [] };
    let amount = fare[2].replaceAll(',', '');
    if (fare[3] && !amount.includes('.')) amount += fare[3];
    const price = Number(amount);
    if (!Number.isFinite(price) || price < 0) throw Error('Invalid source fare');
    flights.push({ from: from as Flight['from'], to: to as Flight['to'], date, leg, departure, arrival, arrivalDayOffset: nextDay ? 1 : 0, duration: duration.trim(), connection: connection.trim(), price, currency, priceScope: 'source_displayed' });
  }
  if (flights.length) return { status: 'ok', flights };
  if (/^No results\s*$/m.test(text)) return { status: 'no_results', flights: [] };
  throw Error('The source page did not contain recognizable flight results');
}
