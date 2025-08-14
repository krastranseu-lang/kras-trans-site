#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans • build.py (FULL)
-----------------------------------------
• Czyta data/cms.json (Apps Script)
• Generuje: /index.html (redirect), /{lang}/… (strony), /sitemap*.xml, /robots.txt, /404.html, /download/site.zip, /CNAME
• Kopiuje /assets i /static
• SEO: canonical, hreflang, OG, JSON-LD (Organization/WebPage/Breadcrumb)
• Strings: zakładka "Strings" -> słownik dla Jinja
• Autolinking (bezpieczny; whitelist z arkusza; limitowane)
• Related (tagi + override)
• GA4 (opóźnione) + Search Console meta
"""

import os, re, io, json, shutil, zipfile, time, hashlib, pathlib
from datetime import datetime, timezone
from urllib.parse import urljoin

# --- Zewnętrzne biblioteki (z requirements.txt: Jinja2, markdown, beautifulsoup4, lxml) ---
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown import markdown
from bs4 import BeautifulSoup

# --- Ścieżki ---
ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "cms.json"
DIST = ROOT / "dist"
TPLS = ROOT / "templates"
ASSETS = ROOT / "assets"
STATIC = ROOT / "static"

# --- ENV / stałe projektu ---
SITE_URL         = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG     = os.getenv("DEFAULT_LANG", "pl").lower()
BRAND            = os.getenv("BRAND", "Kras-Trans")
GA_ID            = os.getenv("GA_ID", "")  # GA4 measurement id (opcjonalnie)
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "")  # meta Google Search Console (opcjonalnie)
CNAME_TARGET     = os.getenv("CNAME", "kras-trans.com")

# --- Helpery ---
def t(v): 
    return "" if v is None else str(v).strip()

def to_bool(v):
    s = str(v).strip().lower()
    return s in ("true", "1", "yes", "y", "tak")

def csv_list(v):
    return [x.strip() for x in t(v).split(",") if x and x.strip()]

def norm_slug(s):
    s = t(s).strip("/")
    return s

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def out_path_for(lang, slug):
    """Zwraca ścieżkę na dysku dla danej strony."""
    lang = (lang or DEFAULT_LANG).lower()
    slug = norm_slug(slug)
    if slug in ("", "home"):
        return DIST / lang / "index.html"
    return DIST / lang / slug / "index.html"

def url_for(lang, slug):
    """Zwraca absolutny URL dla strony."""
    lang = (lang or DEFAULT_LANG).lower()
    slug = norm_slug(slug)
    if slug in ("", "home"):
        return f"{SITE_URL}/{lang}/"
    return f"{SITE_URL}/{lang}/{slug}/"

def ensure_dir(p: pathlib.Path):
    p.parent.mkdir(parents=True, exist_ok=True)

def file_hash(path: pathlib.Path) -> str:
    if not path.exists():
        return ""
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:10]

# --- Czytanie CMS ---
if not DATA.exists():
    raise SystemExit("Brak data/cms.json — upewnij się, że krok 'Fetch CMS JSON' zadziałał.")

with open(DATA, "r", encoding="utf-8") as f:
    CMS = json.load(f)

PAGES    = CMS.get("pages", []) or []
FAQ      = CMS.get("faq", []) or []
MEDIA    = CMS.get("media", []) or []
COMPANY  = CMS.get("company", []) or []
REDIRS   = CMS.get("redirects", []) or []
BLOCKS   = CMS.get("blocks", []) or []
NAV      = CMS.get("nav", []) or []
TEMPLS   = CMS.get("templates", []) or []
STR_ROWS = CMS.get("strings", []) or []
ROUTES   = CMS.get("routes", []) or []
PLACES   = CMS.get("places", []) or []
BLOG     = CMS.get("blog", []) or []     # opcjonalnie
REVIEWS  = CMS.get("reviews", []) or []  # opcjonalnie
AUTHORS  = CMS.get("authors", [])
CATEGORIES = CMS.get("categories", [])
JOBS       = CMS.get("jobs", [])


# --- Strings: arkusz "Strings" -> dict {key: value} per lang ---
def build_strings(rows, lang):
    """
    Obsługuje układ:
      key | pl | en | ...
    lub
      key | value
    """
    out = {}
    lang = (lang or DEFAULT_LANG).lower()
    for r in rows or []:
        key = t(r.get("key") or r.get("id") or r.get("slug"))
        if not key:
            continue
        val = r.get(lang) or r.get("value") or r.get("val") or ""
        out[key] = t(val)
    return out

# --- Jinja ---
env = Environment(
    loader=FileSystemLoader(str(TPLS)),
    autoescape=select_autoescape(["html", "xml"])
)
env.filters["markdown"] = lambda s: markdown(s or "", extensions=["extra", "sane_lists"])
env.filters["tojson"] = lambda obj: json.dumps(obj, ensure_ascii=False)

# --- Przygotowanie DIST ---
def clean_dist():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def copy_static():
    """Kopiuje assets/ i static/ do dist/ (z cache-bustingiem w linkach robimy w szablonie, jeśli potrzeba)"""
    if ASSETS.exists():
        shutil.copytree(ASSETS, DIST / "assets", dirs_exist_ok=True)
    if STATIC.exists():
        shutil.copytree(STATIC, DIST / "static", dirs_exist_ok=True)

# --- GA4 / GSC dodatki do <head> ---
def head_extra_html():
    bits = []
    if GSC_VERIFICATION:
        bits.append(f'<meta name="google-site-verification" content="{GSC_VERIFICATION}">')
    if GA_ID:
        bits.append('''<script>
  window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}
  setTimeout(function(){
    var s=document.createElement('script'); s.async=1; s.src='https://www.googletagmanager.com/gtag/js?id=' + %s;
    document.head.appendChild(s);
    gtag('js', new Date()); gtag('config', %s, { 'anonymize_ip': true });
  }, 1800);
</script>''' % (json.dumps(GA_ID), json.dumps(GA_ID)))
    return "\n".join(bits)

# --- JSON-LD (Organization, WebPage, Breadcrumb) ---
def org_jsonld():
    c = (COMPANY[0] if COMPANY else {}) or {}
    name = t(c.get("name") or c.get("legal_name") or BRAND)
    tel  = t(c.get("telephone") or c.get("phone"))
    tax  = t(c.get("nip") or c.get("taxid") or c.get("tax_id"))
    same = list(filter(None, csv_list(c.get("same_as") or c.get("sameAs") or "")))
    data = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": name,
        "url": SITE_URL,
    }
    if tel: data["telephone"] = tel
    if tax: data["taxID"] = tax
    if same: data["sameAs"] = same
    logo = t(c.get("logo") or "")
    if logo:
        data["logo"] = urljoin(SITE_URL + "/", norm_slug(logo))
    return data

def breadcrumb_jsonld(crumbs):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type":"ListItem","position":i+1,"name":c["name"],"item":c["item"]}
            for i, c in enumerate(crumbs)
        ]
    }

def webpage_jsonld(title, description, url):
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "url": url,
        "description": description
    }

# --- Hreflang: grupowanie wg slugKey (jeśli jest), inaczej po slug ---
def group_pages_for_hreflang(pages):
    groups = {}
    for p in pages:
        key = t(p.get("slugKey") or p.get("slug") or p.get("ic") or p.get("page_ref") or "")
        if not key:
            key = f"page-{id(p)}"
        groups.setdefault(key, []).append(p)
    return groups

# --- Related: po tagach + override ---
def build_related(p, pages, max_items=6):
    if t(p.get("related_override")):
        # ręczna lista slugów
        slugs = csv_list(p.get("related_override"))
        rel = []
        want = set([norm_slug(s) for s in slugs])
        for q in pages:
            if norm_slug(q.get("slug")) in want and q is not p:
                rel.append(q)
        return rel[:max_items]
    # tagi
    tags = set([x.lower() for x in csv_list(p.get("tags"))])
    scored = []
    for q in pages:
        if q is p: 
            continue
        t2 = set([x.lower() for x in csv_list(q.get("tags"))])
        score = len(tags & t2)
        if score > 0:
            scored.append((score, q))
    scored.sort(key=lambda x: (-x[0], t(x[1].get("title"))))
    return [q for _, q in scored[:max_items]]

# --- Autolinking HTML (delikatny, sekcje, limit 1-2 linki/sekcję) ---
def autolink_html(html, whitelist=None, per_section_limit=2):
    """
    whitelist: lista dictów { 'phrase': 'transport paletowy', 'href': '/pl/transport-paletowy/' }
    Nie linkuje wewnątrz <a>, <h1-6>, <code/pre>, <script/style>, <nav>, <header>, <footer>.
    """
    if not html or not whitelist:
        return html

    soup = BeautifulSoup(html, "lxml")
    bad = set(["a","code","pre","script","style","nav","header","footer"])
    blocks = soup.find_all(True, recursive=True)

    # przygotowanie regexów
    rules = []
    for w in whitelist:
        phrase = t(w.get("phrase"))
        href   = t(w.get("href"))
        if not phrase or not href:
            continue
        # whole word-ish, case-insensitive
        rx = re.compile(r"(?i)(?<![A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9])(" + re.escape(phrase) + r")(?![A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9])")
        rules.append((rx, href))
    if not rules:
        return html

    def process_node(node):
        # ograniczamy linkowanie per blok
        made = 0
        for child in list(node.children):
            if getattr(child, "name", None):
                # pomijamy "złe" tagi lub tagi nagłówków
                if child.name in bad or re.match(r"h[1-6]", child.name or ""):
                    continue
                # wgłąb
                process_node(child)
            else:
                # text node
                txt = str(child)
                new_frag = txt
                for rx, href in rules:
                    if made >= per_section_limit:
                        break
                    # tylko pierwsze dopasowanie per sekcja na frazę
                    new_frag, n = rx.subn(rf'<a href="{href}">\1</a>', new_frag, count=1)
                    if n > 0:
                        made += 1
                if new_frag != txt:
                    child.replace_with(BeautifulSoup(new_frag, "lxml"))
        return

    for el in blocks:
        process_node(el)
    return str(soup)

# --- HEAD (canonical, hreflang, OG, JSON-LD) ---
def build_head(page, all_pages, strings, site_url=SITE_URL):
    lang = (page.get("lang") or DEFAULT_LANG).lower()
    slug = norm_slug(page.get("slug"))
    url  = url_for(lang, slug if slug not in ("home","") else "")
    title = t(page.get("seo_title") or page.get("title") or BRAND)
    desc  = t(page.get("meta_desc") or page.get("description") or "")
    ogimg = t(page.get("og_image") or page.get("og_image_url") or "")
    if not ogimg:
        # fallback globalny (możesz umieścić share.jpg w static/img/)
        ogimg = f"{SITE_URL}/static/img/share.jpg"

    # hreflang grupą
    groups = group_pages_for_hreflang(all_pages)
    key = t(page.get("slugKey") or page.get("slug") or page.get("ic") or page.get("page_ref") or "")
    hreflangs = []
    x_default = ""
    if key and key in groups:
        for p2 in groups[key]:
            lg = (p2.get("lang") or DEFAULT_LANG).lower()
            sl = norm_slug(p2.get("slug"))
            hreflangs.append({"lang": lg, "url": url_for(lg, sl if sl not in ("home","") else "")})
        # heurystyka x-default = default lang
        x_default = url_for(DEFAULT_LANG, norm_slug(page.get("slug")) if slug not in ("home","") else "")

    # breadcrumbs: Home -> (opcjonalnie parent) -> current
    crumbs = [{"name": BRAND, "item": f"{SITE_URL}/{lang}/"}]
    parent_slug = t(page.get("parentSlug") or "")
    if parent_slug:
        crumbs.append({"name": t(page.get("parentTitle") or parent_slug.replace("-"," ").title()),
                       "item": f"{SITE_URL}/{lang}/{norm_slug(parent_slug)}/"})
    crumbs.append({"name": t(page.get("title") or title), "item": url})

    jsonld = [org_jsonld(), webpage_jsonld(title, desc, url), breadcrumb_jsonld(crumbs)]

    return {
        "title": title,
        "description": desc,
        "canonical": url,
        "og_title": title,
        "og_description": desc,
        "og_image": ogimg,
        "jsonld": jsonld,
        "hreflangs": hreflangs,
        "x_default": x_default,
        "extra_head": head_extra_html()
    }

# --- Render strony pojedynczej ---
def render_page(page, all_pages, strings):
    lang = (page.get("lang") or DEFAULT_LANG).lower()
    slug = norm_slug(page.get("slug"))
    path = out_path_for(lang, slug if slug not in ("home","") else "")
    ensure_dir(path)

    # body_md -> HTML
    body_md = page.get("body_md") or page.get("body") or page.get("html") or ""
    body_html = markdown(body_md, extensions=["extra", "sane_lists"])

    # autolink: whitelist z arkusza NAV/ROUTES albo z 'anchor_text_suggestions'
    wl = []
    for n in NAV or []:
        ph = t(n.get("phrase") or n.get("anchor") or "")
        href = t(n.get("href") or n.get("url") or "")
        if ph and href:
            wl.append({"phrase": ph, "href": href})
    for r in ROUTES or []:
        ph = t(r.get("phrase") or r.get("anchor") or "")
        href = t(r.get("href") or r.get("url") or "")
        if ph and href:
            wl.append({"phrase": ph, "href": href})
    for ph in csv_list(page.get("anchor_text_suggestions")):
        # automatycznie linkujemy do samej strony (jeśli nie zdefiniowano w NAV)
        wl.append({"phrase": ph, "href": url_for(lang, slug)})

    body_html = autolink_html(body_html, wl, per_section_limit=2)

    # related
    related = build_related(page, [q for q in all_pages if to_bool(q.get("publish", True))])

    head = build_head(page, all_pages, strings)

    # wybór szablonu
    tpl_name = t(page.get("template") or "page.html")
    if not (TPLS / tpl_name).exists():
        tpl_name = "page.html"

    ctx = {
        "site_url": SITE_URL,
        "brand": BRAND,
        "updated": now_iso(),
        "company": COMPANY,
        "nav": NAV,
        "page": page,
        "page_html": body_html,
        "faq": [f for f in FAQ if t(f.get("slug")) == slug or t(f.get("page")) == slug],
        "related": related,
        "media": MEDIA,
        "head": head,
        "strings": strings
        "blog": BLOG,
        "authors": AUTHORS,
        "categories": CATEGORIES,
        "reviews": REVIEWS,
        "jobs": JOBS,
    }
    html = env.get_template(tpl_name).render(**ctx)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path

# --- Specjalne pliki ---
def write_root_redirect(default_lang=DEFAULT_LANG):
    p = DIST / "index.html"
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
  <p>Redirecting to <a href="{target}">{target}</a>…</p>
  <script>location.replace("{target}");</script>
</body></html>"""
    with open(p, "w", encoding="utf-8") as f:
        f.write(html)

def write_cname():
    (DIST / "CNAME").write_text(CNAME_TARGET.strip() + "\n", "utf-8")

def write_404():
    p = DIST / "404.html"
    html = f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head>
  <meta charset="utf-8">
  <title>404 — {BRAND}</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="{SITE_URL}/404.html">
  <style>body{{font:16px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:4rem;color:#222}}a{{color:#06f}}</style>
</head>
<body>
  <h1>Nie znaleziono strony</h1>
  <p>Wróć na <a href="{SITE_URL}/">stronę główną</a>.</p>
</body></html>"""
    with open(p, "w", encoding="utf-8") as f:
        f.write(html)

def write_robots():
    robots = f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"
    (DIST / "robots.txt").write_text(robots, "utf-8")

# --- Sitemaps: index + cząstkowe (pages + blog) ---
def write_sitemaps(generated_urls, blog_urls=None):
    blog_urls = blog_urls or []
    ts = now_iso()
    def make(urls):
        body = "\n".join([f"<url><loc>{u}</loc><lastmod>{ts}</lastmod></url>" for u in sorted(set(urls))])
        return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n'

    # pages
    (DIST / "sitemap-pages.xml").write_text(make(generated_urls), "utf-8")
    # blog (jeśli jest)
    if blog_urls:
        (DIST / "sitemap-blog.xml").write_text(make(blog_urls), "utf-8")

    # index
    parts = [f"<sitemap><loc>{SITE_URL}/sitemap-pages.xml</loc><lastmod>{ts}</lastmod></sitemap>"]
    if blog_urls:
        parts.append(f"<sitemap><loc>{SITE_URL}/sitemap-blog.xml</loc><lastmod>{ts}</lastmod></sitemap>")
    idx = f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(parts) + "\n</sitemapindex>\n"
    (DIST / "sitemap.xml").write_text(idx, "utf-8")

# --- SNAPSHOT ZIP ---
def write_snapshot_zip():
    dst_dir = DIST / "download"
    dst_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dst_dir / "site.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_dir():
                continue
            rel = p.relative_to(DIST)
            # nie pakujemy ZIP-a w ZIP
            if str(rel).startswith("download/"):
                continue
            z.write(p, rel)
    return zip_path

# --- Główne wykonanie ---
def main():
    clean_dist()
    copy_static()

    # użyte języki
    langs = sorted(set([(t(p.get("lang")) or DEFAULT_LANG).lower() for p in PAGES if to_bool(p.get("publish", True))] + [DEFAULT_LANG]))

    # Strings per lang
    strings_cache = { lg: build_strings(STR_ROWS, lg) for lg in langs }

    # Render stron
    generated_urls = []
    published_pages = [p for p in PAGES if to_bool(p.get("publish", True))]
    for p in published_pages:
        lg = (p.get("lang") or DEFAULT_LANG).lower()
        sdict = strings_cache.get(lg, {})
        path = render_page(p, PAGES, sdict)
        # URL do sitemap
        slug = norm_slug(p.get("slug"))
        generated_urls.append(url_for(lg, slug if slug not in ("home","") else ""))

    # (opcjonalnie) blog
    blog_urls = []
    if BLOG:
        for post in BLOG:
            if not to_bool(post.get("publish", True)):
                continue
            lg = (post.get("lang") or DEFAULT_LANG).lower()
            slug = norm_slug(post.get("slug") or post.get("id"))
            # minimalny render, fallback page.html
            page_like = {
                "lang": lg,
                "slug": slug,
                "title": t(post.get("title")),
                "seo_title": t(post.get("seo_title") or post.get("title")),
                "meta_desc": t(post.get("meta_desc") or post.get("description")),
                "body_md": t(post.get("body_md") or post.get("body") or ""),
                "template": t(post.get("template") or "blog_post.html"),
                "tags": post.get("tags") or ""
            }
            sdict = strings_cache.get(lg, {})
            render_page(page_like, PAGES, sdict)
            blog_urls.append(url_for(lg, slug))

    # Specjalne pliki
    write_root_redirect(DEFAULT_LANG)
    write_404()
    write_robots()
    write_cname()
    write_sitemaps(generated_urls, blog_urls)

    # Snapshot
    write_snapshot_zip()

    # Podsumowanie
    print(f"[OK] Pages: {len(generated_urls)} | Blog: {len(blog_urls)} | Langs: {', '.join(langs)}")
    print(f"[OK] Dist: {DIST}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
