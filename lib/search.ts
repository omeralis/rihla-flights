export const providers = {
  tarco: { name: 'تاركو', code: 'TC', english: 'TARCO AVIATION', base: 'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/tarcoair/en-GB' },
  badr: { name: 'بدر', code: 'J4', english: 'BADR AIRLINES', base: 'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/badrairlines/en-GB' },
  sudanair: { name: 'سودانير', code: 'SD', english: 'SUDAN AIRWAYS', base: 'https://emea.ttinteractive.com/Zenith/FrontOffice/SudanAirways/en-GB' },
} as const;

export const cities = { PZU: 'بورتسودان', CAI: 'القاهرة', JED: 'جدة', RUH: 'الرياض', DXB: 'دبي', SHJ: 'الشارقة', ADD: 'أديس أبابا', EBB: 'عنتيبي', DOH: 'الدوحة', KRT: 'الخرطوم' } as const;
export const currencies = { SDG: 'الجنيه السوداني', SAR: 'الريال السعودي', USD: 'الدولار الأمريكي' } as const;
export type Airline = keyof typeof providers;
export type Airport = keyof typeof cities;
export type Currency = keyof typeof currencies;
export const airlineIds = Object.keys(providers) as Airline[];

export interface SearchCriteria {
  from: Airport;
  to: Airport;
  date: string;
  returnDate: string | null;
  passengers: number;
  round: boolean;
  airlines: Airline[];
  currency: Currency;
}

export interface Flight {
  from: Airport;
  to: Airport;
  date: string;
  leg: 'outbound' | 'return';
  departure: string;
  arrival: string;
  arrivalDayOffset: number;
  duration: string;
  connection: string;
  price: number;
  currency: Currency;
  priceScope: 'source_displayed';
}

export type SourceStatus = 'ok' | 'no_results' | 'unavailable' | 'unrecognized' | 'blocked' | 'currency_unavailable';
export interface SourceResult {
  id: Airline;
  name: string;
  bookingUrl: string;
  status: SourceStatus;
  flights: Flight[];
  reason?: string;
  stage?: string;
  httpStatus?: number;
  errorClass?: string;
}
export interface SearchResponse { search: SearchCriteria; sources: SourceResult[]; checkedAt: string }

export function dateValid(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validate(params: URLSearchParams, now = new Date()): SearchCriteria {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!Object.hasOwn(cities, from) || !Object.hasOwn(cities, to) || from === to) throw Error('اختر مدينتي مغادرة ووصول مختلفتين من القائمة.');
  const date = params.get('date');
  const passengers = Number(params.get('passengers') ?? '1');
  if (!dateValid(date) || !/^[1-6]$/.test(params.get('passengers') ?? '1') || date < now.toISOString().slice(0, 10)) throw Error('اختر تاريخ سفر قادمًا وعدد مسافرين بين 1 و6.');
  const trip = params.get('trip') ?? 'oneway';
  if (!['oneway', 'round'].includes(trip)) throw Error('نوع الرحلة غير صحيح.');
  const currency = params.get('currency') ?? 'SDG';
  if (!Object.hasOwn(currencies, currency)) throw Error('اختر الجنيه السوداني أو الريال السعودي أو الدولار الأمريكي.');
  const returnDate = trip === 'round' ? params.get('return') : null;
  if (trip === 'round' && (!dateValid(returnDate) || returnDate < date)) throw Error('تاريخ العودة يجب أن يكون بعد المغادرة أو في اليوم نفسه.');
  const airlines = [...new Set(params.getAll('airline'))];
  if (!airlines.length || airlines.length > 3 || airlines.some(id => !Object.hasOwn(providers, id))) throw Error('اختر شركة طيران واحدة على الأقل من الشركات الثلاث.');
  return { from: from as Airport, to: to as Airport, date, returnDate, passengers, round: trip === 'round', airlines: airlines as Airline[], currency: currency as Currency };
}

export function searchParams(search: SearchCriteria): URLSearchParams {
  const params = new URLSearchParams({ from: search.from, to: search.to, date: search.date, passengers: String(search.passengers), trip: search.round ? 'round' : 'oneway', currency: search.currency });
  if (search.round && search.returnDate) params.set('return', search.returnDate);
  search.airlines.forEach(id => params.append('airline', id));
  return params;
}

export function bookingUrl(id: Airline, search: SearchCriteria): string {
  if (!Object.hasOwn(providers, id) || !Object.hasOwn(currencies, search.currency)) throw Error('Invalid airline or currency');
  const url = new URL(`${providers[id].base}/BookingEngine/SearchResult`);
  const params = url.searchParams;
  params.set('OriginAirportCode', search.from);
  params.set('DestinationAirportCode', search.to);
  params.set('OutboundDate', search.date);
  params.set('Currency', search.currency);
  if (search.round && search.returnDate) params.set('InboundDate', search.returnDate);
  [['AD', search.passengers], ['CHD', 0], ['INF', 0]].forEach(([code, count], index) => {
    params.set(`TravelerTypes[${index}].Key`, String(code));
    params.set(`TravelerTypes[${index}].Value`, String(count));
  });
  return url.href;
}

export function dateText(value: string | null) {
  return dateValid(value) ? new Date(`${value}T12:00:00Z`).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }) : '';
}

export function defaultSearch(now = new Date()): SearchCriteria {
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { from: 'PZU', to: 'CAI', date: tomorrow.toISOString().slice(0, 10), returnDate: null, passengers: 1, round: false, airlines: [...airlineIds], currency: 'SDG' };
}

export function formSearch(params: URLSearchParams): SearchCriteria {
  const defaults = defaultSearch();
  const date = dateValid(params.get('date')) && params.get('date')! >= new Date().toISOString().slice(0, 10) ? params.get('date')! : defaults.date;
  const back = new Date(`${date}T12:00:00Z`);
  back.setUTCDate(back.getUTCDate() + 7);
  const selected = airlineIds.filter(id => params.getAll('airline').includes(id));
  return { ...defaults, from: Object.hasOwn(cities, params.get('from') ?? '') ? params.get('from') as Airport : defaults.from, to: Object.hasOwn(cities, params.get('to') ?? '') ? params.get('to') as Airport : defaults.to, date, round: params.get('trip') === 'round', returnDate: dateValid(params.get('return')) && params.get('return')! >= date ? params.get('return') : back.toISOString().slice(0, 10), passengers: /^[1-6]$/.test(params.get('passengers') ?? '') ? Number(params.get('passengers')) : 1, currency: Object.hasOwn(currencies, params.get('currency') ?? '') ? params.get('currency') as Currency : 'SDG', airlines: selected.length ? selected : defaults.airlines };
}

export type PageParams = Record<string, string | string[] | undefined>;
export function pageParams(values: PageParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  return params;
}
