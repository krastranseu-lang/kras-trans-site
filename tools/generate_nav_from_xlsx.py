#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate static NAV bundles from single XLSX:
  input:  data/cms.xlsx  (sheets: Routes, Nav, [Props])
  output: assets/nav/bundle_<lang>.json

- Zero GAS, zero limitów. Szybkie i powtarzalne.
- Primary bar = rodzice (bez href) + single (bez parent)
- Mega = dzieci pogrupowane po 'parent'
- Parent bez landing page => href="#", pełni rolę toggle (bez 404)
- CTA/logo/status/social z opcjonalnego sheeta Props (per lang)
"""

import json, sys, pathlib, re
from collections import defaultdict, OrderedDict

from openpyxl import load_workbook
from unidecode import unidecode

LOCALES = ['pl','en','de','fr','it','ru','ua']

def slugify(raw: str) -> str:
    s = unidecode((raw or '').strip().lower())
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s

def truthy(v):
    s = str(v).strip().lower()
    return s in ('1','true','yes','y','t')

def read_routes(ws):
    head = [c.value for c in ws[1]]
    try: idx_slug = head.index('slugKey')
    except ValueError:
        raise SystemExit("[Routes] Missing 'slugKey' header")
    langs = [h for h in head if h and h.lower() in LOCALES]
    routes = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        slug_key = (row[idx_slug] or '').strip()
        if not slug_key: continue
        m = {}
        for h, v in zip(head, row):
            if not h: continue
            k = h.lower()
            if k in LOCALES:
                m[k] = (v or '').strip().lstrip('/').rstrip('/')
        routes[slug_key] = m
    return routes

def read_props(ws):
    props = defaultdict(dict)  # props[lang][key] = value
    head = [c.value for c in ws[1]]
    try:
        i_key  = head.index('key')
        i_lang = head.index('lang')
        i_val  = head.index('value')
    except ValueError:
        raise SystemExit("[Props] Expected headers: key, lang, value")
    for row in ws.iter_rows(min_row=2, values_only=True):
        key  = (row[i_key]  or '').strip()
        lang = (row[i_lang] or '').strip().lower()
        val  = (row[i_val]  or '').strip()
        if key and lang:
            props[lang][key] = val
    return props

def read_nav(ws):
    head = [c.value for c in ws[1]]
    # required
    idx = {}
    for h in ('lang','label','href','parent','order','enabled'):
        try: idx[h] = head.index(h)
        except ValueError:
            raise SystemExit(f"[Nav] Missing header '{h}'")
    per_lang = defaultdict(list)
    for row in ws.iter_rows(min_row=2, values_only=True):
        lang   = (row[idx['lang']] or '').strip().lower()
        if lang not in LOCALES: continue
        label  = (row[idx['label']] or '').strip()
        href   = (row[idx['href']]  or '').strip()
        parent = (row[idx['parent']] or '').strip()
        order  = row[idx['order']]
        enabled= row[idx['enabled']]
        if not label: continue
        if enabled is not None and not truthy(enabled): continue
        try: order = int(order)
        except Exception: order = 9999
        per_lang[lang].append({
            'label':label, 'href':href, 'parent':parent, 'order':order
        })
    # sort by order then label
    for lang, items in per_lang.items():
        items.sort(key=lambda x:(x['order'], x['parent'] or '', x['label']))
    return per_lang

def primary_html_from_items(items):
    """Build primary bar HTML from items grouped by parent.
       - rodzic (parent none, href empty) → <li data-panel="..."><a href="#"></a>
       - single (no parent, href set)     → <li><a href="..."></a>
    """
    singles = []
    groups  = OrderedDict()
    seen    = set()
    for it in items:
        key = (it['label'], it['href'], it['parent'])
        if key in seen: continue
        seen.add(key)
        if it['parent']:
            groups.setdefault(it['parent'], []).append(it)
        elif it['href']:
            singles.append(it)
        else:
            # to też traktujemy jako parent bez dzieci; pokaż w pasku jako toggle
            groups.setdefault(it['label'], [])

    # singles
    li = []
    for s in singles:
        li.append(f'<li><a href="{s["href"]}">{s["label"]}</a></li>')
    # parents
    for parent in groups.keys():
        li.append(f'<li data-panel="{slugify(parent)}"><a href="#">{parent}</a></li>')
    return ''.join(li)

def mega_html_from_items(items):
    groups = OrderedDict()
    for it in items:
        if it['parent']:
            groups.setdefault(it['parent'], []).append(it)
    sections = []
    for parent, rows in groups.items():
        cards = ''.join([f'<div class="card"><a href="{r["href"]}">{r["label"]}</a></div>' for r in rows if r['href']])
        sections.append(f'<section class="mega__section" data-panel="{slugify(parent)}"><div class="mega__grid">{cards}</div></section>')
    return ''.join(sections)

def langs_html_for_lang(lang):
    # prosty picker języków – link na /{L}/ + aria-current
    tags = []
    for L in LOCALES:
        cur = ' aria-current="true"' if L==lang else ''
        tags.append(f'<a href="/{L}/"{cur}><img class="flag" src="/assets/flags/{ "gb" if L=="en" else L }.svg" alt="" width="18" height="12">{L.upper()}</a>')
    return ' '.join(tags)

def build_bundle(lang, items, routes, props):
    bundle = {
        'primary_html': primary_html_from_items(items),
        'mega_html':    mega_html_from_items(items),
        'langs_html':   langs_html_for_lang(lang),
        'routes':       routes,   # dla CTA/langs w runtime
    }
    # Props (opcjonalnie)
    p = props.get(lang, {})
    if p:
        # CTA
        cta = {}
        if p.get('cta_label'):   cta['label']   = p['cta_label']
        if p.get('cta_slugKey'): cta['slugKey'] = p['cta_slugKey']
        if cta: bundle['cta'] = cta
        # Logo
        logo = {}
        if p.get('logo_src'): logo['src'] = p['logo_src']
        if p.get('logo_alt'): logo['alt'] = p['logo_alt']
        if logo: bundle['logo'] = logo
        # Status
        status = {}
        if p.get('status_label'): status['label'] = p['status_label']
        if p.get('status_href'):  status['href']  = p['status_href']
        if status: bundle['status'] = status
        # Social
        social = {}
        for k in ('ig','li','fb'):
            v = p.get(f'social_{k}')
            if v: social[k] = v
        if social: bundle['social'] = social
    return bundle
  
def main():
    src = pathlib.Path('data/cms.xlsx')
    if not src.exists(): raise SystemExit("Missing data/cms.xlsx")
    wb = load_workbook(str(src), data_only=True)

    # Required sheets
    if 'Routes' not in wb.sheetnames or 'Nav' not in wb.sheetnames:
        raise SystemExit("Expected sheets: 'Routes' and 'Nav' (optional: 'Props')")

    routes = read_routes(wb['Routes'])
    nav_map = read_nav(wb['Nav'])
    props   = read_props(wb['Props']) if 'Props' in wb.sheetnames else {}

    out_dir = pathlib.Path('assets/nav')
    out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for lang in LOCALES:
        items = nav_map.get(lang, [])
        if not items: continue
        bundle = build_bundle(lang, items, routes, props)
        out = out_dir / f"bundle_{lang}.json"
        out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
        print(f"✔ {out} ({out.stat().st_size} bytes)")
        total += 1
    print(f"Done. Generated {total} bundles in assets/nav/")
    return 0

if __name__ == "__main__":
    sys.exit(main())
