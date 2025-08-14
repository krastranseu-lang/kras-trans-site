#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans static site builder (GitHub Pages)
- Jinja2 templates
- Assets copy + cache-busting (?v=hash)
- i18n folders (/pl/, /en/, …)
- hreflang/canonical/OG/JSON-LD
- GA4 + GSC verification (ENV)
- AutoLinks (smart internal linking)
- sitemap.xml, robots.txt, 404.html
- root index.html -> /{DEFAULT_LANG}/
- nav.json (for menu.js)
- seo_stats.json (word counts, headings, links)
- ZIP snapshot (/download/site.zip)
"""

from __future__ import annotations
import os, re, json, shutil, hashlib, zipfile, textwrap
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin
from typing import Dict, Any, List, Tuple

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown import markdown
from bs4 import BeautifulSoup   # requirements: beautifulsoup4
from slugify import slugify      # requirements: python-slugify

# --------------------------------------------------------------------------------------
# CONFIG (from ENV or sane defaults)
# --------------------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]          # repo root
DIST = ROOT / "dist"
ASSETS_SRC = ROOT / "assets"
TEMPLATES = ROOT / "templates"
DATA_JSON = ROOT / "data" / "cms.json"

SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = os.getenv("DEFAULT_LANG", "pl").lower()
BRAND = os.getenv("BRAND", "Kras-Trans")
GA_ID = os.getenv("GA_ID", "")  # np. G-XXXX
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "")
CNAME = os.getenv("CNAME", "kras-trans.com")

# Jeden LCP na stronę — klucz (pole) z CMS, który traktujemy jako hero-image
LCP_KEY = "lcp_image"  # w Pages CSV: lcp_image = nazwa pliku w assets/media lub static/img

# --------------------------------------------------------------------------------------
# UTILS
# --------------------------------------------------------------------------------------
def read_json(p: Path) -> Dict[str, Any]:
    if not p.exists():
        raise FileNotFoundError(f"Brak pliku {p}")
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def file_hash(p: Path) -> str:
    h = hashlib.sha1()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 256), b""):
            h.update(chunk)
    return h.hexdigest()[:10]

def copy_assets() -> Dict[str, str]:
    """Kopiuje assets/ do dist/assets/ i zwraca mapę {rel_path: hash} do wersjonowania."""
    out = {}
    if not ASSETS_SRC.exists():
        return out
    dst = DIST / "assets"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(ASSETS_SRC, dst)
    for p in dst.rglob("*"):
        if p.is_file():
            rel = str(p.relative_to(DIST)).replace("\\", "/")
            out[rel] = file_hash(p)
    return out

def versioned(url_path: str, manifest: Dict[str, str]) -> str:
    """Dodaje ?v=hash jeśli plik jest w manifeście."""
    key = url_path.lstrip("/")
    h = manifest.get(key)
    return f"/{key}?v={h}" if h else f"/{key}"

def minify_html(html: str) -> str:
    """Zachowawcza minifikacja (bez <pre>/<code>)."""
    # usuń komentarze (poza <!--[if ...]>), whitespace między tagami, wiele spacji
    # wydziel <pre|code> blokowo
    placeholders = {}
    def stash(m):
        k = f"__PRE{i[0]}__"
        placeholders[k] = m.group(0)
        i[0] += 1
        return k
    i = [0]
    html = re.sub(r"<!--(?!\[if).*?-->", "", html, flags=re.S)
    html = re.sub(r">\s+<", "><", html)
    # stasz pre/code
    html = re.sub(r"(<pre[\s\S]*?</pre>|<code[\s\S]*?</code>)", stash, html, flags=re.I)
    html = re.sub(r"\s{2,}", " ", html)
    for k, v in placeholders.items():
        html = html.replace(k, v)
    return html.strip()

def md_to_html(md: str) -> str:
    return markdown(md or "", extensions=["extra", "sane_lists", "toc", "smarty"])

def utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def write_file(path: Path, content: str, binary: bool = False) -> None:
    ensure_dir(path.parent)
    mode = "wb" if binary else "w"
    with path.open(mode, encoding=None if binary else "utf-8") as f:
        f.write(content)

def zip_dir(src: Path, zip_path: Path) -> None:
    ensure_dir(zip_path.parent)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in src.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(src))

# --------------------------------------------------------------------------------------
# LOAD CMS
# --------------------------------------------------------------------------------------
if not DATA_JSON.exists():
    raise SystemExit("Brak data/cms.json – workflow powinien go pobrać z Apps Script.")
CMS = read_json(DATA_JSON)

PAGES: List[Dict[str, Any]] = CMS.get("pages", [])
FAQ: List[Dict[str, Any]]   = CMS.get("faq", [])
MEDIA = CMS.get("media", [])
COMPANY = CMS.get("company", [])
REDIRECTS = CMS.get("redirects", [])
BLOCKS = CMS.get("blocks", [])
NAV = CMS.get("nav", [])
TEMPLATES_DATA = CMS.get("templates", [])
STRINGS = CMS.get("strings", [])
ROUTES = CMS.get("routes", [])
PLACES = CMS.get("places", [])
BLOG = CMS.get("blog", [])
CATEGORIES = CMS.get("categories", [])
AUTHORS = CMS.get("authors", [])
CASESTUDIES = CMS.get("caseStudies", [])
REVIEWS = CMS.get("reviews", [])
LOCATIONS = CMS.get("locations", [])
JOBS = CMS.get("jobs", [])
AUTOLINKS = CMS.get("autolinks", CMS.get("AutoLinks", []))  # różne nazwy zakładki

# szybkie lookupy
pages_by_slugkey: Dict[Tuple[str, str], Dict[str, Any]] = {}
for p in PAGES:
    lang = (p.get("lang") or DEFAULT_LANG).lower()
    slugKey = (p.get("slugKey") or p.get("slug") or "").strip() or "home"
    pages_by_slugkey[(slugKey, lang)] = p

# --------------------------------------------------------------------------------------
# JINJA
# --------------------------------------------------------------------------------------
env = Environment(
    loader=FileSystemLoader(str(TEMPLATES)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True, lstrip_blocks=True,
)

# dostępne globalnie w template
env.globals.update({
    "site_url": SITE_URL,
    "brand": BRAND,
    "now": utcnow_iso,
})

# --------------------------------------------------------------------------------------
# NAV JSON (dla assets/js/menu.js) + pomocnicze
# --------------------------------------------------------------------------------------
def build_nav_json() -> Dict[str, Any]:
    """Zwraca strukturę menu (lang->items) i zapisuje do dist/assets/data/nav.json."""
    out_by_lang: Dict[str, List[Dict[str, Any]]] = {}
    for item in NAV:
        lang = (item.get("lang") or DEFAULT_LANG).lower()
        label = item.get("label") or item.get("title") or ""
        url = item.get("url") or ""
        if not label or not url:
            continue
        out_by_lang.setdefault(lang, []).append({
            "label": label.strip(),
            "url": url.strip(),
        })
    data = {"nav": out_by_lang, "updated": utcnow_iso()}
    path = DIST / "assets" / "data" / "nav.json"
    write_file(path, json.dumps(data, ensure_ascii=False, indent=2))
    return data

# --------------------------------------------------------------------------------------
# HEAD/HREFLANG/JSON-LD
# --------------------------------------------------------------------------------------
def build_hreflangs(page: Dict[str, Any]) -> Tuple[List[Dict[str, str]], str]:
    """Zwraca (hreflangs, x_default_url). Wymaga slugKey, alt języki."""
    slugKey = (page.get("slugKey") or page.get("slug") or "").strip() or "home"
    alts = []
    x_default = ""
    langs_seen = set()
    for (k, lang), p in pages_by_slugkey.items():
        if k != slugKey:
            continue
        url = page_url(p)
        alts.append({"lang": lang, "url": urljoin(SITE_URL + "/", url.lstrip("/"))})
        langs_seen.add(lang)
    if DEFAULT_LANG in langs_seen:
        x_default = urljoin(SITE_URL + "/", page_url(page).lstrip("/"))
    return alts, x_default

def breadcrumb_jsonld(page: Dict[str, Any], url_abs: str) -> Dict[str, Any]:
    # Z prostego łańcucha: /{lang}/{parentSlug?}/{slug?}/
    parts = [x for x in page_url(page).strip("/").split("/") if x]
    item_list = []
    trail = "/"
    pos = 1
    for part in parts:
        trail = f"{trail}{part}/"
        item_list.append({
            "@type": "ListItem",
            "position": pos,
            "name": part.replace("-", " ").title(),
            "item": urljoin(SITE_URL + "/", trail),
        })
        pos += 1
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": item_list or [{
            "@type": "ListItem",
            "position": 1,
            "name": BRAND,
            "item": SITE_URL + "/",
        }],
    }

def organization_jsonld() -> Dict[str, Any]:
    c = COMPANY[0] if COMPANY else {}
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": c.get("name") or c.get("legal_name") or BRAND,
        "url": SITE_URL + "/",
        "telephone": c.get("telephone") or c.get("phone") or "+48 793 927 467",
        "address": {
            "@type": "PostalAddress",
            "streetAddress": c.get("street") or "",
            "postalCode": c.get("postal") or "",
            "addressLocality": c.get("city") or "",
            "addressCountry": c.get("country") or "PL",
        },
        "logo": urljoin(SITE_URL + "/", "assets/media/logo.png"),
    }

def page_url(page: Dict[str, Any]) -> str:
    """Buduje URL względny strony (z językiem)."""
    lang = (page.get("lang") or DEFAULT_LANG).lower()
    slug = (page.get("slug") or "").strip()
    ic = (page.get("ic") or "").lower()
    # home
    is_home = (page.get("type") or "").lower() == "home" or ic.startswith("ho") or slug in ("", "/", "home")
    if is_home:
        return f"/{lang}/"
    # parent
    parent = (page.get("parentSlug") or "").strip().strip("/")
    path_parts = [lang]
    if parent:
        path_parts.append(parent)
    if slug:
        path_parts.append(slug.strip("/"))
    return "/" + "/".join(path_parts) + "/"

def page_title(page: Dict[str, Any]) -> str:
    return page.get("seo_title") or page.get("title") or f"{BRAND}"

def page_description(page: Dict[str, Any]) -> str:
    return page.get("meta_desc") or page.get("description") or page.get("lead") or ""

# --------------------------------------------------------------------------------------
# SMART AUTOLINKS
# --------------------------------------------------------------------------------------
def compile_autolinks(items: List[Dict[str, Any]]) -> List[Tuple[re.Pattern, str]]:
    compiled = []
    for it in items or []:
        term = (it.get("term") or it.get("anchor") or "").strip()
        url = (it.get("url") or "").strip()
        if not term or not url:
            continue
        # whole word, case-insensitive
        pat = re.compile(rf"(?<![/\w-])({re.escape(term)})(?![^<]*?>)", re.I)
        compiled.append((pat, url))
    return compiled

def apply_autolinks(html: str, links: List[Tuple[re.Pattern, str]], max_links: int = 6) -> str:
    """Podlinkowuje terminy w tekstach (poza <a>, <script>, <style>)."""
    if not links or max_links <= 0:
        return html
    soup = BeautifulSoup(html, "lxml")
    used = 0

    def process_node(node):
        nonlocal used
        if used >= max_links:
            return
        if node.name in ("a", "script", "style"):
            return
        # teksty
        if isinstance(node, str):
            text = str(node)
            for pat, url in links:
                if used >= max_links:
                    break
                m = pat.search(text)
                if not m:
                    continue
                start, end = m.span(1)
                before, hit, after = text[:start], text[start:end], text[end:]
                a = soup.new_tag("a", href=url)
                a.string = hit
                new_nodes = [before, a, after]
                parent = node.parent
                node.replace_with(*new_nodes)
                used += 1
                return  # przerwij – kontynuuj na nowych węzłach
        else:
            for child in list(node.children):
                if used >= max_links:
                    break
                process_node(child)

    process_node(soup.body or soup)
    return str(soup)

AUTO_LINKS_COMPILED = compile_autolinks(AUTOLINKS)

# --------------------------------------------------------------------------------------
# RENDER
# --------------------------------------------------------------------------------------
def render_one(page: Dict[str, Any], manifest: Dict[str, str]) -> Tuple[str, str]:
    """Renderuje jedną stronę i zwraca (rel_url, html_min)."""
    # markdown -> html
    body_html = md_to_html(page.get("body_md") or "")
    # autolinkowanie
    max_out = int(page.get("max_outlinks") or 6)
    body_html = apply_autolinks(body_html, AUTO_LINKS_COMPILED, max_links=max_out)

    url_rel = page_url(page)
    url_abs = urljoin(SITE_URL + "/", url_rel.lstrip("/"))
    title = page_title(page)
    desc = page_description(page)

    hreflangs, x_default = build_hreflangs(page)

    # hero / LCP
    hero_alt = page.get("hero_alt") or page.get("h1") or page.get("title") or BRAND
    hero = page.get("hero_image") or ""
    hero_m = page.get("hero_image_mobile") or ""
    lcp = page.get(LCP_KEY) or hero or ""

    # JSON-LD
    jsonld = [breadcrumb_jsonld(page, url_abs), organization_jsonld()]
    # dodatkowe typy
    for t in (page.get("structured_data_types") or []):
        if t.lower() == "webpage":
            jsonld.append({"@context": "https://schema.org", "@type": "WebPage", "name": title, "url": url_abs})

    # og:image (fallback logo)
    og_image = urljoin(SITE_URL + "/", (hero or "assets/media/og-default.jpg").lstrip("/"))

    # dodatkowe head (GA + GSC + CSS z assets)
    extra_head = []
    if GSC_VERIFICATION:
        extra_head.append(f'<meta name="google-site-verification" content="{GSC_VERIFICATION}">')
    # wersjonowany CSS
    css_href = versioned("assets/css/kras-global.css", manifest)
    extra_head.append(f'<link rel="stylesheet" href="{css_href}">')
    # preloading hero (ostrożnie – tylko jeśli lcp)
    if lcp:
        pre = ("assets/media/" + lcp) if not lcp.startswith(("http://", "https://", "/")) else lcp.lstrip("/")
        extra_head.append(f'<link rel="preload" as="image" href="{versioned(pre, manifest)}">')
    # GA4
    if GA_ID:
        extra_head.append(textwrap.dedent(f"""
        <!-- Google tag (gtag.js) -->
        <script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
        <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
        gtag('js', new Date()); gtag('config','{GA_ID}',{{ 'anonymize_ip': true, 'allow_ad_personalization_signals': false }});</script>
        """).strip())

    head = {
        "title": title,
        "description": desc[:300],
        "canonical": url_abs,
        "hreflangs": hreflangs,
        "x_default": x_default,
        "og_title": title,
        "og_description": desc[:300],
        "og_image": og_image,
        "jsonld": jsonld,
        "extra_head": "\n".join(extra_head),
    }

    # related (po tagach)
    tags = [t.strip() for t in (page.get("tags") or []) if t.strip()]
    related = []
    if tags:
        for p in PAGES:
            if p is page:
                continue
            if not p.get("publish", True):
                continue
            if (p.get("lang") or DEFAULT_LANG).lower() != (page.get("lang") or DEFAULT_LANG).lower():
                continue
            ptags = set([t.strip() for t in (p.get("tags") or []) if t.strip()])
            if ptags & set(tags):
                related.append({"title": p.get("title") or p.get("seo_title") or "", "url": page_url(p)})
            if len(related) >= 6:
                break

    # h1
    h1 = page.get("h1") or page.get("title") or title

    # dane do template
    ctx = {
        "site_url": SITE_URL,
        "brand": BRAND,
        "page": page,
        "head": head,
        "faq": [f for f in FAQ if (f.get("lang") or DEFAULT_LANG).lower() == (page.get("lang") or DEFAULT_LANG).lower()],
        "company": COMPANY,
        "related": related,
        "hero_alt": hero_alt,
        "hero_image": hero,
        "hero_image_mobile": hero_m,
        "lcp_image": lcp,
        "h1": h1,
    }

    # wybór szablonu
    tpl_name = (page.get("template") or "page").strip()
    if not (TEMPLATES / f"{tpl_name}.html").exists():
        tpl_name = "page"
    tpl = env.get_template(f"{tpl_name}.html")
    html = tpl.render(**ctx)
    html = minify_html(html)

    return url_rel, html

# --------------------------------------------------------------------------------------
# SITEMAP / ROBOTS / 404 / ROOT REDIRECT
# --------------------------------------------------------------------------------------
def write_sitemap(published: List[Tuple[str, str]]):
    # published: list[(url_rel, lastmod_iso)]
    items = []
    for url_rel, lastmod in published:
        loc = urljoin(SITE_URL + "/", url_rel.lstrip("/"))
        items.append(f"<url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' \
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
          "\n".join(items) + "\n</urlset>"
    write_file(DIST / "sitemap.xml", xml)

def write_robots():
    lines = [
        "User-agent: *",
        "Disallow:",
        f"Sitemap: {SITE_URL}/sitemap.xml",
    ]
    write_file(DIST / "robots.txt", "\n".join(lines) + "\n")

def write_404(manifest: Dict[str, str]):
    # proste 404 (używa tego samego CSS)
    css_href = versioned("assets/css/kras-global.css", manifest)
    html = f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 — Nie znaleziono | {BRAND}</title>
<link rel="stylesheet" href="{css_href}">
<meta name="robots" content="noindex,follow">
</head>
<body>
<main class="content" style="min-height:60vh;padding:2rem 1rem;max-width:64rem;margin:auto;text-align:center">
  <h1>404 — Nie znaleziono</h1>
  <p>Ups! Tej strony nie ma. Wróć do <a href="/{DEFAULT_LANG}/">strony głównej</a>.</p>
</main>
</body></html>"""
    write_file(DIST / "404.html", minify_html(html))

def write_root_redirect(default_lang: str = DEFAULT_LANG):
    target = f"/{default_lang}/"
    html = f"""<!doctype html><html lang="en">
<head>
  <meta charset="utf-8">
  <title>{BRAND}</title>
  <meta http-equiv="refresh" content="0; url={target}">
  <link rel="canonical" href="{SITE_URL}{target}">
  <meta name="robots" content="noindex,follow">
</head>
<body>
  <p>Przenoszę do <a href="{target}">{target}</a>…</p>
  <script>location.replace("{target}")</script>
</body></html>"""
    write_file(DIST / "index.html", html)

# --------------------------------------------------------------------------------------
# SEO STATS
# --------------------------------------------------------------------------------------
def compute_seo_stats(html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    words = [w for w in re.findall(r"\w{2,}", text, flags=re.I)]
    headings = {f"h{i}": len(soup.select(f"h{i}")) for i in range(1, 7)}
    links_internal = 0
    links_external = 0
    for a in soup.select("a[href]"):
        href = a["href"]
        if href.startswith(("http://", "https://")) and (SITE_URL not in href):
            links_external += 1
        else:
            links_internal += 1
    return {
        "word_count": len(words),
        "headings": headings,
        "links_internal": links_internal,
        "links_external": links_external,
    }

# --------------------------------------------------------------------------------------
# MAIN BUILD
# --------------------------------------------------------------------------------------
def main():
    # clean
    if DIST.exists():
        shutil.rmtree(DIST)
    ensure_dir(DIST)

    # copy assets (+ manifest z hashami)
    manifest = copy_assets()

    # optional CNAME
    if CNAME:
        write_file(DIST / "CNAME", CNAME.strip() + "\n")

    # nav.json
    build_nav_json()

    # render pages
    published = []
    seo_stats = {}
    for page in PAGES:
        if page.get("publish") is False:
            continue
        url_rel, html = render_one(page, manifest)
        out_path = DIST / url_rel.strip("/")
        if url_rel.endswith("/"):
            out_path = out_path / "index.html"
        write_file(out_path, html)
        published.append((url_rel, utcnow_iso()))
        seo_stats[url_rel] = compute_seo_stats(html)

    # blog index + posts (jeśli są) – fallback do page.html
    # (dla pełnej wersji zrób własne blog_* szablony)
    if BLOG:
        lang_groups: Dict[str, List[Dict[str, Any]]] = {}
        for post in BLOG:
            if post.get("publish") is False:
                continue
            lang = (post.get("lang") or DEFAULT_LANG).lower()
            lang_groups.setdefault(lang, []).append(post)

        for lang, posts in lang_groups.items():
            # posty
            for post in posts:
                p = {
                    "lang": lang,
                    "slug": post.get("slug") or slugify(post.get("title") or "") or "",
                    "title": post.get("title") or "",
                    "seo_title": post.get("seo_title") or post.get("title") or "",
                    "meta_desc": post.get("meta_desc") or post.get("excerpt") or "",
                    "body_md": post.get("body_md") or "",
                    "template": "blog_post" if (TEMPLATES / "blog_post.html").exists() else "page",
                    "tags": post.get("tags") or [],
                    "parentSlug": "blog",
                }
                url_rel, html = render_one(p, manifest)
                out_path = DIST / url_rel.strip("/")
                if url_rel.endswith("/"):
                    out_path = out_path / "index.html"
                write_file(out_path, html)
                published.append((url_rel, utcnow_iso()))
                seo_stats[url_rel] = compute_seo_stats(html)

            # index
            tpl_name = "blog_index" if (TEMPLATES / "blog_index.html").exists() else "page"
            tpl = env.get_template(f"{tpl_name}.html")
            url_rel = f"/{lang}/blog/"
            ctx = {
                "site_url": SITE_URL,
                "brand": BRAND,
                "page": {"lang": lang, "title": "Blog", "h1": "Blog", "lead": "", "tags": []},
                "head": {
                    "title": f"Blog | {BRAND}",
                    "description": f"Nowości i porady transportowe — {BRAND}.",
                    "canonical": urljoin(SITE_URL + "/", url_rel.lstrip("/")),
                    "hreflangs": [],
                    "x_default": "",
                    "og_title": f"Blog | {BRAND}",
                    "og_description": f"Nowości i porady transportowe — {BRAND}.",
                    "og_image": urljoin(SITE_URL + "/", "assets/media/og-default.jpg"),
                    "jsonld": [organization_jsonld()],
                    "extra_head": f'<link rel="stylesheet" href="{versioned("assets/css/kras-global.css", manifest)}">',
                },
                "posts": posts,
                "company": COMPANY,
                "related": [],
                "hero_alt": "Blog",
                "hero_image": "",
                "hero_image_mobile": "",
                "lcp_image": "",
                "h1": "Blog",
            }
            html = minify_html(tpl.render(**ctx))
            out_path = DIST / lang / "blog" / "index.html"
            write_file(out_path, html)
            published.append((url_rel, utcnow_iso()))
            seo_stats[url_rel] = compute_seo_stats(html)

    # sitemap / robots / 404 / root
    write_sitemap(published)
    write_robots()
    write_404(manifest)
    write_root_redirect(DEFAULT_LANG)

    # SEO stats JSON
    write_file(DIST / "assets" / "data" / "seo_stats.json", json.dumps(seo_stats, ensure_ascii=False, indent=2))

    # snapshot ZIP
    zip_dir(DIST, DIST / "download" / "site.zip")

    print(f"OK — zbudowano {len(published)} URL-i. Dist: {DIST}")

# --------------------------------------------------------------------------------------
if __name__ == "__main__":
    main()
