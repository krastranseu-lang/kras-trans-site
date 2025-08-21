#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate static NAV snapshots from GAS into assets/nav/<lang>.json (+html).
Env:
  CMS_ENDPOINT or APPS_URL – base exec URL (may already contain ?key=…)
  CMS_API_KEY  or APPS_KEY  – API key (appended only if missing)
"""
import os, json, sys, time, pathlib, urllib.parse, urllib.request

LOCALES = ['pl','en','de','fr','it','ru','ua']

def _log(msg): print(msg, file=sys.stdout, flush=True)

def _http_get(url, timeout=40):
    req = urllib.request.Request(
        url,
        headers={'User-Agent':'kt-nav-gen/1.0', 'Accept':'application/json'}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8')

def _with_params(base, **params):
    """Safely merge query params to base URL (do not duplicate existing key=)."""
    p = urllib.parse.urlparse(base)
    q = dict((k, v[0] if isinstance(v, list) else v) for k, v in urllib.parse.parse_qs(p.query, keep_blank_values=True).items())
    for k, v in params.items():
        if v is None: 
            continue
        if k == 'key' and 'key' in q and q['key']:
            continue
        q[k] = v
    new_q = urllib.parse.urlencode(q, doseq=False)
    return urllib.parse.urlunparse(p._replace(query=new_q))

def _to_routes_map(rows):
    """rows -> {slugKey:{pl:'',en:'',…}}"""
    out = {}
    for r in rows or []:
        key = (str(r.get('slugKey') or r.get('SlugKey') or '').strip())
        if not key: 
            continue
        obj = {}
        for L in LOCALES:
            obj[L] = str(r.get(L) or r.get(L.upper()) or '').strip()
        out[key] = obj
    if 'home' not in out:
        out['home'] = {L:'' for L in LOCALES}
    return out

def main():
    endpoint = os.getenv('CMS_ENDPOINT') or os.getenv('APPS_URL') or ''
    api_key  = os.getenv('CMS_API_KEY')  or os.getenv('APPS_KEY')  or ''
    data = None

    # 1) Fetch once from GAS (prefer) or fallback to data/cms.json
    if endpoint:
        if 'key=' not in endpoint and api_key:
            endpoint = _with_params(endpoint, key=api_key)
        url = _with_params(endpoint, lang='pl', nocache='1')
        _log(f"GET {url}")
        try:
            raw = _http_get(url)
            data = json.loads(raw)
            if not data or data.get('ok') is False:
                raise RuntimeError('API returned ok:false')
        except Exception as e:
            _log(f"::warning ::GAS fetch failed ({e}); trying data/cms.json …")

    if data is None:
        try:
            with open('data/cms.json','r', encoding='utf-8') as f:
                data = json.load(f)
                _log("Using fallback data/cms.json")
        except FileNotFoundError:
            _log("::error ::No CMS data available (endpoint+fallback failed)")
            sys.exit(1)

    # 2) Prepare routes + blog
    routes_map = _to_routes_map(data.get('routes') or [])
    blog_latest = data.get('blog_latest') or []

    # 3) Make sure nav for all langs exists
    nav_all = data.get('nav') or {}
    out_dir = pathlib.Path('assets/nav')
    (out_dir / 'html').mkdir(parents=True, exist_ok=True)

    total = 0
    for L in LOCALES:
        navL = nav_all.get(L) or {}
        snap = {
            'primary_html': navL.get('primary_html',''),
            'mega_html':    navL.get('mega_html',''),
            'cta':          navL.get('cta'),
            'status':       navL.get('status'),
            'social':       navL.get('social'),
            'routes':       routes_map,
            'blog':         blog_latest
        }
        # JSON snapshot consumed by header.js
        json_path = out_dir / f'{L}.json'
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(snap, f, ensure_ascii=False, separators=(',',':'))
        # Helper HTML (optional)
        html_path = out_dir / 'html' / f'{L}.html'
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write('<ul class="nav__list">' + (snap['primary_html'] or '') + '</ul>')

        total += 1
        _log(f"✔ {L}: {json_path} ({json_path.stat().st_size} bytes)")

    _log(f"Done. Generated {total} language snapshots into assets/nav/")
    return 0

if __name__ == '__main__':
    sys.exit(main())
