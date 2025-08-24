import json
from pathlib import Path

import openpyxl
from bs4 import BeautifulSoup

XLSX_PATH = Path('data/cms/menu.xlsx')
DIST = Path('dist')


def truthy(val):
    s = str(val).strip().lower()
    return s in {'1', 'true', 'yes', 'tak', 'on', 'prawda'}


def load_sheet(name):
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    return wb[name]


def test_pages_content_matches_cms():
    ws = load_sheet('Pages')
    rows = list(ws.iter_rows(values_only=True))
    header = [str(h or '').strip().lower() for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}
    seen = {}
    for r in rows[1:]:
        if not r:
            continue
        lang = (r[idx['lang']] or '').strip().lower()
        slug = (r[idx['slug']] or '').strip('/')
        publish = truthy(r[idx['publish']]) if 'publish' in idx else True
        if not publish:
            continue
        seen[(lang, slug)] = r
    for (lang, slug), r in seen.items():
        path = DIST / lang
        if slug:
            path /= slug
        path /= 'index.html'
        if not path.exists():
            continue
        html = path.read_text(encoding='utf-8')
        soup = BeautifulSoup(html, 'lxml')
        title_expected = (r[idx.get('seo_title')] or r[idx.get('title')] or '').strip()
        h1_expected = (r[idx.get('h1')] or '').strip()
        cta_expected = (r[idx.get('cta_label')] or '').strip()
        lead_expected = (r[idx.get('lead')] or '').strip()
        title_actual = soup.title.string.strip() if soup.title else ''
        h1_actual = soup.find('h1').get_text(strip=True) if soup.find('h1') else ''
        cta_el = soup.select_one('#cta')
        cta_actual = cta_el.get_text(strip=True) if cta_el else ''
        lead_el = soup.select_one('#hero-lead')
        lead_actual = lead_el.get_text(strip=True) if lead_el else ''
        assert title_actual == title_expected, f"title mismatch for {path}: {title_actual!r} != {title_expected!r}"
        assert h1_actual == h1_expected, f"h1 mismatch for {path}: {h1_actual!r} != {h1_expected!r}"
        if cta_expected:
            assert cta_actual == cta_expected, f"cta_label mismatch for {path}: {cta_actual!r} != {cta_expected!r}"
        if lead_expected:
            assert lead_actual == lead_expected, f"lead mismatch for {path}: {lead_actual!r} != {lead_expected!r}"


def test_nav_menu_matches_cms():
    ws = load_sheet('Nav')
    rows = list(ws.iter_rows(values_only=True))
    header = [str(h or '').strip().lower() for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}
    nav_expected = {}
    for r in rows[1:]:
        if not r:
            continue
        lang = (r[idx['lang']] or '').strip().lower()
        enabled = truthy(r[idx.get('enabled', 0)]) if 'enabled' in idx else True
        parent = (r[idx.get('parent')] or '').strip()
        label = (r[idx['label']] or '').strip()
        href = (r[idx['href']] or '').strip()
        order = r[idx.get('order')] or 0
        if not enabled or parent:
            continue
        nav_expected.setdefault(lang, []).append((order, label, href))
    for lang, items in nav_expected.items():
        bundle_path = DIST / 'assets' / 'data' / 'menu' / f'bundle_{lang}.json'
        assert bundle_path.exists(), f'missing bundle {bundle_path}'
        data = json.loads(bundle_path.read_text(encoding='utf-8'))
        actual_items = [
            (it.get('order', 0), it['label'], it['href'])
            for it in data.get('items', [])
        ]
        assert sorted(actual_items) == sorted(items), f"nav mismatch for {lang}"
