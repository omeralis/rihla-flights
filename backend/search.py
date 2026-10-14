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
CURRENCIES = {'SDG', 'SAR', 'USD'}

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
    currency = args.get('currency', 'SDG')
    if currency not in CURRENCIES:
        raise ValueError('اختر الجنيه السوداني أو الريال السعودي أو الدولار الأمريكي.')
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
    return {'from': origin, 'to': destination, 'date': date.isoformat(), 'returnDate': back.isoformat() if back else None, 'passengers': adults, 'round': trip == 'round', 'airlines': selected, 'currency': currency}

def booking_url(airline, search):
    provider = PROVIDERS[airline]
    currency = search.get('currency', 'SDG')
    if currency not in CURRENCIES:
        raise ValueError('Invalid currency.')
    params = {'OriginAirportCode': search['from'], 'DestinationAirportCode': search['to'], 'OutboundDate': search['date'], 'Currency': currency}
    if search['round']:
        params['InboundDate'] = search['returnDate']
    for index, (code, count) in enumerate([('AD', search['passengers']), ('CHD', 0), ('INF', 0)]):
        params[f'TravelerTypes[{index}].Key'] = code
        params[f'TravelerTypes[{index}].Value'] = str(count)
    return provider['base'] + '/BookingEngine/SearchResult?' + urlencode(params)

# Restrict parsing to flight rows below the date calendar. A neighbouring day's
# "From $..." is not an offer for the requested date. Fail closed on UI changes.
ROW = re.compile(r'(?m)^([A-Z]{3})\s*\n(\d{2}:\d{2})\s*\nstraight\s*\n([A-Z]{3})\s*\n(\d{2}:\d{2})(?:\s+(plus_one))?\s*\nTravel time\s*\n([^\n]+)\s*\nFlight connection\s*\n([^\n]+)')
MONEY = re.compile(r'(\$|USD\b|SDG\b|SAR\b|ج\.س\.|ر\.س\.)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(\.\d{1,2})?')

def parse_results(text, search):
    requested_currency = search.get('currency', 'SDG')
    if requested_currency not in CURRENCIES:
        raise ValueError('Invalid currency.')
    text = re.sub(r'[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', text.replace('\xa0', ' ').replace('\r', ''))
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
        marker = price_match.group(1)
        currency = 'USD' if marker in {'$', 'USD'} else 'SAR' if marker in {'SAR', 'ر.س.'} else 'SDG'
        if currency != requested_currency:
            return {'status': 'currency_unavailable', 'flights': []}
        amount = price_match.group(2).replace(',', '')
        fraction = price_match.group(3)
        if fraction and '.' not in amount:
            amount += fraction
        price = Decimal(amount)
        if not price.is_finite() or price < 0:
            raise ValueError('Invalid source fare.')
        flights.append({'from': origin, 'to': destination, 'date': date, 'leg': leg, 'departure': departure, 'arrival': arrival, 'arrivalDayOffset': int(bool(next_day)), 'duration': duration.strip(), 'connection': connection.strip(), 'price': float(price), 'currency': currency, 'priceScope': 'source_displayed'})
    if flights:
        return {'status': 'ok', 'flights': flights}
    if re.search(r'(?m)^No results\s*$', text):
        return {'status': 'no_results', 'flights': []}
    raise ValueError('The source page did not contain recognizable flight results.')

async def search_airlines(search):
    import logging
    from cloakbrowser import launch_async
    logger = logging.getLogger(__name__)
    log_currency = re.sub(r'[^A-Z]', '', search.get('currency', 'SDG'))[:3]
    browser = await launch_async(headless=True)
    try:
        async def read(airline):
            result = {'id': airline, 'name': PROVIDERS[airline]['name'], 'bookingUrl': booking_url(airline, search), 'status': 'unavailable', 'flights': []}
            stage = 'context'
            deadline = asyncio.get_running_loop().time() + 65

            def failure(reason, *, status='unavailable', http_status=None, error=None):
                result.update(status=status, reason=reason, stage=stage, flights=[])
                if http_status is not None:
                    result['httpStatus'] = http_status
                if error is not None:
                    result['errorClass'] = re.sub(r'[^A-Za-z0-9_]', '', type(error).__name__)[:80]
                logger.warning('Airline read failed provider=%s currency=%s stage=%s reason=%s http_status=%s error_class=%s', airline, log_currency, stage, reason, http_status, result.get('errorClass'))

            def remaining_ms(limit):
                return max(1, min(limit, int((deadline - asyncio.get_running_loop().time()) * 1000)))

            try:
                # Each source has its own deadline so a slow source cannot discard
                # results already read from the other airlines.
                async with asyncio.timeout(65):
                    for attempt in range(2):
                        context = None
                        retryable = False
                        for key in ('reason', 'stage', 'httpStatus', 'errorClass'):
                            result.pop(key, None)
                        stage = 'context'
                        try:
                            context = await browser.new_context(locale='en-GB')
                            page = await context.new_page()
                            stage = 'navigation'
                            response = await page.goto(result['bookingUrl'], wait_until='domcontentloaded', timeout=remaining_ms(45000))
                            http_status = response.status if response else None
                            if http_status in {401, 403, 429}:
                                failure('upstream_http', status='blocked', http_status=http_status)
                                return result
                            if http_status != 200:
                                failure('upstream_http' if response else 'network_error', http_status=http_status)
                                retryable = response is None or 500 <= http_status <= 599
                            else:
                                stage = 'readiness'
                                await page.wait_for_function("() => /Travel time|No results|The currency .* is not valid/.test(document.body.innerText)", timeout=remaining_ms(20000))
                                stage = 'source_check'
                                text = await page.locator('body').inner_text()
                                if re.search(r'The currency\s+' + re.escape(search.get('currency', 'SDG')) + r'\s+is not valid', text):
                                    failure('unsupported_currency', status='currency_unavailable')
                                    return result
                                # Flight labels can render before asynchronous fares.
                                # Allow a short settle period without requiring every
                                # background request to finish or extending the deadline.
                                stage = 'settle'
                                try:
                                    await page.wait_for_load_state('networkidle', timeout=remaining_ms(5000))
                                except Exception:
                                    pass
                                stage = 'source_check'
                                text = await page.locator('body').inner_text()
                                if re.search(r'The currency\s+' + re.escape(search.get('currency', 'SDG')) + r'\s+is not valid', text):
                                    failure('unsupported_currency', status='currency_unavailable')
                                    return result
                                if (await page.title()).strip().lower() != 'search result':
                                    failure('unexpected_page', status='unrecognized')
                                    return result
                                # Keep source/query verification before parsing offers.
                                stage = 'query_check'
                                requested = dt.date.fromisoformat(search['date'])
                                if search['from'] not in text or search['to'] not in text or requested.strftime('%d %B, %Y').lstrip('0') not in text:
                                    failure('query_mismatch', status='unrecognized')
                                    return result
                                stage = 'parse'
                                try:
                                    result.update(parse_results(text, search))
                                except ValueError as error:
                                    failure('parse_failed', status='unrecognized', error=error)
                                return result
                        except Exception as error:
                            is_timeout = 'Timeout' in type(error).__name__
                            reason = 'navigation_timeout' if stage == 'navigation' and is_timeout else 'result_timeout' if stage == 'readiness' and is_timeout else 'network_error' if stage == 'navigation' else 'context_failed' if stage == 'context' else 'read_failed'
                            failure(reason, error=error)
                            retryable = stage == 'navigation' or (stage == 'readiness' and is_timeout)
                        finally:
                            if context is not None:
                                try:
                                    async with asyncio.timeout(2):
                                        await context.close()
                                except Exception as error:
                                    logger.warning('Airline cleanup failed provider=%s currency=%s stage=cleanup reason=cleanup_failed error_class=%s', airline, log_currency, re.sub(r'[^A-Za-z0-9_]', '', type(error).__name__)[:80])
                        if not retryable or attempt == 1 or deadline - asyncio.get_running_loop().time() <= 1:
                            break
                        await asyncio.sleep(0.5)
            except TimeoutError as error:
                failure('source_timeout', error=error)
            except Exception as error:
                failure('read_failed', error=error)
            return result
        return await asyncio.gather(*(read(a) for a in search['airlines']))
    finally:
        try:
            async with asyncio.timeout(2):
                await browser.close()
        except Exception as error:
            logger.warning('Browser cleanup failed stage=cleanup reason=cleanup_failed error_class=%s', re.sub(r'[^A-Za-z0-9_]', '', type(error).__name__)[:80])
