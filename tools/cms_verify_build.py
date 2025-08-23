#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Simple post-build verifier for CMS-driven pages and menus."""
import json, sys
from pathlib import Path
import cms_ingest

ROOT = Path('.')
DIST = ROOT / 'dist'
DATA = ROOT / 'data'


def main() -> int:
    cms = cms_ingest.load_all(DATA / 'cms')
    pages_rows = cms.get('pages_rows', [])
    missing = []
    langs = set()
    for row in pages_rows:
        lang = (row.get('lang') or 'pl').lower()
        slug = row.get('slug') or ''
        langs.add(lang)
        if slug:
            p = DIST / lang / slug / 'index.html'
        else:
            p = DIST / lang / 'index.html'
        if not p.exists():
            missing.append(str(p))
    # verify menu bundles
    for lang in langs:
        bpath = DIST / 'assets' / 'data' / 'menu' / f'bundle_{lang}.json'
        if not bpath.exists():
            missing.append(str(bpath))
            continue
        try:
            data = json.loads(bpath.read_text('utf-8'))
            if not data.get('items'):
                missing.append(str(bpath))
        except Exception:
            missing.append(str(bpath))
    if missing:
        print('Missing outputs:', file=sys.stderr)
        for m in missing:
            print(m, file=sys.stderr)
        return 1
    print('[cms_verify_build] OK')
    return 0

if __name__ == '__main__':
    sys.exit(main())
