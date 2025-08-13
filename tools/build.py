#!/usr/bin/env python3
import json, os, shutil, time, pathlib, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CMS  = ROOT / "data" / "cms.json"

def clean():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def copy_static():
    skip = {".git", ".github", "data", "tools", "dist"}
    for p in ROOT.iterdir():
        if p.name in skip: 
            continue
        if p.is_dir():
            shutil.copytree(p, DIST / p.name, dirs_exist_ok=True)
        else:
            shutil.copy2(p, DIST / p.name)

def keep_cms_json():
    dst = DIST / "data"
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CMS, dst / "cms.json")

def write_robots(base="https://kras-trans.com"):
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", "utf-8"
    )

# --- NOWE: transformacja cms.json -> input dla menu-builder ---
def build_menu_and_sitemap(site="https://kras-trans.com"):
    j = json.loads(CMS.read_text("utf-8"))

    pages = j.get("pages", [])

    # dopilnuj kilku pól, które menu-builder wykorzystuje
    def norm(p):
        q = dict(p)
        q["slug"]   = (q.get("slug") or "").strip() or f"/{(q.get('lang') or 'pl').strip('/')}/"
        q["lang"]   = (q.get("lang") or "pl").strip().lower()
        q["type"]   = (q.get("type") or "leaf").strip().lower()  # home/pillar/hub/leaf/service
        q["title"]  = q.get("title") or q.get("h1") or ""
        q["menu_label"] = q.get("menu_label") or q["title"]
        # Upewnij się, że masz w Arkuszu kolumnę 'country_code' (np. DE/IT/FR/ES) dla hub/leaf:
        q["country_code"] = (q.get("country_code") or "").upper()
        q["priority"] = int(q.get("priority") or 0)
        q["show_in_header"] = (str(q.get("show_in_header") or "true").lower() != "false")
        # grupa hreflang (może być 'slugKey' z Arkusza)
        q["hreflang_group_id"] = q.get("slugKey") or q.get("hreflang_group_id") or ""
        return q

    new_pages = [norm(p) for p in pages if p.get("publish") != False]

    input_payload = {
        "current_state": {
            "site": site,
            "existing_pages": []  # nie potrzebujemy diffów na starcie
        },
        "new_pages": new_pages
    }

    # uruchomienie menu-builder
    with tempfile.TemporaryDirectory() as td:
        in_file  = pathlib.Path(td) / "in.json"
        out_file = pathlib.Path(td) / "out.json"
        in_file.write_text(json.dumps(input_payload), "utf-8")

        subprocess.run(
            ["node", "tools/menu-builder.js", "--in", str(in_file), "--out", str(out_file)],
            check=True
        )

        out = json.loads(out_file.read_text("utf-8"))

    # zapisz wynik do dist/
    datadir = DIST / "data"
    datadir.mkdir(parents=True, exist_ok=True)

    # menu header/footer per język
    for lang, data in (out.get("menu_header") or {}).items():
        (datadir / f"menu_header.{lang}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    for lang, data in (out.get("menu_footer") or {}).items():
        (datadir / f"menu_footer.{lang}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")

    # breadcrumbs
    (datadir / "breadcrumbs.json").write_text(json.dumps(out.get("breadcrumbs") or [], ensure_ascii=False, indent=2), "utf-8")

    # sitemap (z alternates/hreflang)
    sm = out.get("sitemap_xml") or ""
    (DIST / "sitemap.xml").write_text(sm, "utf-8")

def write_cname():
    (DIST / "CNAME").write_text("kras-trans.com\n", "utf-8")

def main():
    if not CMS.exists():
        raise SystemExit("cms.json not found")
    clean()
    copy_static()
    keep_cms_json()
    # zamiast prostego write_sitemap() używamy wersji z menu-buildera:
    build_menu_and_sitemap(site="https://kras-trans.com")
    write_robots()
    write_cname()

if __name__ == "__main__":
    main()
