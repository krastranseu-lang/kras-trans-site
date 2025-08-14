#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans • Static build (PRO)
- Czyta data/cms.json (Apps Script)
- Renderuje Jinja2 (templates/*.html)
- Kopiuje /assets -> /dist
- Post-processing HTML (lazy img, noopener, minify light)
- Autolinkowanie (whitelist) z arkusza AutoLinks
- Quality gates (rozmiary, H1/alt/canonical, link-check)
- Generuje sitemap.xml, robots.txt, CNAME, 404.html, snapshot ZIP

ENV (opcjonalne):
  SITE_URL, DEFAULT_LANG, BRAND, CNAME, STRICT (1/0)
"""

from __future__ import annotations
import os, sys, re, json, gzip, io, shutil, zipfile, hashlib, html
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateNotFound
from bs4 import BeautifulSoup, NavigableString
from slugify import slugify

# === ŚCIEŻKI
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "cms.json"
TPLS = ROOT / "templates"
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"

# === ENV
SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = (os.getenv("DEFAULT_LANG") or "pl").lower()
BRAND = os.getenv("BRAND", "Kras-Trans")
CNAME_TARGET = os.getenv("CNAME", "").strip()
STRICT = int(os.getenv("STRICT", "1"))

# === PROGI / BUDŻETY (możesz dopasować)
BUDGET_HTML_GZIP = 40 * 1024   # 40 KB .gz
MAX_AUTOLINKS_PER_SECTION = 2  # bezpieczeństwo

# === POMOCNICZE
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def t(x: Any) -> str:
    """Bezpieczny tekst."""
    if x is None: return ""
    if isinstance(x, (int, float)): return str(x)
    return str(x).strip()

def gz_size(data: bytes) -> int:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gzf:
        gzf.write(data)
    return len(buf.getvalue())

def mkdirp(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)

# === LOGOWANIE PROBLEMÓW
ISSUES: List[Dict[str, str]] = []
def warn(path: str, msg: str):
    ISSUES.append({"level":"warn", "path":path, "msg":msg})
def fail(path: str, msg: str):
    ISSUES.append({"level":"error", "path":path, "msg":msg})

# === WSTRZYMANIE, JEŚLI BRAKUJE CMS
if not DATA.exists():
    raise SystemExit("Brak data/cms.json – upewnij się, że krok 'Fetch CMS JSON' działa.")

# === WCZYTANIE CMS
with open(DATA, "r", encoding="utf-8") as f:
    CMS = json.load(f)

# Sekcje (z bezpiecznym fallbackiem)
PAGES      = CMS.get("pages", []) or []
FAQ        = CMS.get("faq", []) or []
MEDIA      = CMS.get("media", []) or []
COMPANY    = CMS.get("company", []) or []
REDIRECTS  = CMS.get("redirects", []) or []
BLOCKS     = CMS.get("blocks", []) or []
NAV        = CMS.get("nav", []) or []
TEMPLS_CMS = CMS.get("templates", []) or []
STR_ROWS   = CMS.get("strings", []) or []
ROUTES     = CMS.get("routes", []) or []
PLACES     = CMS.get("places", []) or []
BLOG       = CMS.get("blog", []) or []
REVIEWS    = CMS.get("reviews", []) or []
AUTHORS    = CMS.get("authors", []) or []
CATEGORIES = CMS.get("categories", []) or []
JOBS       = CMS.get("jobs", []) or []
AUTOLINKS  = CMS.get("autolinks", []) or []

# === STRINGS: arkusz "Strings" -> dict per lang
def build_strings(rows: List[dict], lang: str) -> Dict[str, str]:
    out: Dict[str,str] = {}
    for r in rows or []:
        key = t(r.get("key") or r.get("id") or r.get("slug"))
        if not key: continue
        val = r.get(lang) or r.get("value") or r.get("val") or ""
        out[key] = t(val)
    return out

# === TEMPLATE MAP
def template_for(page: dict) -> str:
    """Dobiera plik szablonu: explicit -> wg type -> fallback 'page.html'."""
    name = t(page.get("template"))
    if name and (TPLS / name).exists():
        return name
    # mapowanie wg CMS.templates (type -> file)
    ptype = t(page.get("type")).lower() or "page"
    for row in TEMPLS_CMS:
        if t(row.get("type")).lower() == ptype:
            fname = t(row.get("file")) or ""
            if fname and (TPLS / fname).exists():
                return fname
    # fallback
    return "page.html"

# === Jinja ENV
env = Environment(
    loader=FileSystemLoader(TPLS),
    autoescape=False,  # kontrolujemy ręcznie
    trim_blocks=True,
    lstrip_blocks=True,
)

env.filters["slug"] = lambda s: slugify(t(s))
env.filters["json"] = lambda o: json.dumps(o, ensure_ascii=False)

# === SPRZĄTANIE DIST
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir(parents=True, exist_ok=True)

# === KOPIOWANIE ASSETS (jeśli są)
if ASSETS.exists():
    shutil.copytree(ASSETS, DIST / "assets")

# === ZBIÓR DOKOŃCZONYCH ŚCIEŻEK / URLI
built_files: List[Path] = []
built_urls:  List[str] = []

# === AUTOLINKI (reguły per lang)
def build_autolink_rules(lang: str):
    rules = []
    for r in AUTOLINKS or []:
        if t(r.get("enabled") or r.get("is_enabled") or "TRUE").upper() != "TRUE":
            continue
        if (t(r.get("lang")) or DEFAULT_LANG).lower() != lang.lower():
            continue
        anchor = t(r.get("anchor") or r.get("kw") or "")
        href   = t(r.get("href") or r.get("url") or "")
        if not anchor or not href: continue
        limit  = int(r.get("limit") or 2)
        rules.append({"anchor": anchor, "href": href, "limit": limit, "count": 0})
    return rules

def apply_autolinks(soup: BeautifulSoup, lang: str):
    """Delikatne, bezpieczne autolinki w <p> (z pominięciem już zalinkowanych)."""
    rules = build_autolink_rules(lang)
    if not rules: return
    # skanuj same tekstowe węzły, omijaj <a> i nagłówki
    for p in soup.find_all(["p", "li"]):
        for node in list(p.descendants):
            if not isinstance(node, NavigableString): continue
            if node.parent.name in ("a", "script", "style"): continue
            txt = str(node)
            if not txt or len(txt) < 3: continue
            changed = False
            for r in rules:
                if r["count"] >= r["limit"]: continue
                # słowo graniczne, case-insensitive
                pat = re.compile(rf"(?i)\b({re.escape(r['anchor'])})\b")
                # jeśli węzeł ma już <a>, pomijamy
                if pat.search(txt):
                    new_html = pat.sub(rf'<a href="{html.escape(r["href"])}">\1</a>', txt, count=1)
                    if new_html != txt:
                        new_frag = BeautifulSoup(new_html, "lxml").body
                        # podmień bez utraty reszty
                        node.replace_with(new_frag.decode_contents())
                        r["count"] += 1
                        changed = True
                if r["count"] >= r["limit"]:  # drobny speedup
                    continue
            if changed:
                # przejdź dalej w tym <p>
                continue

# === POST-PROCESSING HTML
def postprocess_html(raw_html: str, lang: str, canon_url: str, out_path: Path) -> str:
    soup = BeautifulSoup(raw_html, "lxml")

    # 1) IMG: lazy + decoding (poza LCP/hero)
    for i, img in enumerate(soup.find_all("img")):
        classes = " ".join(img.get("class", [])).lower()
        if "hero-media" in classes or img.get("fetchpriority") == "high":
            # zostaw LCP
            pass
        else:
            img["loading"] = img.get("loading", "lazy")
            img["decoding"] = img.get("decoding", "async")
        # alt safety
        if not img.get("alt"): img["alt"] = ""

    # 2) target=_blank -> rel=noopener
    for a in soup.find_all("a"):
        if a.get("target") == "_blank":
            rel = set((a.get("rel") or []))
            rel.add("noopener")
            a["rel"] = " ".join(sorted(rel))

    # 3) canonical (jeśli brak) – do <head>
    if not soup.find("link", rel=lambda x: (x or "").lower()=="canonical"):
        head = soup.find("head")
        if head:
            link_tag = soup.new_tag("link", rel="canonical", href=canon_url)
            head.append(link_tag)

    # 4) autolinki (delikatne)
    apply_autolinks(soup, lang)

    # 5) Lekka minifikacja (bezpieczna)
    html_out = soup.decode()
    html_out = re.sub(r">\s+<", "><", html_out)  # usuń nadmiar białych znaków między tagami
    html_out = re.sub(r"\s{2,}", " ", html_out)  # skompresuj spacje

    # 6) Budżet HTML (.gz)
    gz = gz_size(html_out.encode("utf-8"))
    if gz > BUDGET_HTML_GZIP:
        warn(str(out_path), f"HTML gzip {gz}B > budżet {BUDGET_HTML_GZIP}B")

    # 7) H1 / canonical sanity
    h1s = BeautifulSoup(html_out, "lxml").find_all("h1")
    if len(h1s) != 1:
        warn(str(out_path), f"Nieprawidłowa liczba <h1>: {len(h1s)} (powinno być 1)")

    return html_out

# === ZBIERANIE WEWNĘTRZNYCH LINKÓW (po renderze sprawdzimy)
INTERNAL_HREFS: Dict[str, List[str]] = {}

# === RENDER STRON
site_urls_for_sitemap: List[str] = []

strings_cache: Dict[str, Dict[str,str]] = {}

def strings_for(lang: str) -> Dict[str,str]:
    if lang not in strings_cache:
        strings_cache[lang] = build_strings(STR_ROWS, lang)
    return strings_cache[lang]

for page in PAGES:
    lang = (t(page.get("lang")) or DEFAULT_LANG).lower()
    slug = t(page.get("slug")) or ""
    # output path /pl/slug/index.html (home: /pl/index.html)
    out_dir = DIST / lang / slug
    if slug == "" or slug == "/":
        out_dir = DIST / lang
    out_path = out_dir / "index.html"
    mkdirp(out_path)

    # canonical
    path_part = (f"/{lang}/" + (f"{slug}/" if slug else ""))
    canon_url = SITE_URL + path_part

    # template
    tpl_name = template_for(page)

    # related w ramach parentSlug
    samekey = t(page.get("slugKey") or page.get("slug") or "home")
    related = [p for p in PAGES
               if (t(p.get("lang")) or DEFAULT_LANG).lower()==lang
               and t(p.get("parentSlug"))==t(page.get("parentSlug"))
               and t(p.get("slugKey") or p.get("slug")) != samekey][:12]

    # strings
    strings = strings_for(lang)

    # HEAD (mini kontekst do <head>, jeśli w szablonie używasz)
    head = {
        "canonical": canon_url,
        "site_url": SITE_URL,
        "brand": BRAND,
        "updated": now_iso()
    }

    # body_html – jeśli w CMS masz plain markdown/html
    body_html = t(page.get("page_html") or page.get("body_html") or page.get("body") or "")

    # FAQ przywiązane do tej strony (slug/page) + język
    page_slug = t(page.get("slug"))
    page_faq = [f for f in FAQ
                if (t(f.get("lang")) or lang).lower()==lang
                and (t(f.get("slug"))==page_slug or t(f.get("page"))==page_slug)]

    ctx = {
        "site_url": SITE_URL,
        "brand": BRAND,
        "updated": now_iso(),
        "company": COMPANY,
        "nav": NAV,
        "page": page,
        "page_html": body_html,
        "faq": page_faq,
        "related": related,
        "media": MEDIA,
        "head": head,
        "strings": strings,
        "blog": BLOG,
        "authors": AUTHORS,
        "categories": CATEGORIES,
        "reviews": REVIEWS,
        "jobs": JOBS,
        "blocks": BLOCKS,
        "routes": ROUTES,
        "places": PLACES,
        "default_lang": DEFAULT_LANG
    }

    try:
        tmpl = env.get_template(tpl_name)
    except TemplateNotFound:
        tmpl = env.get_template("page.html")

    raw_html = tmpl.render(**ctx)
    html_out = postprocess_html(raw_html, lang, canon_url, out_path)
    out_path.write_text(html_out, encoding="utf-8")
    built_files.append(out_path)
    built_urls.append(canon_url)
    site_urls_for_sitemap.append(canon_url)

    # zbierz linki wewnętrzne do późniejszego sprawdzenia
    soup = BeautifulSoup(html_out, "lxml")
    hrefs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/") and not href.startswith("//"):
            # zignoruj #kotwice na tej samej stronie
            if "#" in href:
                href = href.split("#", 1)[0]
            hrefs.append(href)
    INTERNAL_HREFS[str(out_path)] = hrefs

# === REDIRECTY (proste “hopki” HTML + JS)
def write_redirect(from_path: str, to: str):
    # z wejścia "/pl/stare/" -> zapis /dist/pl/stare/index.html
    p = DIST / from_path.strip("/").rstrip("/") / "index.html"
    mkdirp(p)
    target = to if to.startswith("http") else urljoin(SITE_URL + "/", to.strip("/")) + "/"
    html = f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head>
<meta charset="utf-8"><meta name="robots" content="noindex,follow">
<link rel="canonical" href="{target}">
</head>
<body>
<p>Redirecting to <a href="{target}">{target}</a>.</p>
<script>location.replace("{target}");</script>
</body></html>"""
    p.write_text(html, encoding="utf-8")
    built_files.append(p)

for r in REDIRECTS:
    src = t(r.get("from") or r.get("src") or "")
    dst = t(r.get("to") or r.get("dst") or "")
    if not src or not dst: continue
    write_redirect(src, dst)

# === 404
def write_404():
    p = DIST / "404.html"
    html = f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><title>404 — {BRAND}</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="{SITE_URL}/404.html">
<style>body{{font:16px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:3rem;color:#eaeef3;background:#0b0f17}}a{{color:#ff8a1f}}</style>
</head><body><h1>Nie znaleziono strony</h1>
<p><a href="{SITE_URL}/{DEFAULT_LANG}/">Wróć na stronę główną</a></p></body></html>"""
    p.write_text(html, encoding="utf-8")
    built_files.append(p)

write_404()

# === CNAME
if CNAME_TARGET:
    (DIST / "CNAME").write_text(CNAME_TARGET.strip()+"\n", encoding="utf-8")

# === SITEMAP
def write_sitemap(urls: List[str]):
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    now = datetime.utcnow().date().isoformat()
    for u in sorted(set(urls)):
        sm.append(f"<url><loc>{html.escape(u)}</loc><lastmod>{now}</lastmod></url>")
    sm.append("</urlset>")
    (DIST / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")

write_sitemap(site_urls_for_sitemap)

# === ROBOTS
(DIST / "robots.txt").write_text(
    "User-agent: *\nAllow: /\n" + f"Sitemap: {SITE_URL}/sitemap.xml\n",
    encoding="utf-8"
)

# === LINK-CHECK (wewnętrzne hrefy -> czy plik istnieje w dist)
# zbuduj zbiór dostępnych ścieżek względnych
available: set[str] = set()
for f in built_files:
    rel = "/" + str(f.relative_to(DIST)).replace("\\", "/")
    # /pl/slug/index.html -> /pl/slug/ i /pl/
    if rel.endswith("/index.html"):
        available.add(rel[:-10])  # katalog
        available.add(rel)        # plik
    else:
        available.add(rel)

for src_file, hrefs in INTERNAL_HREFS.items():
    for href in hrefs:
        # mapuj href na potencjalny plik
        # /pl/aaa/  -> /pl/aaa/index.html
        want1 = href if href.endswith(".html") else href.rstrip("/") + "/index.html"
        want2 = href.rstrip("/") + "/"
        if want1 not in available and want2 not in available:
            warn(src_file, f"Wewnętrzny link nie znaleziony w dist: {href}")

# === SNAPSHOT ZIP
def zip_dist():
    zpath = DIST / "download" / "site.zip"
    zpath.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in DIST.rglob("*"):
            if p.is_dir(): continue
            # nie pakuj samego zipa w zipie
            if p == zpath: continue
            zf.write(p, p.relative_to(DIST))
zip_dist()

# === ZAPISZ LOG
def write_issues():
    if not ISSUES:
        (DIST / "build_ok.txt").write_text("OK " + now_iso(), encoding="utf-8")
        return
    lines = []
    for it in ISSUES:
        lines.append(f"[{it['level'].upper()}] {it['path']}: {it['msg']}")
    (DIST / "issues.log").write_text("\n".join(lines), encoding="utf-8")
write_issues()

# === WYJŚCIE
errors = [x for x in ISSUES if x["level"] == "error"]
if errors and STRICT:
    print("\n".join(f"[ERROR] {e['path']}: {e['msg']}" for e in errors))
    raise SystemExit(1)
else:
    for it in ISSUES:
        print(f"[{it['level'].upper()}] {it['path']}: {it['msg']}")
    print("Build finished:", len(built_files), "files")
