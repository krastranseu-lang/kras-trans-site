#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans — rozbudowany build statyczny:
- renderowanie HTML z Jinja2
- sitemap index + pod-sitemapy
- robots.txt, 404.html, CNAME
- autolinking 2.0 (na tagach/slugach)
- hreflang, canonical, breadcrumbs
- Organization JSON-LD ze "Company"
- menu.manifest.json do headera/breadcrumbs
- raport audytowy
- snapshot ZIP

Wymagania: Jinja2, markdown, beautifulsoup4, lxml
"""

import json, os, re, shutil, time, zipfile, hashlib, math
from pathlib import Path
from typing import Dict, Any, List, Tuple
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown import markdown
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "cms.json"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
DIST = ROOT / "dist"
AUDIT = ROOT / "audit"

# >>> DOPASUJ DO SWOJEJ DOMENY <<<
SITE_URL = "https://kras-trans.com"

# Ile URL-i na pojedynczą sitemapę (Google limit to 50k, tu zostawmy zapas)
SITEMAP_SPLIT = 10000

# Proste helpery
def t(s): 
    return "" if s is None else str(s).strip()

def slug_join(*parts):
    return "/".join([p.strip("/").strip() for p in parts if t(p)])

def url_for(page: Dict[str, Any]) -> str:
    """Buduje adres absolutny dla strony."""
    lang = t(page.get("lang") or "pl").strip("/")
    slug = t(page.get("slug")).strip("/")
    if t(page.get("type")) == "home":
        path = f"/{lang}/"
    else:
        path = f"/{lang}/{slug}/" if slug else f"/{lang}/"
    return SITE_URL.rstrip("/") + path

def ensure_clean_dir(p: Path):
    shutil.rmtree(p, ignore_errors=True)
    p.mkdir(parents=True, exist_ok=True)

def copy_static():
    if STATIC.exists():
        shutil.copytree(STATIC, DIST / "static", dirs_exist_ok=True)

def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, "utf-8")

def write_binary(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

def html_path_for(page: Dict[str, Any]) -> Path:
    """Zapisuj każdą stronę jako /lang/slug/index.html (lub /lang/index.html dla home)."""
    lang = t(page.get("lang") or "pl").strip("/")
    slug = t(page.get("slug")).strip("/")
    if t(page.get("type")) == "home" or not slug:
        return DIST / lang / "index.html"
    return DIST / lang / slug / "index.html"

def load_cms() -> Dict[str, Any]:
    if not DATA.exists():
        raise SystemExit("Brak data/cms.json (fetch w workflow).")
    j = json.loads(DATA.read_text("utf-8"))
    if not j.get("ok"):
        raise SystemExit("cms.json: ok=false")
    return j

def build_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env

def build_breadcrumbs(page: Dict[str, Any], pages_by_key: Dict[str, Dict[str, Any]]) -> List[Dict[str, str]]:
    """Prosty breadcrumb: home -> (opcjonalny parent) -> bieżąca"""
    crumbs = []
    lang = page.get("lang") or "pl"
    # Home
    home = next((p for p in pages_by_key.values() if (p.get("lang")==lang and p.get("type")=="home")), None)
    if home:
        crumbs.append({"name": t(home.get("title") or "Strona główna"), "url": url_for(home)})
    # Parent (optional)
    parent_slug = t(page.get("parentSlug"))
    if parent_slug:
        parent = next((p for p in pages_by_key.values() if p.get("slug")==parent_slug and p.get("lang")==lang), None)
        if parent:
            crumbs.append({"name": t(parent.get("title") or parent_slug), "url": url_for(parent)})
    # Current
    crumbs.append({"name": t(page.get("h1") or page.get("title") or "Strona"), "url": url_for(page)})
    return crumbs

def build_hreflang(page: Dict[str, Any], all_pages: List[Dict[str, Any]]) -> Tuple[List[Dict[str, str]], str]:
    """Buduje mapę hreflang (jeśli w cms są alternatywy językowe przez slugKey)."""
    langs = {}
    slug_key = t(page.get("slugKey"))
    if not slug_key:
        return [], ""
    siblings = [p for p in all_pages if t(p.get("slugKey")) == slug_key]
    for s in siblings:
        lang = t(s.get("lang") or "pl")
        langs[lang] = url_for(s)
    x_default = langs.get("pl") or list(langs.values())[0] if langs else ""
    out = [{"lang": k, "url": v} for k, v in sorted(langs.items())]
    return out, x_default

def organization_ld(company: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not company:
        return {}
    c = company[0]
    same_as = []
    for key in ("instagram","linkedin","facebook","twitter","youtube","tiktok"):
        u = t(c.get(key))
        if u:
            same_as.append(u)
    addr = {
        "@type": "PostalAddress",
        "streetAddress": t(c.get("street_address")),
        "postalCode": t(c.get("postal_code")),
        "addressLocality": t(c.get("city")),
        "addressCountry": t(c.get("country") or "PL"),
    }
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": t(c.get("name") or c.get("legal_name") or "Kras-Trans"),
        "url": SITE_URL,
        "email": t(c.get("email")),
        "telephone": t(c.get("telephone")),
        "taxID": t(c.get("nip") or c.get("tax_id")),
        "address": addr,
        "sameAs": same_as,
        "logo": SITE_URL.rstrip("/") + "/static/img/logo.png",
    }

def breadcrumb_ld(crumbs: List[Dict[str, str]]) -> Dict[str, Any]:
    items = []
    for i, c in enumerate(crumbs, start=1):
        items.append({
            "@type": "ListItem",
            "position": i,
            "name": c["name"],
            "item": c["url"]
        })
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items
    }

def page_head(page: Dict[str, Any], crumbs, hreflangs, x_default, og_image_default: str, jsonld_extra: List[Dict[str, Any]]) -> Dict[str, Any]:
    title = t(page.get("seo_title") or page.get("title") or page.get("h1") or "Kras-Trans")
    desc = t(page.get("meta_description") or page.get("lead") or "Ekspresowy transport do 3.5 t")
    canonical = url_for(page)
    og_image = SITE_URL.rstrip("/") + "/" + (t(page.get("hero_image")) or "static/img/placeholder-hero-desktop.webp").lstrip("/")
    out = {
        "title": title,
        "description": desc,
        "canonical": canonical,
        "og_title": title,
        "og_description": desc,
        "og_image": og_image or og_image_default,
        "hreflangs": hreflangs,
        "x_default": x_default,
        "jsonld": jsonld_extra,
    }
    # breadcrumbs LD na końcu (aby był zawsze)
    out["jsonld"].append(breadcrumb_ld(crumbs))
    return out

def markdown_to_html(md: str) -> str:
    if not md:
        return ""
    return markdown(md, extensions=["extra", "abbr", "sane_lists"])

def autolink_html(html: str, candidates: List[Tuple[str, str]], max_links: int = 6) -> str:
    """Bardzo prosty autolink: podmień pierwsze n wystąpień anchorów w treści."""
    if not html or not candidates:
        return html
    soup = BeautifulSoup(html, "lxml")
    body_text_nodes = soup.find_all(text=True)
    links_done = 0
    # zrób mapę kotwic -> url
    for anchor, url in candidates:
        if links_done >= max_links:
            break
        pattern = re.compile(rf"\b({re.escape(anchor)})\b", re.IGNORECASE)
        for node in list(body_text_nodes):
            if node.parent and node.parent.name in ("a","script","style"):
                continue
            new_text, n = pattern.subn(f'<a href="{url}">\\1</a>', node)
            if n > 0:
                node.replace_with(BeautifulSoup(new_text, "lxml"))
                links_done += 1
                break
    return str(soup)

def collect_candidates(page: Dict[str, Any], all_pages: List[Dict[str, Any]]) -> List[Tuple[str, str]]:
    """Buduj listę (anchor, url) pod autolinki na bazie tagów/related/anchor_text_suggestions."""
    anchors = set()
    # anchor_text_suggestions (z arkusza)
    for a in page.get("anchor_text_suggestions", []):
        if a: anchors.add(a)
    # tagi
    tags = set([x for x in page.get("tags", []) if x])
    # related_override (bez powtórzeń)
    related_slugs = set([x for x in page.get("related_override", []) if x])

    pool = []
    for p in all_pages:
        if p is page: 
            continue
        if t(p.get("publish")) == "false":
            continue
        # preferuj: relacje po tagach albo explicite wskazane slug-i
        if related_slugs and p.get("slug") not in related_slugs:
            continue
        if tags and not tags.intersection(set(p.get("tags") or [])) and not related_slugs:
            continue
        pool.append(p)

    # zwróć (anchor, url)
    out = []
    for p in pool[:20]:  # limituj pulę
        title = t(p.get("title") or p.get("h1"))
        if title:
            out.append((title, url_for(p)))
    # dołóż anchor z własnej listy
    for a in anchors:
        # jeśli anchor to też tytuł innej strony – skieruj do niej
        target = next((u for (ttl, u) in out if ttl.lower() == a.lower()), None)
        if target:
            continue
        # fallback: link do siebie (bezpieczniej pominąć)
    return out

def write_robots():
    txt = f"User-agent: *\nAllow: /\nSitemap: {SITE_URL.rstrip('/')}/sitemap.xml\n"
    write_text(DIST / "robots.txt", txt)

def write_cname():
    write_text(DIST / "CNAME", Path("CNAME").read_text("utf-8") if Path("CNAME").exists() else "kras-trans.com\n")

def write_404(env: Environment):
    # Prosty 404 (z szablonu page.html z minimalem)
    html = f"""<!doctype html><html lang="pl"><head>
<meta charset="utf-8"><title>404 — Nie znaleziono</title>
<link rel="canonical" href="{SITE_URL}/404.html">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/static/css/site.css">
</head><body><main class="content">
<h1>404 — Nie znaleziono</h1>
<p>Ups! Tej strony nie ma. Wróć do <a href="{SITE_URL}">strony głównej</a>.</p>
</main></body></html>"""
    write_text(DIST / "404.html", html)

def write_sitemaps(urls: List[str]):
    """Sitemap index + shardy."""
    if not urls:
        return
    urls = sorted(set(urls))
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if len(urls) <= SITEMAP_SPLIT:
        items = "\n".join(f"<url><loc>{u}</loc><lastmod>{ts}</lastmod></url>" for u in urls)
        xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}\n</urlset>\n'
        write_text(DIST / "sitemap.xml", xml)
        return

    # Podziel i zrób sitemap index
    base = DIST / "sitemaps"
    base.mkdir(parents=True, exist_ok=True)
    parts = math.ceil(len(urls) / SITEMAP_SPLIT)
    for i in range(parts):
        chunk = urls[i*SITEMAP_SPLIT : (i+1)*SITEMAP_SPLIT]
        items = "\n".join(f"<url><loc>{u}</loc><lastmod>{ts}</lastmod></url>" for u in chunk)
        xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}\n</urlset>\n'
        write_text(base / f"part-{i+1}.xml", xml)

    index_items = "\n".join(
        f"<sitemap><loc>{SITE_URL.rstrip('/')}/sitemaps/part-{i+1}.xml</loc><lastmod>{ts}</lastmod></sitemap>"
        for i in range(parts)
    )
    index_xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{index_items}\n</sitemapindex>\n'
    write_text(DIST / "sitemap.xml", index_xml)

def zip_site():
    out = DIST / "download" / "site.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_file() and not str(p).endswith("/download/site.zip"):
                z.write(p, p.relative_to(DIST))

def build_menu_manifest(pages: List[Dict[str, Any]], out_path: Path):
    """Minimalny manifest do menu/breadcrumbs — możesz rozbudować wg potrzeb."""
    hubs = [p for p in pages if p.get("type") == "hub" and p.get("publish") != "false"]
    services = [p for p in pages if p.get("type") == "service" and p.get("publish") != "false"]
    content = [p for p in pages if p.get("type") in ("blog","info","legal") and p.get("publish") != "false"]

    def map_item(p):
        return {"title": t(p.get("title")), "slug": url_for(p)}

    manifest = {
        "languages": sorted({t(p.get("lang") or "pl") for p in pages}),
        "defaultLang": "pl",
        "pillar": next((map_item(p) for p in pages if p.get("type")=="pillar"), None),
        "hubs": [map_item(p) for p in hubs],
        "services": [map_item(p) for p in services],
        "content": [map_item(p) for p in content],
    }
    write_text(out_path, json.dumps(manifest, ensure_ascii=False, indent=2))

def render_all():
    ensure_clean_dir(DIST)
    AUDIT.mkdir(parents=True, exist_ok=True)

    copy_static()
    env = build_env()
    tpl = env.get_template("page.html")

    cms = load_cms()
    pages = cms.get("pages", [])
    company = cms.get("company", [])
    og_image_default = SITE_URL.rstrip("/") + "/static/img/placeholder-hero-desktop.webp"

    # indeks po kluczu (lang+slug) dla szybkich lookupów
    def key(p): 
        return f"{t(p.get('lang') or 'pl')}::{t(p.get('slug'))}"
    pages_by_key = {key(p): p for p in pages}

    urls_written = []

    # JSON‑LD Organization raz – wstrzykujemy do każdej strony
    org_ld = organization_ld(company)
    jsonld_org = [org_ld] if org_ld else []

    # RENDER
    for page in pages:
        if str(page.get("publish")).lower() == "false":
            continue

        # markdown -> html
        html_body = ""
        if t(page.get("body_md")):
            html_body = markdown_to_html(page.get("body_md"))
        elif t(page.get("body")):
            html_body = t(page.get("body"))

        # autolinking 2.0
        candidates = collect_candidates(page, pages)
        html_body = autolink_html(html_body, candidates, max_links=int(page.get("max_outlinks") or 6))

        # breadcrumbs & hreflang
        crumbs = build_breadcrumbs(page, pages_by_key)
        hreflangs, xdef = build_hreflang(page, pages)

        head = page_head(page, crumbs, hreflangs, xdef, og_image_default, jsonld_org.copy())

        out_html = tpl.render(
            page=page,
            head=head,
            site_url=SITE_URL.rstrip("/"),
            related=[],  # możesz zbudować listę podobnych stron, jeśli chcesz
            company=company,
            html=html_body,  # dla szablonu (jeśli masz blok {{ html|safe }})
        )

        out_path = html_path_for(page)
        write_text(out_path, out_html)
        urls_written.append(url_for(page))

    # 404, robots, sitemapy, CNAME
    write_404(env)
    write_robots()
    write_sitemaps(urls_written)
    write_cname()

    # menu manifest (do JS/TS w headerze)
    build_menu_manifest(pages, DIST / "data" / "menu.manifest.json")

    # Raport
    report = f"""# Build report

- Pages rendered: **{len(urls_written)}**
- Updated: `{cms.get('updated')}`
- Sitemap: `{SITE_URL.rstrip('/')}/sitemap.xml`
"""
    write_text(AUDIT / "report.md", report)

    # ZIP snapshot
    zip_site()

def main():
    render_all()

if __name__ == "__main__":
    main()
