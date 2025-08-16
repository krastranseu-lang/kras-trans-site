#!/bin/bash
set -e
# Ensure cms.json shipped to build output
(test -f dist/data/cms.json || test -f out/data/cms.json || test -f public/data/cms.json)
# Ensure footer markup present in built HTML
(grep -R "class=\"site-footer\"" -n -m 1 -o dist || grep -R "class=\"site-footer\"" -n -m 1 -o out || grep -R "class=\"site-footer\"" -n -m 1 -o build)
# Basic JSON sanity
python - <<'PY'
import json, pathlib
p = pathlib.Path('data') / 'cms.json'
with p.open(encoding='utf-8') as f:
    cms = json.load(f)
assert cms.get('ok') == True
assert len(cms.get('pages', [])) > 0
assert len(cms.get('nav', [])) > 0
print('cms.json sanity OK')
PY
