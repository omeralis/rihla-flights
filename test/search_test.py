import datetime as dt
import unittest
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from backend.search import parse_results, booking_url, validate

ROOT = Path(__file__).parent / 'fixtures'
SEARCH = {'from': 'PZU', 'to': 'CAI', 'date': '2026-10-21', 'returnDate': None, 'round': False, 'passengers': 1, 'airlines': ['tarco','badr','sudanair']}

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
