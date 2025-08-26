import json
from pathlib import Path

def _iter_items(items):
    for it in items or []:
        yield it
        for ch in _iter_items(it.get('children')):
            yield ch

def test_nav_bundles():
    dir_path = Path('dist/assets/data/menu')
    assert dir_path.exists(), 'menu bundles missing'
    for p in dir_path.glob('bundle_*.json'):
        data = json.loads(p.read_text(encoding='utf-8'))
        meta = data.get('meta', {})
        assert meta.get('logo', {}).get('src'), f"{p.name} missing logo.src"
        assert meta.get('cta', {}).get('label'), f"{p.name} missing cta.label"
        for it in _iter_items(data.get('items')):
            href = it.get('href', '')
            if href.startswith('/'):
                assert href.endswith('/'), f"{p.name} href '{href}' missing slash"
        for it in data.get('items', []):
            assert not it.get('parent'), f"{p.name} top-level item has parent"
