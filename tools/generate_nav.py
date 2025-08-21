#!/usr/bin/env python3
# tools/generate_nav.py
import os, json, pathlib, urllib.request, urllib.parse, sys

LOCALES = ["pl","en","de","fr","it","ru","ua"]

ENDPOINT = os.getenv("CMS_ENDPOINT", "").strip()
API_KEY  = os.getenv("CMS_API_KEY", "").strip()

root = pathlib.Path(__file__).resolve().parents[1]
gen  = root / "templates" / "_generated"
data = root / "assets" / "data"
gen.mkdir(parents=True, exist_ok=True)
data.mkdir(parents=True, exist_ok=True)

def fetch(lang):
    if not ENDPOINT or not API_KEY:
        raise SystemExit("Brak CMS_ENDPOINT lub CMS_API_KEY")
    qs = urllib.parse.urlencode({"key": API_KEY, "lang": lang, "nocache": "1"})
    url = f"{ENDPOINT}?{qs}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def write_text(p: pathlib.Path, s: str):
    p.write_text(s or "", encoding="utf-8")

def main():
    ok = 0
    for L in LOCALES:
        try:
            payload = fetch(L)
            nav = payload.get("nav_current", {}) or {}
            # HTML-e do wstrzyknięcia w headerze
            write_text(gen / f"nav-{L}-primary.html", nav.get("primary_html",""))
            write_text(gen / f"nav-{L}-mega.html",    nav.get("mega_html",""))
            write_text(gen / f"nav-{L}-langs.html",   nav.get("langs_html",""))
            # CTA/logo/status/social do JS
            small = {
                "cta":   nav.get("cta",   {}),
                "logo":  nav.get("logo",  {}),
                "status":nav.get("status",None),
                "social":nav.get("social",{})
            }
            (data / f"nav-{L}.json").write_text(json.dumps(small, ensure_ascii=False), encoding="utf-8")
            ok += 1
        except Exception as e:
            print(f"[WARN] {L}: {e}", file=sys.stderr)
    print(f"[nav] generated for {ok}/{len(LOCALES)} locales")

if __name__ == "__main__":
    main()
