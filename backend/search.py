"""Read public Zenith search results through ephemeral CloakBrowser sessions."""
import asyncio
import datetime as dt
import re
from decimal import Decimal
from urllib.parse import urlencode

PROVIDERS = {
    'tarco': {'name': 'تاركو', 'base': 'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/tarcoair/en-GB'},
    'badr': {'name': 'بدر', 'base': 'https://fo-emea.ttinteractive.com/Zenith/FrontOffice/badrairlines/en-GB'},
    'sudanair': {'name': 'سودانير', 'base': 'https://emea.ttinteractive.com/Zenith/FrontOffice/SudanAirways/en-GB'},
}
AIRPORTS = {'PZU', 'CAI', 'JED', 'RUH', 'DXB', 'SHJ', 'ADD', 'EBB', 'DOH', 'KRT'}

def validate(args):
    origin, destination = args.get('from', ''), args.get('to', '')
    if origin not in AIRPORTS or destination not in AIRPORTS or origin == destination:
        raise ValueError('اختر مدينتي مغادرة ووصول مختلفتين من القائمة.')
    try:
        date = dt.date.fromisoformat(args.get('date', ''))
        if date.isoformat() != args.get('date'):
            raise ValueError()
        adults = int(args.get('passengers', '1'))
    except (ValueError, TypeError):
        raise ValueError('تحقق من تاريخ السفر وعدد المسافرين.')
    if not 1 <= adults <= 6 or date < dt.datetime.now(dt.timezone.utc).date():
        raise ValueError('اختر تاريخ سفر قادمًا وعدد مسافرين بين 1 و6.')
    trip = args.get('trip', 'oneway')
    if trip not in {'oneway', 'round'}:
        raise ValueError('نوع الرحلة غير صحيح.')
    back = None
    if trip == 'round':
        try:
            back = dt.date.fromisoformat(args.get('return', ''))
        except (TypeError, ValueError):
            raise ValueError('اختر تاريخ العودة.')
        if back.isoformat() != args.get('return') or back < date:
            raise ValueError('تاريخ العودة يجب أن يكون بعد المغادرة أو في اليوم نفسه.')
    selected = list(dict.fromkeys(args.getlist('airline')))
    if not selected or len(selected) > 3 or any(a not in PROVIDERS for a in selected):
        raise ValueError('اختر شركة طيران واحدة على الأقل من الشركات الثلاث.')
    return {'from': origin, 'to': destination, 'date': date.isoformat(), 'returnDate': back.isoformat() if back else None, 'passengers': adults, 'round': trip == 'round', 'airlines': selected}

def booking_url(airline, search):
    provider = PROVIDERS[airline]
    params = {'OriginAirportCode': search['from'], 'DestinationAirportCode': search['to'], 'OutboundDate': search['date'], 'Currency': 'USD'}
    if search['round']:
        params['InboundDate'] = search['returnDate']
    for index, (code, count) in enumerate([('AD', search['passengers']), ('CHD', 0), ('INF', 0)]):
        params[f'TravelerTypes[{index}].Key'] = code
        params[f'TravelerTypes[{index}].Value'] = str(count)
    return provider['base'] + '/BookingEngine/SearchResult?' + urlencode(params)

# Restrict parsing to flight rows below the date calendar. A neighbouring day's
# "From $..." is not an offer for the requested date. Fail closed on UI changes.
ROW = re.compile(r'(?m)^([A-Z]{3})\s*\n(\d{2}:\d{2})\s*\nstraight\s*\n([A-Z]{3})\s*\n(\d{2}:\d{2})(?:\s+(plus_one))?\s*\nTravel time\s*\n([^\n]+)\s*\nFlight connection\s*\n([^\n]+)')
MONEY = re.compile(r'\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(\.\d{2})?')

def parse_results(text, search):
    text = text.replace('\xa0', ' ').replace('\r', '')
    matches = list(ROW.finditer(text))
    flights = []
    for index, match in enumerate(matches):
        origin, departure, destination, arrival, next_day, duration, connection = match.groups()
        if (origin, destination) == (search['from'], search['to']):
            leg, date = 'outbound', search['date']
        elif search['round'] and (origin, destination) == (search['to'], search['from']):
            leg, date = 'return', search['returnDate']
        else:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        tail = text[match.end():end]
        price_match = MONEY.search(tail)
        if not price_match:
            raise ValueError('The flight row has no readable fare.')
        amount = price_match.group(1).replace(',', '')
        fraction = price_match.group(2)
        if fraction and '.' not in amount:
            amount += fraction
        price = Decimal(amount)
        if not price.is_finite() or price < 0:
            raise ValueError('Invalid source fare.')
        flights.append({'from': origin, 'to': destination, 'date': date, 'leg': leg, 'departure': departure, 'arrival': arrival, 'arrivalDayOffset': int(bool(next_day)), 'duration': duration.strip(), 'connection': connection.strip(), 'price': float(price), 'currency': 'USD', 'priceScope': 'source_displayed'})
    if flights:
        return {'status': 'ok', 'flights': flights}
    if re.search(r'(?m)^No results\s*$', text):
        return {'status': 'no_results', 'flights': []}
    raise ValueError('The source page did not contain recognizable flight results.')

async def search_airlines(search):
    from cloakbrowser import launch_async
    browser = await launch_async(headless=True)
    try:
        async def read(airline):
            result = {'id': airline, 'name': PROVIDERS[airline]['name'], 'bookingUrl': booking_url(airline, search), 'status': 'unavailable', 'flights': []}
            context = await browser.new_context(locale='en-GB')
            try:
                page = await context.new_page()
                response = await page.goto(result['bookingUrl'], wait_until='domcontentloaded', timeout=45000)
                if not response or response.status != 200:
                    result['status'] = 'blocked' if response and response.status in {401, 403, 429} else 'unavailable'
                    return result
                try:
                    await page.wait_for_load_state('networkidle', timeout=12000)
                except Exception:
                    pass
                await page.wait_for_function("() => /Travel time|No results/.test(document.body.innerText)", timeout=20000)
                if (await page.title()).strip().lower() != 'search result':
                    return result
                text = await page.locator('body').inner_text()
                # Native result views are English and show the requested date.
                # Reject mismatched query pages rather than presenting stale offers.
                requested = dt.date.fromisoformat(search['date'])
                if search['from'] not in text or search['to'] not in text or requested.strftime('%d %B, %Y').lstrip('0') not in text:
                    result['status'] = 'unrecognized'
                    return result
                try:
                    result.update(parse_results(text, search))
                except ValueError:
                    result['status'] = 'unrecognized'
                return result
            except Exception:
                return result
            finally:
                await context.close()
        return await asyncio.gather(*(read(a) for a in search['airlines']))
    finally:
        await browser.close()
