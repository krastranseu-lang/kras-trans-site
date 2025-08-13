#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans — statyczny builder „na maksa”
- i18n, hreflang, parentSlug, slugKey
- SEO head + JSON-LD
- Related / autolinki / nawigacja
- sitemap, robots, 404, root redirect
- zip snapshot + SEO stats
"""

from __future__ import annotations
import os, re, json, shutil, zipfile, math, hashlib, itertools
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown import markdown as md
from bs4 import BeautifulSoup
from slugify import slugify

# --- ŚCIEŻKI ---
REPO = Path(__file__).resolve().parents[1]
SRC_TPL = REPO / "templates"
SRC_ASSETS = REPO / "assets"
SRC_STATIC = REPO / "static"
DATA_DIR = REPO / "data"
DIST = REPO / "dist"
DOWNLOAD = DIST / "download"

# --- ENV / KONFIG ---
SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = os.getenv("DEFAULT_LANG", "pl").lower()
BRAND = os.getenv("BRAND", "Kras-Trans")

GA_ID = os.getenv("GA_ID", "").strip()
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "").strip()
CNAME = os.getenv("CNAME", "kras-trans.com").strip()

# Mapowanie typ->domyślny szablon (jeśli plik istnieje)
TEMPLATE_MAP = {
    "home": "page.html",
    "hub": "page.html",
    "leaf": "page.html",
    "service": "page.html",
    "blog_index": "blog_index.html",
    "blog_post": "blog_post.html",
    "case_index": "case_index.html",
    "case_item": "case_item.html",
    "reviews": "reviews.html",
    "location": "location.html",
    "jobs_index": "jobs_index.html",
    "job_item": "job_item.html",
    "default": "page.html",
}

# --- Jinja ---
env = Environment(
    loader=FileSystemLoader(str(SRC_TPL)),
    autoescape=select_autoescape(['html', 'xml'])
)
env.filters["tojson"] = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))

# --- UTILS ---

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def read_cms() -> dict:
    fp = DATA_DIR / "cms.json"
    if not fp.exists():
        raise FileNotFoundError("Brak data/cms.json — najpierw krok 'Fetch CMS JSON'.")
    with fp.open("r", encoding="utf-8") as f:
        cms = json.load(f)
    # Normalizacja kluczy (na wszelki wypadek)
    if "pages" not in cms:
        raise ValueError("cms.json nie zawiera 'pages'.")
    return cms

def t(v):  # trim tekst
    return "" if v is None else str(v).strip()

def to_bool(v) -> bool:
    return str(v).strip().lower() == "true"

def abs_url(path: str) -> str:
    return urljoin(SITE_URL + "/", path.lstrip("/"))

def join_url(*parts: str) -> str:
    p = "/".join([s.strip("/") for s in parts if t(s)])
    return "/" + p.strip("/") + ("/" if not p.endswith(".html") else "")

def pick_template(page: dict) -> str:
    # Priorytet: page.template -> TYPE map -> default
    cand = t(page.get("template"))
    if cand:
        f = SRC_TPL / cand
        if f.exists():
            return cand
        # dopuszczamy skróty, np. "blog_post"
        cand2 = f"{cand}.html" if not cand.endswith(".html") else cand
        if (SRC_TPL / cand2).exists():
            return cand2
    typ = t(page.get("type", "default")).lower()
    fname = TEMPLATE_MAP.get(typ, TEMPLATE_MAP["default"])
    if (SRC_TPL / fname).exists():
        return fname
    return TEMPLATE_MAP["default"]

def build_url(page: dict, pages_by_slug: dict) -> str:
    lang = t(page.get("lang") or DEFAULT_LANG).lower()
    slug = t(page.get("slug"))
    parent = t(page.get("parentSlug"))
    parts = [lang]
    if parent:
        parts.append(parent)
    if slug and slug.lower() not in ("home",):
        parts.append(slug)
    return join_url(*parts)

def calc_breadcrumbs(page: dict, pages_by_slug: dict) -> list[dict]:
    # Home -> parent (jeśli jest) -> current
    crumbs = []
    lang = t(page.get("lang") or DEFAULT_LANG).lower()
    home_url = join_url(lang)
    crumbs.append({"name": BRAND, "item": abs_url(home_url)})
    parent = t(page.get("parentSlug"))
    if parent:
        crumbs.append({"name": parent.replace("-", " ").title(),
                       "item": abs_url(join_url(lang, parent))})
    crumbs.append({"name": t(page.get("title") or page.get("h1") or "Strona"),
                   "item": abs_url(build_url(page, pages_by_slug))})
    # usuń duplikaty po item
    seen = set()
    dedup = []
    for c in crumbs:
        if c["item"] in seen: 
            continue
        seen.add(c["item"])
        dedup.append(c)
    return dedup

def md_to_html(md_text: str) -> str:
    if not t(md_text):
        return ""
    return md(md_text, extensions=["extra", "sane_lists", "tables", "toc"])

def html_text_stats(html: str) -> dict:
    soup = BeautifulSoup(html or "", "lxml")
    # usuń nav/aside/footer ze zliczania
    for tag in soup(["nav", "aside", "footer", "script", "style"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    words = [w for w in re.split(r"\s+", text) if w]
    word_count = len(words)
    read_min = max(1, math.ceil(word_count / 200.0))
    h1 = len(soup.find_all(re.compile("^h1$", re.I)))
    h2 = len(soup.find_all(re.compile("^h2$", re.I)))
    h3 = len(soup.find_all(re.compile("^h3$", re.I)))
    links = len(soup.find_all("a"))
    imgs = len(soup.find_all("img"))
    return {
        "words": word_count, "reading_minutes": read_min,
        "h1": h1, "h2": h2, "h3": h3, "links": links, "images": imgs
    }

def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8", "ignore")).hexdigest()

def choose_related(cur: dict, candidates: list[dict], nmin=3, nmax=6) -> list[dict]:
    tags = set([x.strip().lower() for x in (cur.get("tags") or []) if t(x)])
    pool = []
    for p in candidates:
        if p is cur: 
            continue
        score = 0
        if tags:
            score += len(tags.intersection([x.strip().lower() for x in (p.get("tags") or []) if t(x)]))
        if p.get("parentSlug") == cur.get("parentSlug"):
            score += 0.5
        pool.append((score, p))
    pool.sort(key=lambda x: (-x[0], t(x[1].get("title")).lower()))
    rel = [x[1] for x in pool if x[0] > 0]
    # uzupełnij (gdy brak tagów)
    if len(rel) < nmin:
        more = [p for _, p in pool if p not in rel]
        rel += more
    rel = rel[:max(nmin, min(nmax, len(rel)))]
    return rel

def apply_autolinks(html: str, autolinks: list[dict]) -> str:
    if not autolinks:
        return html
    soup = BeautifulSoup(html, "lxml")
    body = soup  # pracujemy na całym drzewie
    text_nodes = body.find_all(string=True)
    for rule in autolinks:
        phrase = t(rule.get("phrase") or rule.get("keyword"))
        url = t(rule.get("url"))
        limit = int(rule.get("limit") or rule.get("max_per_page") or "1")
        if not phrase or not url or limit <= 0:
            continue
        done = 0
        pattern = re.compile(rf"(?i)(\b{re.escape(phrase)}\b)")
        for node in list(text_nodes):
            if done >= limit:
                break
            if not node or not t(node):
                continue
            parent = node.parent
            if parent.name in ("a", "script", "style"):
                continue
            new_html, cnt = pattern.subn(f'<a href="{url}">{phrase}</a>', str(node), count=(limit-done))
            if cnt > 0:
                new_frag = BeautifulSoup(new_html, "lxml")
                node.replace_with(new_frag)
                done += cnt
    return str(soup)

def jsonld_organization(company: list[dict]) -> dict|None:
    if not company:
        return None
    c = company[0]
    org = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": c.get("name") or BRAND,
        "url": SITE_URL,
    }
    if t(c.get("logo")):
        org["logo"] = abs_url(c["logo"])
    if t(c.get("telephone")):
        org["telephone"] = c["telephone"]
    if any(t(c.get(k)) for k in ("street_address","address_locality","postal_code","address_country")):
        org["address"] = {
            "@type": "PostalAddress",
            "streetAddress": c.get("street_address",""),
            "addressLocality": c.get("address_locality",""),
            "postalCode": c.get("postal_code",""),
            "addressCountry": c.get("address_country","PL"),
        }
    return org

def jsonld_breadcrumbs(crumbs: list[dict]) -> dict:
    items = []
    for i, c in enumerate(crumbs, 1):
        items.append({"@type":"ListItem","position":i,"name":c["name"],"item":c["item"]})
    return {
        "@context":"https://schema.org",
        "@type":"BreadcrumbList",
        "itemListElement": items
    }

def head_meta(page: dict, url: str, og_image: str) -> dict:
    title = t(page.get("seo_title") or page.get("title") or page.get("h1") or BRAND)
    desc = t(page.get("description") or page.get("meta_desc") or "")
    canonical = abs_url(url)
    return {
        "title": title,
        "description": desc,
        "canonical": canonical,
        "og_title": title,
        "og_description": desc,
        "og_image": og_image,
        "extra_head": "",  # miejsce na dodatkowe rzeczy
    }

def guess_og_image(page: dict) -> str:
    cand = t(page.get("og_image") or page.get("hero_image") or page.get("lcp_image") or "")
    if cand:
        if cand.startswith("http"):
            return cand
        # przyjmujemy, że ścieżki w arkuszu to "static/img/..." lub tylko nazwa
        if cand.startswith("static/"):
            return abs_url("/" + cand.lstrip("/"))
        return abs_url("/static/img/" + cand)
    return abs_url("/static/img/placeholder-hero-desktop.webp")

def build_nav(cms_nav: list[dict], pages: list[dict]) -> list[dict]:
    if cms_nav:
        nav = []
        for r in cms_nav:
            label = t(r.get("label") or r.get("name"))
            href = t(r.get("url") or r.get("href"))
            if label and href:
                nav.append({"label": label, "url": href})
        return nav
    # fallback – huby PL
    nav = []
    hubs = [p for p in pages if p.get("type") in ("hub","service") and p.get("lang",DEFAULT_LANG)==DEFAULT_LANG]
    hubs.sort(key=lambda x: t(x.get("title")).lower())
    for h in hubs[:8]:
        nav.append({"label": t(h.get("title")), "url": build_url(h, {})})
    return nav

def write_file(path: Path, content: str, binary=False):
    ensure_dir(path.parent)
    mode = "wb" if binary else "w"
    with path.open(mode) as f:
        if binary:
            f.write(content)
        else:
            f.write(content if isinstance(content, str) else str(content))

def copy_tree(src: Path, dst: Path):
    if not src.exists():
        return
    for p in src.rglob("*"):
        if p.is_dir():
            continue
        rel = p.relative_to(src)
        out = dst / rel
        ensure_dir(out.parent)
        shutil.copy2(str(p), str(out))

def write_root_redirect(dist: Path, default_lang=DEFAULT_LANG, site_url=SITE_URL):
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
    write_file(root, html)

def write_404(dist: Path, lang=DEFAULT_LANG):
    html = f"""<!doctype html><html lang="{lang}">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 — Nie znaleziono</title>
<link rel="canonical" href="{SITE_URL}/404.html">
<meta name="robots" content="noindex,follow">
<style>
body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,sans-serif;background:#0e0f12;color:#e8eaed;margin:0}}
main{{max-width:64rem;margin:8vh auto;padding:0 1rem}}
a{{color:#7cc6ff}}
</style></head>
<body><main>
<h1>404 — Nie znaleziono</h1>
<p>Ups! Tej strony nie ma. Wróć do <a href="/{lang}/">strony głównej</a>.</p>
</main></body></html>"""
    write_file(dist / "404.html", html)

def write_robots(dist: Path):
    lines = [
        "User-agent: *",
        "Allow: /",
        f"Sitemap: {SITE_URL}/sitemap.xml",
        ""
    ]
    write_file(dist / "robots.txt", "\n".join(lines))

def write_sitemap(dist: Path, items: list[dict]):
    # items: {loc, lastmod, alternates:[{hreflang, href}]}
    from xml.sax.saxutils import escape
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
             'xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for it in items:
        parts.append("<url>")
        parts.append(f"<loc>{escape(it['loc'])}</loc>")
        if it.get("lastmod"):
            parts.append(f"<lastmod>{escape(it['lastmod'])}</lastmod>")
        for alt in it.get("alternates", []):
            parts.append(f'<xhtml:link rel="alternate" hreflang="{escape(alt["hreflang"])}" href="{escape(alt["href"])}" />')
        parts.append("</url>")
    parts.append("</urlset>")
    write_file(dist / "sitemap.xml", "\n".join(parts))

def zip_site(dist: Path):
    ensure_dir(DOWNLOAD)
    zip_path = DOWNLOAD / "site.zip"
    # Usuń poprzedni zip (żeby nie pakować samego siebie)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(str(zip_path), "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in dist.rglob("*"):
            if p.is_dir():
                continue
            rel = p.relative_to(dist)
            if str(rel).startswith("download/"):
                continue
            z.write(str(p), str(rel))

# --- GŁÓWNA BUDOWA ---

def main():
    print("== Build start ==")
    ensure_dir(DIST)

    cms = read_cms()
    pages_raw = cms.get("pages", [])
    company = cms.get("company", [])
    faq = cms.get("faq", [])
    nav_sheet = cms.get("nav", [])
    redirects = cms.get("redirects", [])
    blocks = cms.get("blocks", [])
    strings = cms.get("strings", [])
    routes = cms.get("routes", [])
    places = cms.get("places", [])
    autolinks = cms.get("autolinks", []) or cms.get("AutoLinks", [])

    # Normalizacja stron
    pages = []
    for r in pages_raw:
        o = {k.strip(): r[k] for k in r}
        o["publish"] = to_bool(o.get("publish", True))
        if not o["publish"]:
            continue
        o["lang"] = t(o.get("lang") or DEFAULT_LANG).lower()
        # listy
        for list_key in ("tags","secondary_keywords","anchor_text_suggestions",
                         "related_override","service_languages","structured_data_types"):
            v = o.get(list_key)
            if isinstance(v, list):
                o[list_key] = v
            else:
                o[list_key] = [x.strip() for x in t(v).split(",") if x and x.strip()]
        # liczby
        o["min_outlinks"] = int(o.get("min_outlinks") or 3)
        o["max_outlinks"] = int(o.get("max_outlinks") or 6)
        pages.append(o)

    # Mapy pomocnicze
    pages_by_slug = {(p.get("lang"), p.get("slug")): p for p in pages}
    # Grupowanie po slugKey dla hreflang
    groups = {}
    for p in pages:
        key = t(p.get("slugKey") or f"{p.get('slug')}-{p.get('type')}")
        groups.setdefault(key, []).append(p)

    # Nav
    nav = build_nav(nav_sheet, pages)

    # Kopiuj assets/static
    copy_tree(SRC_ASSETS, DIST / "assets")
    copy_tree(SRC_STATIC, DIST / "static")

    # CNAME
    if t(CNAME):
        write_file(DIST / "CNAME", CNAME + "\n")

    # Render
    env.globals.update({
        "site_url": SITE_URL,
        "brand": BRAND,
        "GA_ID": GA_ID,
        "GSC_VERIFICATION": GSC_VERIFICATION,
    })

    sitemap_items = []
    seo_stats = {}

    for page in pages:
        url = build_url(page, pages_by_slug)
        abs_loc = abs_url(url)

        # Hreflangs
        hreflangs = []
        group_key = t(page.get("slugKey") or f"{page.get('slug')}-{page.get('type')}")
        siblings = groups.get(group_key, [])
        for sib in siblings:
            if sib is page:
                continue
            hreflangs.append({
                "lang": sib["lang"],
                "url": abs_url(build_url(sib, pages_by_slug))
            })
        x_default = abs_loc  # bieżąca jako x-default (prosto)

        # Breadcrumbs + JSON-LD base
        crumbs = calc_breadcrumbs(page, pages_by_slug)
        jsonld = []
        org = jsonld_organization(company)
        if org:
            jsonld.append(org)
        jsonld.append(jsonld_breadcrumbs(crumbs))
        jsonld.append({
            "@context":"https://schema.org",
            "@type":"WebPage",
            "name": t(page.get("title") or page.get("h1") or BRAND),
            "url": abs_loc,
            "inLanguage": page["lang"]
        })
        jsonld.append({
            "@context":"https://schema.org",
            "@type":"WebSite",
            "name": BRAND,
            "url": SITE_URL
        })

        og_image = guess_og_image(page)
        head = head_meta(page, url, og_image)
        head["hreflangs"] = [{"lang": h["lang"], "url": h["url"]} for h in hreflangs]
        head["x_default"] = x_default

        # Body / HTML
        body_html = md_to_html(page.get("body_md",""))
        if autolinks:
            body_html = apply_autolinks(body_html, autolinks)

        # Related
        related_override = page.get("related_override") or []
        related_list = []
        if related_override:
            # spróbuj po slugach
            for slug in related_override:
                cand = pages_by_slug.get((page["lang"], slug))
                if cand:
                    related_list.append({"title": t(cand.get("title")), "url": build_url(cand, pages_by_slug)})
        if not related_list:
            rel = choose_related(page, [p for p in pages if p.get("lang")==page["lang"]],
                                 page["min_outlinks"], page["max_outlinks"])
            related_list = [{"title": t(p.get("title")), "url": build_url(p, pages_by_slug)} for p in rel]

        # Hreflang w template
        head_hreflangs = [{"lang": h["lang"], "url": h["url"]} for h in hreflangs]

        # Render
        tpl_name = pick_template(page)
        template = env.get_template(tpl_name)

        ctx = {
            "site_url": SITE_URL,
            "brand": BRAND,
            "GA_ID": GA_ID,
            "GSC_VERIFICATION": GSC_VERIFICATION,

            "page": page,
            "company": company,
            "faq": faq,
            "nav": nav,
            "blocks": blocks,
            "strings": strings,
            "routes": routes,
            "places": places,

            "url": url,
            "head": {
                **head,
                "hreflangs": [{"lang": h["lang"], "url": h["url"]} for h in hreflangs]
            },
            "related": related_list,
            "crumbs": crumbs,
            "jsonld": jsonld,
            "body_html": body_html
        }

        html = template.render(**ctx)

        # Zapis
        out_path = DIST / url.strip("/ ")
        if not str(out_path).endswith(".html"):
            out_path = out_path / "index.html"
        write_file(out_path, html)

        # Statystyki SEO
        stats = html_text_stats(html)
        seo_stats[url] = {
            "title": head["title"],
            "description_len": len(head["description"]),
            **stats
        }

        # Sitemap
        sitemap_items.append({
            "loc": abs_loc,
            "lastmod": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "alternates": [{"hreflang": page["lang"], "href": abs_loc}] +
                          [{"hreflang": h["lang"], "href": h["url"]} for h in hreflangs] +
                          [{"hreflang": "x-default", "href": x_default}]
        })

    # Redirects z arkusza
    for r in redirects:
        frm = t(r.get("from") or r.get("src") or r.get("old"))
        to = t(r.get("to") or r.get("dest") or r.get("new"))
        if not frm or not to:
            continue
        # generujemy małą stronę z meta refresh
        if not frm.startswith("/"):
            frm = "/" + frm
        if not frm.endswith("/"):
            frm = frm + "/"
        html = f"""<!doctype html><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url={to}">
<link rel="canonical" href="{abs_url(to)}">
<title>Redirect</title>
<a href="{to}">Przekierowanie…</a>"""
        out = DIST / frm.strip("/")
        if out.is_dir():
            write_file(out / "index.html", html)
        else:
            ensure_dir(out)
            write_file(out / "index.html", html)

    # Pliki globalne
    write_root_redirect(DIST, DEFAULT_LANG, SITE_URL)
    write_404(DIST, DEFAULT_LANG)
    write_robots(DIST)
    write_sitemap(DIST, sitemap_items)

    # SEO stats + ZIP
    write_file(DIST / "seo-stats.json", json.dumps(seo_stats, ensure_ascii=False, indent=2))
    zip_site(DIST)

    print(f"== Build done. Pages: {len(pages)}  ==")

if __name__ == "__main__":
    main()
