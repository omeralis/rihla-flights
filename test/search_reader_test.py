"""Exercise source failures without network access or persisted browser sessions."""
import asyncio
import sys
import time
import types
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

from backend.search import search_airlines


SEARCH = {'from': 'PZU', 'to': 'CAI', 'date': '2026-10-21', 'returnDate': None,
          'round': False, 'passengers': 1, 'currency': 'USD', 'airlines': ['tarco', 'badr']}
BODY = (Path(__file__).parent / 'fixtures' / 'badr.txt').read_text()
PRIVATE_ERROR = 'https://example.invalid/(S(private-session))/ cookies=private-cookie'


class FakePage:
    def __init__(self, browser):
        self.browser = browser
        self.behavior = {}

    async def goto(self, url, **kwargs):
        provider = 'sudanair' if '/SudanAirways/' in url else 'badr' if '/badrairlines/' in url else 'tarco'
        attempt = self.browser.attempts[provider]
        self.browser.attempts[provider] += 1
        choices = self.browser.behaviors.get(provider, [{}])
        self.behavior = choices[min(attempt, len(choices) - 1)]
        if self.behavior.get('navigation_error'):
            raise self.behavior['navigation_error']
        return types.SimpleNamespace(status=self.behavior.get('http_status', 200))

    async def wait_for_function(self, expression, **kwargs):
        if self.behavior.get('hang'):
            await asyncio.Event().wait()
        if self.behavior.get('readiness_error'):
            raise self.behavior['readiness_error']

    async def title(self):
        return self.behavior.get('title', 'Search result')

    def locator(self, selector):
        return self

    async def inner_text(self):
        return self.behavior.get('body', BODY)


class FakeContext:
    def __init__(self, browser):
        self.page = FakePage(browser)
        self.closed = False

    async def new_page(self):
        return self.page

    async def close(self):
        self.closed = True
        if self.page.behavior.get('cleanup_error'):
            raise self.page.behavior['cleanup_error']


class FakeBrowser:
    def __init__(self, behaviors=None, *, fail_contexts=(), close_error=None):
        self.behaviors = behaviors or {}
        self.fail_contexts = set(fail_contexts)
        self.close_error = close_error
        self.context_count = 0
        self.contexts = []
        self.attempts = Counter()
        self.closed = False

    async def new_context(self, **kwargs):
        self.context_count += 1
        if self.context_count in self.fail_contexts:
            raise RuntimeError(PRIVATE_ERROR)
        context = FakeContext(self)
        self.contexts.append(context)
        return context

    async def close(self):
        self.closed = True
        if self.close_error:
            raise self.close_error


class ReaderTests(unittest.IsolatedAsyncioTestCase):
    async def read(self, browser, search=SEARCH):
        async def launch_async(**kwargs):
            return browser
        wrapper = types.SimpleNamespace(launch_async=launch_async)
        with patch.dict(sys.modules, {'cloakbrowser': wrapper}):
            return await search_airlines(search)

    async def test_blocked_http_responses_are_not_retried(self):
        browser = FakeBrowser({'tarco': [{'http_status': 403}], 'badr': [{'http_status': 401}], 'sudanair': [{'http_status': 429}]})
        with self.assertLogs('backend.search', level='WARNING'):
            sources = await self.read(browser, {**SEARCH, 'airlines': ['tarco', 'badr', 'sudanair']})
        self.assertEqual(browser.attempts, {'tarco': 1, 'badr': 1, 'sudanair': 1})
        self.assertEqual([s['status'] for s in sources], ['blocked'] * 3)
        self.assertEqual([s['httpStatus'] for s in sources], [403, 401, 429])
        self.assertTrue(all(s['reason'] == 'upstream_http' for s in sources))
        self.assertTrue(all(c.closed for c in browser.contexts))

    async def test_context_failure_does_not_discard_other_source(self):
        browser = FakeBrowser(fail_contexts={1})
        with self.assertLogs('backend.search', level='WARNING') as logs:
            sources = await self.read(browser)
        self.assertEqual(sources[0]['reason'], 'context_failed')
        self.assertEqual(sources[0]['errorClass'], 'RuntimeError')
        self.assertEqual(sources[1]['status'], 'ok')
        self.assertEqual(len(sources[1]['flights']), 1)
        self.assertNotIn(PRIVATE_ERROR, '\n'.join(logs.output))
        self.assertNotIn('private-session', str(sources))
        self.assertNotIn('private-cookie', str(sources))

    async def test_context_and_browser_cleanup_failures_preserve_successes(self):
        browser = FakeBrowser({'tarco': [{'cleanup_error': RuntimeError(PRIVATE_ERROR)}]}, close_error=RuntimeError(PRIVATE_ERROR))
        with self.assertLogs('backend.search', level='WARNING') as logs:
            sources = await self.read(browser)
        self.assertEqual([s['status'] for s in sources], ['ok', 'ok'])
        self.assertTrue(browser.closed)
        self.assertTrue(all(c.closed for c in browser.contexts))
        self.assertNotIn(PRIVATE_ERROR, '\n'.join(logs.output))

    async def test_one_transient_failure_is_retried_and_recovers(self):
        for first in [{'http_status': 503}, {'navigation_error': TimeoutError(PRIVATE_ERROR)}, {'navigation_error': RuntimeError(PRIVATE_ERROR)}, {'readiness_error': TimeoutError(PRIVATE_ERROR)}]:
            with self.subTest(first=next(iter(first))):
                browser = FakeBrowser({'badr': [first, {}]})
                with self.assertLogs('backend.search', level='WARNING') as logs:
                    sources = await self.read(browser, {**SEARCH, 'airlines': ['badr']})
                self.assertEqual(browser.attempts['badr'], 2)
                self.assertEqual(sources[0]['status'], 'ok')
                self.assertNotIn('reason', sources[0])
                self.assertNotIn('httpStatus', sources[0])
                self.assertNotIn('errorClass', sources[0])
                self.assertNotIn(PRIVATE_ERROR, '\n'.join(logs.output))

    async def test_transient_failure_has_at_most_one_retry(self):
        browser = FakeBrowser({'badr': [{'http_status': 503}]})
        with self.assertLogs('backend.search', level='WARNING'):
            sources = await self.read(browser, {**SEARCH, 'airlines': ['badr']})
        self.assertEqual(browser.attempts['badr'], 2)
        self.assertEqual(sources[0]['status'], 'unavailable')
        self.assertEqual(sources[0]['httpStatus'], 503)

    async def test_mismatched_queries_and_changed_pages_fail_closed_without_retry(self):
        for behavior, reason in [({'body': BODY.replace('21 October, 2026', '22 October, 2026')}, 'query_mismatch'), ({'title': 'Booking engine'}, 'unexpected_page'), ({'body': 'PZU CAI 21 October, 2026 Travel time unknown markup'}, 'parse_failed')]:
            with self.subTest(reason=reason):
                browser = FakeBrowser({'badr': [behavior]})
                with self.assertLogs('backend.search', level='WARNING'):
                    sources = await self.read(browser, {**SEARCH, 'airlines': ['badr']})
                self.assertEqual(browser.attempts['badr'], 1)
                self.assertEqual(sources[0]['status'], 'unrecognized')
                self.assertEqual(sources[0]['reason'], reason)
                self.assertEqual(sources[0]['flights'], [])

    async def test_source_deadline_keeps_completed_other_source(self):
        browser = FakeBrowser({'tarco': [{'hang': True}]})
        real_timeout = asyncio.timeout
        def short_source_timeout(seconds):
            return real_timeout(0.03 if seconds == 65 else seconds)
        start = time.monotonic()
        with patch('backend.search.asyncio.timeout', side_effect=short_source_timeout):
            with self.assertLogs('backend.search', level='WARNING'):
                sources = await self.read(browser)
        self.assertLess(time.monotonic() - start, 1)
        self.assertEqual(sources[0]['reason'], 'source_timeout')
        self.assertEqual(sources[1]['status'], 'ok')
        self.assertTrue(all(c.closed for c in browser.contexts))

    async def test_confirmed_empty_results_are_successfully_read(self):
        empty = (Path(__file__).parent / 'fixtures' / 'tarco.txt').read_text()
        browser = FakeBrowser({'tarco': [{'body': empty}]})
        sources = await self.read(browser, {**SEARCH, 'airlines': ['tarco']})
        self.assertEqual(sources[0]['status'], 'no_results')
        self.assertEqual(sources[0]['flights'], [])
        self.assertNotIn('reason', sources[0])

    async def test_source_rejection_of_sar_is_reported_as_unsupported_currency(self):
        text=(Path(__file__).parent/'fixtures'/'badr-sar.txt').read_text()
        browser=FakeBrowser({'badr':[{'title':'Book a new flight','body':text}]})
        with self.assertLogs('backend.search',level='WARNING'):
            sources=await self.read(browser,{**SEARCH,'currency':'SAR','airlines':['badr']})
        self.assertEqual(sources[0]['status'],'currency_unavailable')
        self.assertEqual(sources[0]['reason'],'unsupported_currency')
        self.assertEqual(sources[0]['flights'],[])
        self.assertEqual(browser.attempts['badr'],1)

    async def test_tarco_alternative_date_is_not_shown_as_requested_date(self):
        text=(Path(__file__).parent/'fixtures'/'tarco-krt-sdg.txt').read_text()
        browser=FakeBrowser({'tarco':[{'body':text}]})
        with self.assertLogs('backend.search',level='WARNING'):
            sources=await self.read(browser,{**SEARCH,'to':'KRT','date':'2026-10-18','currency':'SDG','airlines':['tarco']})
        self.assertEqual(sources[0]['reason'],'query_mismatch')
        self.assertEqual(sources[0]['flights'],[])


if __name__ == '__main__':
    unittest.main()
