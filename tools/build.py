#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans — generator statyczny (build.py)
- Czyta data/cms.json (output z Apps Script)
- Renderuje strony z Jinja2 (templates/page.html)
- Tworzy sitemap.xml, robots.txt, 404.html
- Root redirect / -> /pl/
- Kopiuje assets/static
- ZIP snapshot dist/download/site.zip
- Wstrzykuje GA4 (GA_ID) i GSC meta (GSC_VERIFICATION)

Autor: (Twoje)
"""

from __future__ import annotations
import os
import re
import json
import shutil
import zipfile
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List, Iterable, Tuple, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "cms.json"
TEMPLATES = ROOT / "templates"
DIST = ROOT / "dist"

ASSETS_DIRS = ["static", "assets"]  # skopiujemy w całości, jeśli istnieją

# --- ENV (z pages.yml) ---
SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = (os.getenv("DEFAULT_LANG", "pl") or "pl").lower()
BRAND = os.getenv("BRAND", "Kras-Trans")

GA_ID = os.getenv("GA_ID", "").strip()  # np. G-XXXX
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "").strip()  # np. Q3XgX...

CNAME_VALUE = os.getenv("CNAME", "").strip()  # np. kras-trans.com (opcjonalnie)

# --- UTILS --------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def tojson(value: Any) -> str:
    """Jinja filter: |tojson (defensywnie)."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def t(s: Any) -> str:
    return "" if s is None else str(s).strip()


def slugify(s: str) -> str:
    s = t(s).strip("/").strip()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-zA-Z0-9\-_]", "", s)
    return s.lower()


def lang_of(p: Dict[str, Any]) -> str:
    return (p.get("lang") or DEFAULT_LANG).strip().lower()


def canonical_for(page: Dict[str, Any]) -> str:
    """
    Buduje kanoniczny URL:
    - pusty slug => /<lang>/
    - slug => /<lang>/<slug>/
    """
    ln = lang_of(page)
    slug = t(page.get("slug")).strip().strip("/")
    if not slug:
        return f"{SITE_URL}/{ln}/"
    return f"{SITE_URL}/{ln}/{slug}/"


def page_url_rel(page: Dict[str, Any]) -> str:
    ln = lang_of(page)
    slug = t(page.get("slug")).strip().strip("/")
    if not slug:
        return f"/{ln}/"
    return f"/{ln}/{slug}/"


def out_path(dist: Path, page: Dict[str, Any]) -> Path:
    ln = lang_of(page)
    slug = t(page.get("slug")).strip().strip("/")
    if not slug:
        return dist / ln / "index.html"
    return dist / ln / slug / "index.html"


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def copy_assets():
    for name in ASSETS_DIRS:
        src = ROOT / name
        if src.exists() and src.is_dir():
            dst = DIST / name
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print(f"[copy] {name}/ -> dist/{name}/")
        else:
            print(f"[copy] (skip) {name}/ (not found)")


def zip_site(dist: Path, out_zip: Path):
    ensure_dir(out_zip.parent)
    # Uwaga: nie pakujemy samego ZIP-a
    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in dist.rglob("*"):
            if p.is_file():
                rel = p.relative_to(dist)
                if rel.as_posix() == out_zip.relative_to(dist).as_posix():
                    continue
                z.write(p, rel.as_posix())
    print(f"[zip] {out_zip} ({out_zip.stat().st_size} bytes)")


# --- LOADING CMS --------------------------------------------------------------


def load_cms(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}")
    data = json.loads(path.read_text("utf-8"))
    if not data.get("ok"):
        raise RuntimeError("cms.json has ok:false")
    return data


# --- JINJA --------------------------------------------------------------------


def jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    env.filters["tojson"] = tojson
    return env


# --- JSON-LD ------------------------------------------------------------------


def jsonld_org(company: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not company:
        company = [{}]
    c = company[0]
    org = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": c.get("name") or c.get("legal_name") or BRAND,
        "url": SITE_URL,
    }
    telephone = t(c.get("telephone") or c.get("phone"))
    if telephone:
        org["telephone"] = telephone
    nip = t(c.get("nip"))
    if nip:
        # w PL: taxID z prefixem PL
        org["taxID"] = f"PL {nip}" if not nip.upper().startswith("PL") else nip
    logo = c.get("logo") or f"{SITE_URL}/static/img/logo.png"
    org["logo"] = logo
    same_as = []
    for k in ("facebook", "instagram", "linkedin", "youtube", "twitter", "x", "tiktok"):
        url = t(c.get(k))
        if url:
            same_as.append(url)
    if same_as:
        org["sameAs"] = same_as
    adr = {}
    if t(c.get("street_address")):
        adr["streetAddress"] = c.get("street_address")
    if t(c.get("postal_code")):
        adr["postalCode"] = c.get("postal_code")
    if t(c.get("city")):
        adr["addressLocality"] = c.get("city")
    if t(c.get("country")):
        adr["addressCountry"] = c.get("country")
    if adr:
        adr["@type"] = "PostalAddress"
        org["address"] = adr
    return org


def jsonld_webpage(page: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "url": canonical_for(page),
        "inLanguage": lang_of(page),
        "name": page.get("title") or page.get("h1") or BRAND,
        "description": page.get("description") or "",
    }


def jsonld_breadcrumb(page: Dict[str, Any]) -> Dict[str, Any]:
    # Home -> Page
    items = [
        {
            "@type": "ListItem",
            "position": 1,
            "name": BRAND,
            "item": f"{SITE_URL}/{lang_of(page)}/",
        },
        {
            "@type": "ListItem",
            "position": 2,
            "name": page.get("title") or page.get("h1") or "Strona",
            "item": canonical_for(page),
        },
    ]
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items,
    }


# --- SEO HEAD -----------------------------------------------------------------


def build_head(page: Dict[str, Any],
               alts: List[Dict[str, Any]],
               company: List[Dict[str, Any]]) -> Dict[str, Any]:
    canonical = canonical_for(page)
    og_img_rel = t(page.get("og_image") or page.get("hero_image") or "static/img/og-default.jpg")
    og_img = og_img_rel if og_img_rel.startswith("http") else f"{SITE_URL}/{og_img_rel.lstrip('/')}"

    # hreflang alternates
    hreflangs = []
    langs_seen = set()
    for alt in alts:
        ln = lang_of(alt)
        if ln in langs_seen:
            continue
        langs_seen.add(ln)
        hreflangs.append({"lang": ln, "url": canonical_for(alt)})

    # JSON-LD (WebPage + Org + BreadcrumbList)
    jsonld = [jsonld_webpage(page), jsonld_org(company), jsonld_breadcrumb(page)]

    # extra_head: GSC + GA4
    extra = []
    if GSC_VERIFICATION:
        extra.append(f'<meta name="google-site-verification" content="{GSC_VERIFICATION}">')
    if GA_ID:
        extra.append(
            f"""<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{GA_ID}');
</script>"""
        )

    head = {
        "title": page.get("title") or BRAND,
        "description": page.get("description") or "",
        "canonical": canonical,
        "og_title": page.get("og_title") or page.get("title") or BRAND,
        "og_description": page.get("og_description") or page.get("description") or "",
        "og_image": og_img,
        "hreflangs": hreflangs,
        "x_default": f"{SITE_URL}/{DEFAULT_LANG}/",
        "jsonld": jsonld,
        "extra_head": "\n".join(extra),
    }
    return head


# --- RELATED ------------------------------------------------------------------


def build_related(current: Dict[str, Any], pages: List[Dict[str, Any]], limit: int = 6) -> List[Dict[str, Any]]:
    """Najpierw related_override (slug), potem po tagach."""
    cur_slug = t(current.get("slug"))
    override = [slugify(s) for s in (current.get("related_override") or [])]
    out: List[Dict[str, Any]] = []

    by_slug = {slugify(p.get("slug")): p for p in pages}
    for s in override:
        p = by_slug.get(s)
        if p and p is not current and p.get("publish") is not False:
            out.append(p)

    if len(out) >= limit:
        pass
    else:
        tags = set([t(x).lower() for x in current.get("tags") or []])
        if tags:
            # proste dopasowanie po tagach
            for p in pages:
                if p is current or p.get("publish") is False:
                    continue
                pt = set([t(x).lower() for x in p.get("tags") or []])
                if pt & tags:
                    out.append(p)
                    if len(out) >= limit:
                        break

    # wzbogacamy każdy element w url i title
    seen = set()
    enriched = []
    for p in out:
        key = (lang_of(p), t(p.get("slug")))
        if key in seen:
            continue
        seen.add(key)
        enriched.append({"title": p.get("title") or p.get("h1") or "", "url": page_url_rel(p)})
    return enriched[:limit]


# --- GROUPING FOR HREFLANG ----------------------------------------------------


def group_alternates(pages: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Grupujemy strony po „kluczu alternatywności”.
    Preferencja: page_ref -> route -> slug (ostatnie najmniej pewne).
    """
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for p in pages:
        if p.get("publish") is False:
            continue
        key = t(p.get("page_ref")) or t(p.get("route")) or t(p.get("slug"))
        key = key or f"__home__{lang_of(p)}__" if not t(p.get("slug")) else key
        groups.setdefault(key, []).append(p)
    return groups


# --- SITEMAP ------------------------------------------------------------------


def write_sitemap(dist: Path, pages: List[Dict[str, Any]], updated_iso: str):
    groups = group_alternates(pages)
    xmlns = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
    xhtml = 'xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    lines = [f'<?xml version="1.0" encoding="UTF-8"?>',
             f'<urlset {xmlns} {xhtml}>']
    for key, variants in groups.items():
        # bierzemy pierwszy jako "główny" do wpisu url
        primary = variants[0]
        loc = canonical_for(primary)
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{updated_iso}</lastmod>")
        lines.append("    <changefreq>weekly</changefreq>")
        # alternates
        for v in variants:
            lines.append(f'    <xhtml:link rel="alternate" hreflang="{lang_of(v)}" href="{canonical_for(v)}" />')
        # x-default
        lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE_URL}/{DEFAULT_LANG}/" />')
        lines.append("  </url>")
    lines.append("</urlset>")
    (dist / "sitemap.xml").write_text("\n".join(lines), "utf-8")
    print("[sitemap] dist/sitemap.xml")


# --- ROBOTS & 404 & ROOT REDIRECT --------------------------------------------


def write_robots(dist: Path):
    txt = f"""User-agent: *
Allow: /
Sitemap: {SITE_URL}/sitemap.xml
"""
    (dist / "robots.txt").write_text(txt, "utf-8")
    print("[robots] dist/robots.txt")


def write_404(dist: Path):
    html = f"""<!doctype html><html lang="pl">
<head>
  <meta charset="utf-8">
  <title>404 — Nie znaleziono</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="{SITE_URL}/{DEFAULT_LANG}/">
  <meta http-equiv="refresh" content="3; url=/{DEFAULT_LANG}/">
  <style>body{{font:16px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:4rem;color:#111}}a{{color:#06c}}</style>
</head>
<body>
  <h1>404 — Nie znaleziono</h1>
  <p>Ups! Tej strony nie ma. Wróć do <a href="/{DEFAULT_LANG}/">strony głównej</a>.</p>
</body></html>"""
    (dist / "404.html").write_text(html, "utf-8")
    print("[404] dist/404.html")


def write_root_redirect(dist: Path, default_lang: str = DEFAULT_LANG, site_url: str = SITE_URL):
    root = dist / "index.html"
    target = f"/{default_lang}/"
    html = f"""<!doctype html><html lang="en">
<head>
  <meta charset="utf-8">
  <title>{BRAND}</title>
  <meta http-equiv="refresh" content="0; url={target}">
  <link rel="canonical" href="{site_url}{target}">
  <meta name="robots" content="noindex,follow">
</head>
<body>
  <p>Przenoszę do <a href="{target}">{target}</a>…</p>
  <script>location.replace("{target}")</script>
</body></html>"""
    root.write_text(html, "utf-8")
    print("[root] dist/index.html -> /pl/")


# --- BUILD --------------------------------------------------------------------


def render_page(env: Environment, page: Dict[str, Any], ctx: Dict[str, Any]) -> str:
    tpl = env.get_template("page.html")
    return tpl.render(**ctx)


def main():
    print(f"[env] SITE_URL={SITE_URL}, DEFAULT_LANG={DEFAULT_LANG}, BRAND={BRAND}")
    if GA_ID:
        print(f"[env] GA_ID={GA_ID}")
    if GSC_VERIFICATION:
        print(f"[env] GSC_VERIFICATION=***{GSC_VERIFICATION[-4:]}")

    cms = load_cms(DATA)
    pages: List[Dict[str, Any]] = cms.get("pages") or []
    company: List[Dict[str, Any]] = cms.get("company") or []
    updated_iso = (cms.get("updated") or now_iso())

    # Filtrowanie publish!=False (pozwalamy na True/None)
    pages = [p for p in pages if p.get("publish") is not False]

    # diagnostyka "home" dla PL
    home_pl = [p for p in pages if lang_of(p) == "pl" and not t(p.get("slug")) and p.get("publish") is not False]
    print(f"[diag] HOME pl count: {len(home_pl)}")

    # Jinja
    env = jinja_env()

    # Grupy alternatyw (dla hreflang)
    groups = group_alternates(pages)

    # Dist clean
    if DIST.exists():
        shutil.rmtree(DIST)
    ensure_dir(DIST)

    # CNAME (opcjonalnie)
    if CNAME_VALUE:
        (DIST / "CNAME").write_text(CNAME_VALUE.strip() + "\n", "utf-8")

    # Render stron
    count = 0
    for p in pages:
        key = t(p.get("page_ref")) or t(p.get("route")) or t(p.get("slug")) or "__home__"
        alts = groups.get(key, [p])

        head = build_head(p, alts, company)
        related = build_related(p, pages, limit=int(p.get("max_outlinks") or 6))

        ctx = {
            "site_url": SITE_URL,
            "brand": BRAND,
            "page": p,
            "head": head,
            "related": related,
            "company": company,
        }

        out = out_path(DIST, p)
        ensure_dir(out.parent)
        html = render_page(env, p, ctx)
        out.write_text(html, "utf-8")
        count += 1

    print(f"[build] rendered pages: {count}")

    # Assets
    copy_assets()

    # SEO pliki
    write_sitemap(DIST, pages, updated_iso)
    write_robots(DIST)
    write_404(DIST)
    write_root_redirect(DIST, DEFAULT_LANG, SITE_URL)

    # ZIP snapshot
    zip_site(DIST, DIST / "download" / "site.zip")

    # Debug: pokaż top drzewo
    print("== DIST (first 100 files) ==")
    shown = 0
    for p in sorted(DIST.rglob("*")):
        if p.is_file():
            print(p.relative_to(DIST).as_posix())
            shown += 1
            if shown >= 100:
                print("... (cut)")
                break


if __name__ == "__main__":
    main()
