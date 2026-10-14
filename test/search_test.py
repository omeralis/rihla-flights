import datetime as dt
import unittest
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from backend.search import parse_results, booking_url, validate

ROOT = Path(__file__).parent / 'fixtures'
SEARCH = {'from': 'PZU', 'to': 'CAI', 'date': '2026-10-21', 'returnDate': None, 'round': False, 'passengers': 1, 'airlines': ['tarco','badr','sudanair'], 'currency': 'USD'}

class Args(dict):
    def getlist(self,key):
        return self[key] if isinstance(self.get(key),list) else [self[key]] if key in self else []

class SearchTests(unittest.TestCase):
    def test_calendar_prices_are_not_flights_for_the_selected_date(self):
        result=parse_results((ROOT/'tarco.txt').read_text(),SEARCH)
        self.assertEqual(result,{'status':'no_results','flights':[]})

    def test_actual_badr_and_sudanair_rows(self):
        for airline,price,departure,duration in [('badr',270,'23:00','02h30'),('sudanair',361.75,'23:30','02h00')]:
            result=parse_results((ROOT/(airline+'.txt')).read_text(),SEARCH)
            self.assertEqual(result['status'],'ok')
            self.assertEqual(len(result['flights']),1)
            flight=result['flights'][0]
            self.assertEqual(flight['price'],price)
            self.assertEqual(flight['departure'],departure)
            self.assertEqual(flight['duration'],duration)
            self.assertEqual(flight['arrivalDayOffset'],1)
            self.assertEqual(flight['priceScope'],'source_displayed')

    def test_error_or_changed_page_is_not_an_empty_search(self):
        for text in ['Error. An error occurred while processing your request.','Session expired','From $270.00']:
            with self.assertRaises(ValueError):parse_results(text,SEARCH)

    def test_price_is_not_multiplied_without_source_evidence(self):
        result=parse_results((ROOT/'badr.txt').read_text(),{**SEARCH,'passengers':3})
        self.assertEqual(result['flights'][0]['price'],270)

    def test_actual_sudanese_pound_prices_without_conversion(self):
        for airline, price in [('badr',2565000),('sudanair',1800000)]:
            result=parse_results((ROOT/(airline+'-sdg.txt')).read_text(),{**SEARCH,'currency':'SDG'})
            self.assertEqual(result['status'],'ok')
            self.assertEqual(result['flights'][0]['price'],price)
            self.assertEqual(result['flights'][0]['currency'],'SDG')
        self.assertEqual(parse_results((ROOT/'tarco-sdg.txt').read_text(),{**SEARCH,'currency':'SDG'}),{'status':'no_results','flights':[]})

    def test_source_prices_are_not_relabelled_as_the_requested_currency(self):
        for fixture,currency in [('badr.txt','SDG'),('badr-sdg.txt','USD')]:
            result=parse_results((ROOT/fixture).read_text(),{**SEARCH,'currency':currency})
            self.assertEqual(result,{'status':'currency_unavailable','flights':[]})

    def test_sar_fares_include_directional_marks_and_split_decimal(self):
        result=parse_results((ROOT/'sudanair-sar.txt').read_text(),{**SEARCH,'currency':'SAR'})
        self.assertEqual(result['status'],'ok')
        self.assertEqual(result['flights'][0]['price'],1106.46)
        self.assertEqual(result['flights'][0]['currency'],'SAR')
        self.assertEqual(parse_results((ROOT/'tarco-sar.txt').read_text(),{**SEARCH,'currency':'SAR'}),{'status':'no_results','flights':[]})
        self.assertEqual(parse_results((ROOT/'sudanair-sar.txt').read_text(),{**SEARCH,'currency':'SDG'}),{'status':'currency_unavailable','flights':[]})

    def test_actual_khartoum_source_rows(self):
        for id,price in [('badr',2090000),('sudanair',1000000)]:
            result=parse_results((ROOT/(id+'-krt-sdg.txt')).read_text(),{**SEARCH,'to':'KRT','date':'2026-10-18','currency':'SDG'})
            self.assertEqual(result['status'],'ok')
            self.assertEqual(result['flights'][0]['price'],price)
            self.assertEqual(result['flights'][0]['to'],'KRT')

    def test_currency_is_validated_and_kept_in_all_booking_links(self):
        args=Args({'from':'PZU','to':'CAI','date':(dt.date.today()+dt.timedelta(days=7)).isoformat(),'airline':['badr']})
        self.assertEqual(validate(args)['currency'],'SDG')
        self.assertEqual(validate(Args({**args,'currency':'SDG'}))['currency'],'SDG')
        for invalid in ['EUR','','SDG&Currency=USD']:
            with self.assertRaises(ValueError):validate(Args({**args,'currency':invalid}))
        for id in SEARCH['airlines']:
            for currency in ['SDG','SAR','USD']:
                query=parse_qs(urlsplit(booking_url(id,{**SEARCH,'currency':currency})).query)
                self.assertEqual(query['Currency'],[currency])
        self.assertEqual(validate(Args({**args,'currency':'SAR'}))['currency'],'SAR')

    def test_round_trip_link_keeps_dates_and_passenger_counts(self):
        query=parse_qs(urlsplit(booking_url('badr',{**SEARCH,'round':True,'returnDate':'2026-10-28','passengers':3})).query)
        self.assertEqual(query['InboundDate'],['2026-10-28'])
        self.assertEqual(query['TravelerTypes[0].Value'],['3'])
        self.assertEqual(query['TravelerTypes[0].Key'],['AD'])

    def test_input_validation_rejects_invalid_sources_and_dates(self):
        args=Args({'from':'PZU','to':'CAI','date':(dt.date.today()+dt.timedelta(days=7)).isoformat(),'passengers':'1','airline':['badr']})
        self.assertEqual(validate(args)['airlines'],['badr'])
        for changes in [{'from':'https://example.com'},{'date':'2026-02-31'},{'passengers':'99'},{'airline':['constructor']},{'trip':'round','return':'2020-01-01'}]:
            with self.assertRaises(ValueError):validate(Args({**args,**changes}))

if __name__=='__main__':unittest.main()
