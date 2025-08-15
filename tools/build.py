#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Statyczny build Kras-Trans:
- Czyta data/cms.json (przygotowany przez Apps Script)
- Renderuje Jinja2 (templates/*.html)
- Obsługuje Markdown (body_md -> page_html)
- Generuje sitemap.xml, robots.txt, 404, CNAME, redirect HTML
- Zapisuje ctx-debug: dist/_debug/<lang>/<slug>/ctx.json (inspekcja co trafiło do szablonu)
"""

from __future__ import annotations
import os, re, json, sys, shutil, zipfile, itertools
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List
from urllib.parse import quote

# --- 3rd party ---
from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateNotFound
from bs4 import BeautifulSoup
try:
    from markdown_it import MarkdownIt
    from mdit_py_plugins.footnote import footnote_plugin
    from mdit_py_plugins.anchors import anchors_plugin
except Exception:
    MarkdownIt = None
try:
    from unidecode import unidecode
except Exception:
    unidecode = None

# --- ścieżki ---
ROOT   = Path(__file__).resolve().parents[1]
DATA   = ROOT / "data" / "cms.json"
TPLS   = ROOT / "templates"
DIST   = ROOT / "dist"

# --- env / stałe ---
SITE_URL       = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
BRAND          = os.getenv("BRAND", "Kras-Trans")
CNAME_TARGET   = os.getenv("CNAME_TARGET", "").strip()
DEFAULT_LANG   = os.getenv("DEFAULT_LANG", "pl").lower()
ROBOTS_INDEX   = os.getenv("ROBOTS_INDEX", "index,follow")  # lub "noindex,nofollow"

# ----------------- utils -----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def t(v) -> str:
    return "" if v is None else str(v).strip()

def to_bool(v) -> bool:
    if isinstance(v, bool): return v
    s = t(v).lower()
    return s in ("1", "true", "yes", "y", "tak")

def slugify(s: str) -> str:
    s = t(s)
    if not s: return ""
    if unidecode:
        s = unidecode(s)
    s = re.sub(r"[^a-zA-Z0-9\-_]+", "-", s.strip().lower())
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s

def site_url_for(lang: str, slug: str) -> str:
    if slug:
        return f"{SITE_URL}/{lang}/{slug}/"
    return f"{SITE_URL}/{lang}/"

def canonical_for(lang: str, slug: str) -> Dict[str, Any]:
    return {"url": site_url_for(lang, slug), "site_url": SITE_URL}

# ----------------- CMS load -----------------
if not DATA.exists():
    raise SystemExit("Brak data/cms.json — upewnij się, że krok 'Fetch CMS JSON' działa.")

with open(DATA, "r", encoding="utf-8") as f:
    CMS = json.load(f)

PAGES     : List[Dict[str, Any]] = CMS.get("pages", []) or []
FAQ       : List[Dict[str, Any]] = CMS.get("faq", []) or []
MEDIA     : List[Dict[str, Any]] = CMS.get("media", []) or []
COMPANY   : List[Dict[str, Any]] = CMS.get("company", []) or []
REDIRS    : List[Dict[str, Any]] = CMS.get("redirects", []) or []
BLOCKS    : List[Dict[str, Any]] = CMS.get("blocks", []) or []
NAV       : List[Dict[str, Any]] = CMS.get("nav", []) or []
TEMPLS    : List[Dict[str, Any]] = CMS.get("templates", []) or []
STR_ROWS  : List[Dict[str, Any]] = CMS.get("strings", []) or []
ROUTES    : List[Dict[str, Any]] = CMS.get("routes", []) or []
PLACES    : List[Dict[str, Any]] = CMS.get("places", []) or []
BLOG      : List[Dict[str, Any]] = CMS.get("blog", []) or []
AUTHORS   : List[Dict[str, Any]] = CMS.get("authors", []) or []
CATEGORIES: List[Dict[str, Any]] = CMS.get("categories", []) or []
REVIEWS   : List[Dict[str, Any]] = CMS.get("reviews", []) or []
JOBS      : List[Dict[str, Any]] = CMS.get("jobs", []) or []

# ----------------- strings per lang -----------------
def build_strings(rows: List[Dict[str, Any]], lang: str) -> Dict[str, str]:
    out = {}
    for r in rows or []:
        key = t(r.get("key") or r.get("id") or r.get("slug"))
        if not key: 
            continue
        val = r.get(lang) or r.get("value") or r.get("val") or ""
        out[key] = t(val)
    return out

# ----------------- markdown -----------------
def md_to_html(md: str) -> str:
    md = t(md)
    if not md: return ""
    if MarkdownIt:
        mdx = (MarkdownIt("commonmark", {'linkify': True, 'typographer': True})
               .use(footnote_plugin)
               .use(anchors_plugin, permalink=True, permalinkBefore=True))
        return mdx.render(md)
    # prosty fallback
    html = md.replace("\r\n", "\n")
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.M)
    html = re.sub(r"^## (.+)$",  r"<h2>\1</h2>", html, flags=re.M)
    html = re.sub(r"^# (.+)$",   r"<h1>\1</h1>", html, flags=re.M)
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    html = re.sub(r"\*(.+?)\*", r"<em>\1</em>", html)
    html = re.sub(r"\n{2,}", r"</p><p>", f"<p>{html}</p>")
    return html

# ----------------- jinja env -----------------
env = Environment(
    loader=FileSystemLoader(str(TPLS)),
    autoescape=True,
    trim_blocks=True,
    lstrip_blocks=True,
    undefined=StrictUndefined,
)

# dostępne filtry w szablonie
env.filters["slugify"] = slugify

# ----------------- pomocnicze -----------------
def normalize_page(p: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(p)
    p["lang"]    = t(p.get("lang") or DEFAULT_LANG).lower()
    p["slug"]    = slugify(p.get("slug") or "")
    p["slugKey"] = t(p.get("slugKey") or p["slug"] or "home")
    p["type"]    = t(p.get("type") or "page")
    p["publish"] = to_bool(p.get("publish", True))
    return p

PAGES = [normalize_page(p) for p in PAGES]

# ================= render jednej strony =================
def render_one(page: Dict[str, Any]) -> Path:
    lang = page["lang"]
    slug = page["slug"]

    # HTML z body_md
    body_html = md_to_html(page.get("body_md", ""))

    # related (prosto: to samo parentSlug i lang)
    samekey = t(page.get("slugKey") or page.get("slug") or "home")
    related = []
    for p in PAGES:
        if p is page: 
            continue
        if t(p.get("lang")) == lang and t(p.get("parentSlug")) == t(page.get("parentSlug")):
            related.append(p)

    # alternatywne wersje (hreflang)
    alts = [p for p in PAGES if t(p.get("slugKey")) == samekey]
    hreflangs = [{
        "lang": (p.get("lang") or DEFAULT_LANG).lower(),
        "slug": t(p.get("slug") or ""),
        "url": site_url_for((p.get("lang") or DEFAULT_LANG).lower(), t(p.get("slug") or "")),
    } for p in alts]

    # FAQ i bloki przypięte do tej strony
    page_faq = [f for f in FAQ
                if t(f.get("lang") or DEFAULT_LANG).lower() == lang and
                   (t(f.get("page")) == samekey or t(f.get("slug")) == slug)]
    page_blocks = [b for b in BLOCKS
                   if t(b.get("lang") or DEFAULT_LANG).lower() == lang and
                      (t(b.get("page") or "") in (samekey, slug))]

    # head/meta
    _title = t(page.get("seo_title") or page.get("title") or page.get("h1") or BRAND)
    _desc  = t(page.get("meta_desc") or page.get("description") or page.get("lead") or
               "Transport i spedycja — Polska & UE")
    ogimg  = t(page.get("og_image") or page.get("hero_image") or "assets/media/og-default.webp")
    head = {
        "title": _title,
        "desc": _desc,
        "og_image": ogimg,
    }

    # strings dla języka
    strings = build_strings(STR_ROWS, lang)

    # kontekst
    canon = {"url": site_url_for(lang, slug), "site_url": SITE_URL, "brand": BRAND,
             "updated": now_iso(), "hreflangs": hreflangs}

    ctx = {
        "site_url": SITE_URL,
        "brand": BRAND,
        "updated": now_iso(),

        # pełny CMS (łatwa inspekcja)
        "pages": PAGES,
        "faq_all": FAQ,
        "media": MEDIA,
        "company": COMPANY,
        "redirects": REDIRS,
        "blocks": BLOCKS,
        "nav": NAV,
        "templates": TEMPLS,
        "strings": strings,
        "routes": ROUTES,
        "places": PLACES,
        "blog": BLOG,
        "authors": AUTHORS,
        "categories": CATEGORIES,
        "reviews": REVIEWS,
        "jobs": JOBS,

        # bieżąca strona
        "meta": canon,
        "page": page,
        "page_html": body_html,
        "page_blocks": page_blocks,
        "page_faq": page_faq,
        "faq_count": len(page_faq),
        "related": related,
        "head": head,
        "default_lang": DEFAULT_LANG,
    }

    # wybór szablonu (fallback do page.html)
    tpl_name = t(page.get("template") or "page.html")
    try:
        tmpl = env.get_template(tpl_name)
    except TemplateNotFound:
        tmpl = env.get_template("page.html")

    raw_html = tmpl.render(**ctx)

    # postprocess: proste uporządkowanie linków relatywnych
    html = postprocess_html(raw_html, lang)

    # ścieżka wyjściowa
    out_dir = DIST / lang / (slug or "")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "index.html"
    out_path.write_text(html, encoding="utf-8")

    # --- ZAPIS DEBUG KONTEXTU (tu, PO renderze i zapisie HTML) ---
    dbg_dir = DIST / "_debug" / lang / (slug or "home")
    dbg_dir.mkdir(parents=True, exist_ok=True)
    with open(dbg_dir / "ctx.json", "w", encoding="utf-8") as df:
        json.dump(ctx, df, ensure_ascii=False, indent=2)

    print(f"[OK] {out_path.relative_to(DIST)}")
    return out_path

# ----------------- postprocess -----------------
def postprocess_html(html: str, lang: str) -> str:
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        return html

    # linki bezwzględne dla /{lang}/...
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        if href.startswith("/") and not href.startswith(f"/{lang}/") and not re.match(r"^/\w{2}/", href):
            a["href"] = f"/{lang}{href}"

    return str(soup)

# ----------------- pozostałe artefakty -----------------
def write_sitemap(urls: List[str]):
    body = "\n".join(
        f"  <url><loc>{quote(u, safe=':/?&%=#+,;@')}</loc><changefreq>weekly</changefreq></url>"
        for u in urls
    )
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{body}
</urlset>"""
    (DIST / "sitemap.xml").write_text(xml, encoding="utf-8")
    print("[OK] sitemap.xml")

def write_robots():
    txt = f"""User-agent: *
Allow: /
Sitemap: {SITE_URL}/sitemap.xml

# Generated at {now_iso()}
"""
    (DIST / "robots.txt").write_text(txt, encoding="utf-8")
    print("[OK] robots.txt")

def write_cname():
    if not CNAME_TARGET:
        return
    (DIST / "CNAME").write_text(CNAME_TARGET.strip() + "\n", encoding="utf-8")
    print(f"[OK] CNAME -> {CNAME_TARGET}")

def write_404():
    html = f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><title>404 — {BRAND}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font:16px/1.5 -apple-system,system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:4rem;color:#222}}
a{{color:#06f}}</style></head>
<body><h1>Nie znaleziono strony</h1>
<p>Wróć na <a href="{SITE_URL}/">{SITE_URL}</a></p></body></html>"""
    (DIST / "404.html").write_text(html, encoding="utf-8")
    print("[OK] 404.html")

def write_redirects():
    """
    GitHub Pages: HTML-redirect (meta refresh). W CMS: from, to, code(optional)
    """
    for r in REDIRS or []:
        src = t(r.get("from") or r.get("src"))
        dst = t(r.get("to") or r.get("target") or "/")
        if not src: 
            continue
        src = src.strip("/")

        # wspieramy /{lang}/... oraz bez języka
        parts = src.split("/", 1)
        if len(parts) == 2 and len(parts[0]) in (2, 3):
            lang, rest = parts[0], parts[1]
            out_dir = DIST / lang / rest
        else:
            out_dir = DIST / src

        out_dir.mkdir(parents=True, exist_ok=True)
        html = f"""<!doctype html><html lang="{DEFAULT_LANG}"><head>
<meta charset="utf-8"><meta http-equiv="refresh" content="0;url={dst}">
<link rel="canonical" href="{dst}"><meta name="robots" content="noindex,nofollow">
</head><body><p>Redirect to <a href="{dst}">{dst}</a></p></body></html>"""
        (out_dir / "index.html").write_text(html, encoding="utf-8")
        print(f"[OK] redirect {src} → {dst}")

def zip_dist():
    zf = ROOT / "site.zip"
    if zf.exists(): zf.unlink()
    with zipfile.ZipFile(zf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in DIST.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(DIST))
    print(f"[OK] site.zip ({zf.stat().st_size/1024:.0f} KB)")

# ----------------- main build -----------------
def main():
    # czyść dist
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)

    # renderuj tylko publish = True
    published = [p for p in PAGES if p.get("publish", True)]
    if not published:
        print("WARN: brak stron z publish=TRUE — nic do renderu.", file=sys.stderr)

    built_urls = []
    for page in published:
        out_path = render_one(page)
        built_urls.append(site_url_for(page["lang"], page["slug"]))

    write_redirects()
    write_sitemap(built_urls)
    write_robots()
    write_cname()
    write_404()
    zip_dist()

    print(f"[DONE] {len(built_urls)} stron, dist = {DIST}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        raise
