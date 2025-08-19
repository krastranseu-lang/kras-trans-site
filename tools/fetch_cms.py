# FILE: tools/fetch_cms.py
#!/usr/bin/env python3
"""
Pobiera JSON z CMS (Google Apps Script) i zapisuje do data/cms.json.
Używane lokalnie oraz w CI przed buildem.
"""
import json, sys, os, urllib.request

SITE_URL = "https://kras-trans.com"
CMS_API_URL = "https://script.google.com/macros/s/AKfycbyQcsU1wSCV6NGDQm8VIAGpZkL1rArZe1UZ5tutTkjJiKZtr4MjQZcDFzte26VtRJJ2KQ/exec"
CMS_API_KEY = "kb6mWQJQ3hTtY0m1GQ7v2rX1pC5n9d8zA4s6L2u"
CMS_ENDPOINT = f"{CMS_API_URL}?key={CMS_API_KEY}"

def fetch(url: str):
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Kras-Trans Builder/1.0 (+%s)" % SITE_URL
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        charset = r.headers.get_content_charset() or "utf-8"
        text = r.read().decode(charset)
        return json.loads(text)

def main(out_path: str = "data/cms.json"):
    data = fetch(CMS_ENDPOINT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[ok] Zapisano {out_path} z {CMS_ENDPOINT}")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "data/cms.json"
    main(out)
