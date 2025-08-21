#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate static NAV snapshots into:
  assets/nav/bundle_<lang>.json  (primary_html, mega_html, langs_html, cta, status, social)
Env:
  CMS_ENDPOINT or APPS_URL – exec URL (może już zawierać ?key=...)
  CMS_API_KEY  or APPS_KEY  – API key (dokleimy tylko jeśli nie ma w URL)
"""
import os, sys, json, pathlib, urllib.parse, urllib.request

LOCALES = ['pl','en','de','fr','it','ru','ua']

def log(msg): print(msg, file=sys.stdout, flush=True)

def http_get(url, timeout=40):
    req = urllib.request.Request(url, headers={
        'User-Agent':'kt-nav-gen/1.0', 'Accept':'application/json'
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8')

def with_params(base, **params):
    p = urllib.parse.urlparse(base)
    q = dict((k, v[0] if isinstance(v, list) else v)
             for k, v in urllib.parse.parse_qs(p.query, keep_blank_values=True).items())
    for k, v in params.items():
        if v is None: 
            continue
        if k == 'key' and 'key' in q and q['key']:
            continue
        q[k] = v
    return urllib.parse.urlunparse(p._replace(query=urllib.parse.urlencode(q)))

def main():
    endpoint = os.getenv('CMS_ENDPOINT') or os.getenv('APPS_URL') or ''
    api_key  = os.getenv('CMS_API_KEY')  or os.getenv('APPS_KEY')  or ''
    if not endpoint:
        log("::error ::No CMS_ENDPOINT/APPS_URL provided"); sys.exit(1)
    if 'key=' not in endpoint and api_key:
        endpoint = with_params(endpoint, key=api_key)

    out_dir = pathlib.Path('assets/nav'); out_dir.mkdir(parents=True, exist_ok=True)
    total = 0

    # pobierz dla jednego języka pełny payload (routes/blog)
    base_json = None
    try:
        url = with_params(endpoint, lang='pl', nocache='1')
        base_json = json.loads(http_get(url))
    except Exception as e:
        log(f"::error ::Fetch base JSON failed: {e}"); sys.exit(1)

    routes = base_json.get('routes') or []
    blog   = base_json.get('blog_latest') or []

    for L in LOCALES:
        try:
            url = with_params(endpoint, lang=L, nocache='1')
            log(f"GET {url}")
            data = json.loads(http_get(url))
            nav  = (data.get('nav_current') or
                    (data.get('nav') or {}).get(L) or {})

            bundle = {
                "primary_html": nav.get("primary_html",""),
                "mega_html":    nav.get("mega_html",""),
                "langs_html":   nav.get("langs_html",""),
                "cta":          nav.get("cta",None),
                "status":       nav.get("status",None),
                "social":       nav.get("social",None),
                # dokładamy dla headera snapshoty routingu/blogu (mogą się przydać)
                "routes": routes,
                "blog":   blog
            }

            p = out_dir / f"bundle_{L}.json"
            p.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
            log(f"✔ {p} ({p.stat().st_size} bytes)")
            total += 1
        except Exception as e:
            log(f"::warning ::{L}: {e}")

    log(f"Done. Generated {total}/{len(LOCALES)} bundles in assets/nav/")
    return 0

if __name__ == "__main__":
    sys.exit(main())
