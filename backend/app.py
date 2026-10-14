import asyncio
import datetime as dt
import json
import threading
import time
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from .search import validate, search_airlines

ROOT = Path(__file__).resolve().parent.parent
app = Flask(__name__, static_folder=None)
browser_slots = threading.BoundedSemaphore(1)
cache = {}
cache_lock = threading.Lock()

@app.get('/api/health')
def health():
    return jsonify(status='ok', engine='CloakBrowser')

@app.get('/api/search')
def search():
    try:
        criteria = validate(request.args)
    except ValueError as exc:
        return jsonify(error='INVALID_SEARCH', message=str(exc)), 400
    key = json.dumps(criteria, sort_keys=True)
    with cache_lock:
        now = time.monotonic()
        for old in [k for k, (until, _) in cache.items() if until <= now]:
            cache.pop(old, None)
        cached = cache.get(key)
    if cached:
        return jsonify(cached[1]), 200, {'Cache-Control': 'no-store'}
    if not browser_slots.acquire(blocking=False):
        return jsonify(error='BUSY', message='يجري بحث آخر حاليًا. حاول مجددًا بعد قليل.'), 429, {'Retry-After': '15'}
    try:
        async def run():
            async with asyncio.timeout(80):
                return await search_airlines(criteria)
        sources = asyncio.run(run())
        payload = {'search': criteria, 'sources': sources, 'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
        if all(source['status'] in {'ok', 'no_results'} for source in sources):
            with cache_lock:
                if len(cache) < 100:
                    cache[key] = (time.monotonic() + 30, payload)
        return jsonify(payload), 200, {'Cache-Control': 'no-store'}
    except Exception:
        return jsonify(error='SOURCE_UNAVAILABLE', message='تعذّر تشغيل البحث لدى الشركات. حاول مجددًا أو افتح صفحة الشركة.'), 503, {'Cache-Control': 'no-store'}
    finally:
        browser_slots.release()

@app.get('/')
def index():
    return send_from_directory(ROOT / 'dist', 'index.html')

@app.get('/<path:path>')
def static_file(path):
    return send_from_directory(ROOT / 'dist', path)
