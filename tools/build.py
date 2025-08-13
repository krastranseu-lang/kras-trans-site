#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans — statyczny build z CMS (Google Sheets → Apps Script → data/cms.json)

Obsługa:
- Pages (home/hub/service/leaf)
- Blog (Posts, Categories, Authors)
- CaseStudies, Reviews (opinie), Locations (NAP), Jobs
- Nav/Blocks/Templates/Strings/Routes/Redirects
- hreflang, canonical, breadcrumbs
- JSON-LD (Organization/WebSite/WebPage/BreadcrumbList/BlogPosting/JobPosting/AggregateRating)
- sitemap.xml (+ xhtml:link hreflang), robots.txt, 404.html
- root redirect /index.html -> /{DEFAULT_LANG}/
- AutoLinks (podlinkowanie słów-kluczy)
- ZIP snapshot dist/download/site.zip
- GA4 + GSC meta injection

ENV (pages.yml -> Build site):
  SITE_URL=https://kras-trans.com
  DEFAULT_LANG=pl
  BRAND="Kras-Trans"
  GA_ID="G-XXXXXXXXXX"
  GSC_VERIFICATION="google-site-verification-code"
  CNAME=kras-trans.com
"""

from __future__ import annotations
import os, re, json, csv, io, shutil, zipfile, datetime as dt
from pathlib import Path
from typing import Dict, List, Any, Optional
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, select_autoescape
import markdown as md
from bs4 import BeautifulSoup

# ---------- ŚCIEŻKI / ENV ----------
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DIST = ROOT / "dist"
TPL  = ROOT / "templates"
ASSETS = ROOT / "assets"
STATIC = ROOT / "static"

SITE_URL = os.environ.get("SITE_URL", "https://example.com").rstrip("/")
DEFAULT_LANG = os.environ.get("DEFAULT_LANG", "pl")
BRAND = os.environ.get("BRAND", "Kras-Trans")
GA_ID = os.environ.get("GA_ID", "")  # np. G-XXXX
GSC_VERIFICATION = os.environ.get("GSC_VERIFICATION", "")
CNAME = os.environ.get("CNAME", "")

NOW = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

# ---------- JINJA ----------
env = Environment(
    loader=FileSystemLoader(str(TPL)),
    autoescape=select_autoescape(["html"]),
    enable_async=False,
    trim_blocks=True,
    lstrip_blocks=True,
)
env.filters["markdown"] = lambda text: md.markdown(text or "", extensions=["extra", "sane_lists"])
env.globals.update({
    "site_url": SITE_URL,
    "brand": BRAND,
    "now": NOW,
})

# ---------- UTYLITY ----------
def clean_dist() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, "utf-8")

def copy_static() -> None:
    # kopiujemy katalogi static/ i assets/ jeśli istnieją
    for src in [STATIC, ASSETS]:
        if src.exists():
            dst = DIST / src.name
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)

def url_for(lang: str, slug: str, is_home: bool=False) -> str:
    if is_home:
        return f"/{lang}/"
    slug = (slug or "").strip("/")
    return f"/{lang}/{slug}/" if slug else f"/{lang}/"

def abs_url(path: str) -> str:
    return SITE_URL.rstrip("/") + path

def md2html(text: str) -> str:
    return md.markdown(text or "", extensions=["extra", "sane_lists"])

def soupify(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "lxml")

def safe_int(v, fallback: int=0) -> int:
    try:
        return int(v)
    except Exception:
        return fallback

def csv_list(v: Any) -> List[str]:
    if not v: return []
    return [x.strip() for x in str(v).split(",") if x and x.strip()]

def to_bool(v: Any) -> bool:
    return str(v).strip().lower() == "true"

def find_parent_chain(pages: List[Dict[str,Any]], page: Dict[str,Any]) -> List[Dict[str,Any]]:
    """Buduje łańcuch rodziców po polu parentSlug (aż do braku)."""
    chain = []
    parent = page.get("parentSlug", "").strip()
    while parent:
        p = next((x for x in pages if x.get("slug")==parent and x.get("lang")==page.get("lang")), None)
        if not p: break
        chain.append(p)
        parent = p.get("parentSlug","").strip()
    chain.reverse()
    return chain

# ---------- JSON-LD ----------
def ld_breadcrumb(lang: str, trail: List[Dict[str,Any]]) -> Dict[str,Any]:
    items = []
    pos = 1
    for it in trail:
        items.append({
            "@type":"ListItem",
            "position": pos,
            "name": it["title"],
            "item": abs_url(it["url"])
        })
        pos += 1
    return {"@context":"https://schema.org", "@type":"BreadcrumbList", "itemListElement": items}

def ld_org(company: List[Dict[str,Any]]) -> Optional[Dict[str,Any]]:
    if not company: return None
    c = company[0]
    out = {
        "@context":"https://schema.org",
        "@type":"Organization",
        "name": c.get("name") or BRAND,
        "url": SITE_URL,
    }
    tel = c.get("telephone")
    if tel: out["telephone"] = tel
    logo = c.get("logo")
    if logo: out["logo"] = abs_url(f"/static/img/{logo}")
    return out

def ld_webpage(title: str, url: str, desc: str="") -> Dict[str,Any]:
    return {"@context":"https://schema.org","@type":"WebPage","name":title,"url":abs_url(url),"description":desc}

def ld_blogposting(post: Dict[str,Any], url: str) -> Dict[str,Any]:
    return {
        "@context":"https://schema.org",
        "@type":"BlogPosting",
        "headline": post.get("title"),
        "datePublished": post.get("date") or NOW,
        "dateModified": post.get("updated") or post.get("date") or NOW,
        "author": {"@type":"Person","name": post.get("author_name") or post.get("author") or BRAND},
        "image": abs_url(f"/static/img/{post.get('image')}") if post.get("image") else None,
        "mainEntityOfPage": abs_url(url),
        "articleBody": (post.get("body_md") or "")[:5000],
    }

def ld_job(job: Dict[str,Any], url: str) -> Dict[str,Any]:
    out = {
        "@context":"https://schema.org",
        "@type":"JobPosting",
        "title": job.get("title"),
        "datePosted": job.get("date") or NOW,
        "description": md2html(job.get("body_md") or ""),
        "hiringOrganization": {"@type":"Organization","name": BRAND, "sameAs": SITE_URL},
        "employmentType": job.get("type") or "FULL_TIME",
        "validThrough": job.get("valid_until") or (dt.date.today()+dt.timedelta(days=60)).isoformat(),
        "jobLocationType": "TELECOMMUTE" if to_bool(job.get("remote")) else "ON_SITE",
        "applicantLocationRequirements": {"@type":"Country","name":"Poland"},
    }
    city = job.get("city"); street = job.get("street"); region = job.get("region") or "PL"
    if city or street:
        out["jobLocation"] = {"@type":"Place","address":{"@type":"PostalAddress","addressLocality":city,"streetAddress":street,"addressRegion":region}}
    return out

def ld_aggregate_rating(reviews: List[Dict[str,Any]]) -> Optional[Dict[str,Any]]:
    vals = [float(r.get("rating")) for r in reviews if r.get("rating")]
    if not vals: return None
    return {
        "@context":"https://schema.org",
        "@type":"AggregateRating",
        "ratingValue": round(sum(vals)/len(vals), 2),
        "reviewCount": len(vals)
    }

# ---------- HEAD / SEO ----------
def make_head(page: Dict[str,Any], pages: List[Dict[str,Any]], company: List[Dict[str,Any]]) -> Dict[str,Any]:
    lang = page.get("lang") or DEFAULT_LANG
    is_home = (page.get("ic","").startswith("ho")) or (page.get("slugKey")=="home") or (page.get("slug","") in ("","home"))
    url = url_for(lang, page.get("slug") or "", is_home=is_home)
    canon = abs_url(url)

    # hreflang – po slugKey (to samo "wydanie" w innych językach)
    hreflangs = []
    slug_key = page.get("slugKey")
    if slug_key:
        alts = [p for p in pages if p.get("slugKey")==slug_key and to_bool(p.get("publish"))]
        for alt in alts:
            hreflangs.append({"lang": alt.get("lang"), "url": abs_url(url_for(alt.get("lang"), alt.get("slug") or "", is_home=(alt.get("slugKey")=="home")))})
    x_default = abs_url(url_for(DEFAULT_LANG, page.get("slug") if page.get("slugKey")!="home" else "", is_home=(page.get("slugKey")=="home")))

    # breadcrumbs
    trail: List[Dict[str,Any]] = []
    # home
    trail.append({"title": BRAND, "url": f"/{lang}/"})
    # parents
    for p in find_parent_chain(pages, page):
        trail.append({"title": p.get("title") or p.get("h1") or p.get("seo_title") or p.get("slug"), "url": url_for(lang, p.get("slug") or "")})
    # self
    trail.append({"title": page.get("title") or page.get("h1") or page.get("seo_title") or BRAND, "url": url})

    jsonld = []
    bcl = ld_breadcrumb(lang, trail)
    if bcl: jsonld.append(bcl)
    wp = ld_webpage(page.get("title") or BRAND, url, page.get("meta_desc") or page.get("description") or "")
    jsonld.append(wp)
    if is_home:
        org = ld_org(company)
        if org: jsonld.append(org)

    og_img = page.get("lcp_image") or page.get("hero_image") or "placeholder-hero-desktop.webp"
    extra_head = []
    if GSC_VERIFICATION:
        extra_head.append(f'<meta name="google-site-verification" content="{GSC_VERIFICATION}">')
    if GA_ID:
        extra_head.append(
            f"""<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){{dataLayer.push(arguments);}}
gtag('js', new Date()); gtag('config', '{GA_ID}');
</script>"""
        )

    head = {
        "title": page.get("seo_title") or page.get("title") or BRAND,
        "description": page.get("meta_desc") or page.get("description") or "",
        "canonical": canon,
        "hreflangs": hreflangs,
        "x_default": x_default,
        "og_title": page.get("seo_title") or page.get("title") or BRAND,
        "og_description": page.get("meta_desc") or page.get("description") or "",
        "og_image": abs_url(f"/static/img/{og_img}"),
        "jsonld": jsonld,
        "extra_head": "\n".join(extra_head),
    }
    return head

# ---------- AUTOLINKS ----------
def apply_autolinks(html: str, rules: List[Dict[str,Any]], max_links: int=10) -> str:
    """Podlinkowuje pierwsze wystąpienia fraz. Nie rusza istniejących <a>."""
    if not rules: return html
    soup = soupify(html)
    linked = 0

    text_nodes = soup.find_all(string=True)
    for node in text_nodes:
        if node.parent.name in ["a","script","style","code","pre","noscript"]: 
            continue
        txt = str(node)
        replaced = txt
        for r in rules:
            if linked >= max_links: break
            phrase = r.get("phrase") or r.get("pattern")
            url = r.get("url")
            if not phrase or not url: continue
            # tylko pierwsze wystąpienie frazy, case-insensitive, granice słów
            replaced_new = re.sub(rf"(?i)\b({re.escape(phrase)})\b",
                                  rf'<a href="{url}">\1</a>', replaced, count=1)
            if replaced_new != replaced:
                replaced = replaced_new
                linked += 1
        if replaced != txt:
            node.replace_with(BeautifulSoup(replaced, "lxml"))
        if linked >= max_links: break

    return str(soup)

# ---------- RELATED ----------
def pick_related(all_pages: List[Dict[str,Any]], cur: Dict[str,Any]) -> List[Dict[str,Any]]:
    if cur.get("related_override"):
        urls = csv_list(cur.get("related_override"))
        return [p for p in all_pages if url_for(p.get("lang"), p.get("slug") or "", is_home=(p.get("slugKey")=="home")) in urls]
    # prosta heurystyka: ten sam hub/pillar/serv
    same = [p for p in all_pages
            if p is not cur
            and p.get("lang")==cur.get("lang")
            and (p.get("hub")==cur.get("hub") or p.get("pillar")==cur.get("pillar") or p.get("serv")==cur.get("serv"))
            and to_bool(p.get("publish"))]
    same = same[:safe_int(cur.get("max_outlinks"),6)]
    return same

# ---------- RENDER ----------
def render_page(tpl_name: str, ctx: Dict[str,Any]) -> str:
    tpl = env.get_template(tpl_name)
    return tpl.render(**ctx)

# ---------- SITEMAP ----------
def write_sitemap(urls: List[Dict[str,str]]) -> None:
    # urls: [{"loc": "/pl/...", "lastmod": NOW, "alternates":[{"hreflang":"en","href":...}, ...]}]
    from xml.etree.ElementTree import Element, SubElement, tostring
    import xml.dom.minidom as minidom

    NSMAP = {
        "xhtml": "http://www.w3.org/1999/xhtml"
    }
    urlset = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    urlset.set("xmlns:xhtml", NSMAP["xhtml"])

    for u in urls:
        e = SubElement(urlset, "url")
        SubElement(e, "loc").text = abs_url(u["loc"])
        if u.get("lastmod"):
            SubElement(e, "lastmod").text = u["lastmod"]
        for alt in u.get("alternates", []):
            link = SubElement(e, "{http://www.w3.org/1999/xhtml}link")
            link.set("rel", "alternate")
            link.set("hreflang", alt["hreflang"])
            link.set("href", alt["href"])

    xml_bytes = tostring(urlset, encoding="utf-8")
    pretty = minidom.parseString(xml_bytes).toprettyxml(indent="  ", encoding="utf-8")
    write_text(DIST / "sitemap.xml", pretty.decode("utf-8"))

# ---------- ROBOTS ----------
def write_robots() -> None:
    lines = [
        "User-agent: *",
        "Allow: /",
        f"Sitemap: {SITE_URL}/sitemap.xml"
    ]
    write_text(DIST / "robots.txt", "\n".join(lines))

# ---------- 404 ----------
def write_404() -> None:
    html = f"""<!doctype html><html lang="{DEFAULT_LANG}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 — Nie znaleziono</title>
<link rel="canonical" href="{SITE_URL}/404.html">
<meta name="robots" content="noindex,follow">
<link rel="stylesheet" href="{SITE_URL}/static/css/site.css">
</head><body><main class="content"><h1>404 — Nie znaleziono</h1>
<p>Ups! Tej strony nie ma. Wróć do <a href="{SITE_URL}/">strony głównej</a>.</p>
</main></body></html>"""
    write_text(DIST / "404.html", html)

# ---------- ROOT REDIRECT ----------
def write_root_redirect(default_lang: str=DEFAULT_LANG) -> None:
    target = f"/{default_lang}/"
    html = f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>{BRAND}</title>
<meta http-equiv="refresh" content="0; url={target}">
<link rel="canonical" href="{SITE_URL}{target}">
<meta name="robots" content="noindex,follow"></head>
<body><p>Przenoszę do <a href="{target}">{target}</a>…</p>
<script>location.replace("{target}")</script>
</body></html>"""
    write_text(DIST / "index.html", html)

# ---------- ZIP SNAPSHOT ----------
def zip_site() -> None:
    dld = DIST / "download"
    dld.mkdir(parents=True, exist_ok=True)
    zpath = dld / "site.zip"
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_file() and "download/site.zip" not in str(p).replace("\\","/"):
                z.write(p, p.relative_to(DIST))

# ---------- DIAGNOSTICS ----------
def diagnostics(published_pages: List[Dict[str,Any]]) -> None:
    report = {
        "generated": NOW,
        "count_pages": len(published_pages),
        "langs": sorted(list(set(p.get("lang") for p in published_pages))),
        "missing_meta_desc": [p.get("slug") for p in published_pages if not p.get("meta_desc")],
        "missing_h1": [p.get("slug") for p in published_pages if not p.get("h1") and not p.get("title")],
    }
    (DIST / "seo").mkdir(parents=True, exist_ok=True)
    write_text(DIST / "seo" / "diagnostics.json", json.dumps(report, ensure_ascii=False, indent=2))

# ---------- MAIN BUILD ----------
def main() -> None:
    clean_dist()
    copy_static()

    cms = json.loads((DATA / "cms.json").read_text("utf-8"))

    pages: List[Dict[str,Any]] = cms.get("pages", [])
    company: List[Dict[str,Any]] = cms.get("company", [])
    redirects = cms.get("redirects", [])
    nav = cms.get("nav", [])
    blocks = cms.get("blocks", [])
    templates = cms.get("templates", [])
    strings = cms.get("strings", [])
    routes = cms.get("routes", [])
    places = cms.get("places", [])
    autolinks = cms.get("autolinks", []) or cms.get("AutoLinks", []) or []

    # nowości (mogą nie istnieć – ignorujemy)
    blog_posts = cms.get("blog", []) or cms.get("posts", [])
    categories = cms.get("categories", [])
    authors = cms.get("authors", [])
    case_studies = cms.get("caseStudies", []) or cms.get("casestudies", [])
    reviews = cms.get("reviews", [])
    locations = cms.get("locations", [])
    jobs = cms.get("jobs", [])

    # tylko opublikowane
    published_pages = [p for p in pages if to_bool(p.get("publish"))]

    urls_for_sitemap: List[Dict[str,Any]] = []

    # --- render stron podstawowych ---
    for p in published_pages:
        lang = p.get("lang") or DEFAULT_LANG
        is_home = (p.get("ic","").startswith("ho")) or (p.get("slugKey")=="home") or (p.get("slug","") in ("","home"))
        url = url_for(lang, p.get("slug") or "", is_home=is_home)

        head = make_head(p, published_pages, company)

        # related
        rel = pick_related(published_pages, p)

        # body_html
        body_html = md2html(p.get("body_md") or "")
        # autolinks w treści
        body_html = apply_autolinks(body_html, autolinks, max_links=safe_int(p.get("max_outlinks"), 8))

        ctx = {
            "site_url": SITE_URL,
            "brand": BRAND,
            "page": {**p, "html": body_html},
            "company": company,
            "nav": nav,
            "blocks": blocks,
            "templates_meta": templates,
            "strings": strings,
            "routes": routes,
            "places": places,
            "related": [{"title": r.get("title") or r.get("h1") or r.get("seo_title") or r.get("slug"),
                         "url": url_for(r.get("lang"), r.get("slug") or "", is_home=(r.get("slugKey")=="home"))}
                        for r in rel],
            "head": head,
        }

        tpl_name = f"{p.get('template') or 'page'}.html"
        try:
            html = render_page(tpl_name, ctx)
        except Exception as e:
            # fallback na page.html
            html = render_page("page.html", ctx)

        out = DIST / url.strip("/")
        write_text(out / "index.html", html)

        # sitemap alt/hreflang
        alts = []
        if head.get("hreflangs"):
            for alt in head["hreflangs"]:
                alts.append({"hreflang": alt["lang"], "href": alt["url"]})
            # x-default
            alts.append({"hreflang":"x-default","href": head["x_default"]})

        urls_for_sitemap.append({"loc": url, "lastmod": NOW, "alternates": alts})

    # --- Blog ---
    if blog_posts:
        # index
        blog_langs = sorted(set(p.get("lang") or DEFAULT_LANG for p in blog_posts))
        for lang in blog_langs:
            posts_lang = [p for p in blog_posts if (p.get("lang") or DEFAULT_LANG)==lang]
            for post in posts_lang:
                post["html"] = md2html(post.get("body_md") or "")
                post["url"]  = url_for(lang, f"blog/{post.get('slug')}")
            # strona listy
            page_stub = {"lang": lang, "slug":"blog", "title":"Blog", "slugKey":"blog-index", "publish": True}
            head = make_head(page_stub, published_pages, company)
            html = render_page("blog_index.html", {
                "site_url": SITE_URL, "brand": BRAND,
                "head": head, "company": company, "posts": posts_lang, "page": page_stub, "nav": nav
            })
            out = DIST / f"{lang}/blog"
            write_text(out / "index.html", html)
            urls_for_sitemap.append({"loc": f"/{lang}/blog/", "lastmod": NOW})

            # posty
            for post in posts_lang:
                ld = ld_blogposting(post, post["url"])
                head_p = {
                    "title": post.get("seo_title") or post.get("title"),
                    "description": post.get("meta_desc") or post.get("description") or "",
                    "canonical": abs_url(post["url"]),
                    "hreflangs": [],
                    "x_default": abs_url(post["url"]),
                    "og_title": post.get("seo_title") or post.get("title"),
                    "og_description": post.get("meta_desc") or post.get("description") or "",
                    "og_image": abs_url(f"/static/img/{post.get('image')}") if post.get("image") else abs_url("/static/img/placeholder-hero-desktop.webp"),
                    "jsonld": [ld],
                    "extra_head": "",
                }
                htmlp = render_page("blog_post.html", {
                    "site_url": SITE_URL, "brand": BRAND, "head": head_p, "post": post, "company": company, "nav": nav
                })
                outp = DIST / post["url"].strip("/")
                write_text(outp / "index.html", htmlp)
                urls_for_sitemap.append({"loc": post["url"], "lastmod": NOW})

    # --- Case Studies ---
    if case_studies:
        langs = sorted(set(cs.get("lang") or DEFAULT_LANG for cs in case_studies))
        for lang in langs:
            items = [cs for cs in case_studies if (cs.get("lang") or DEFAULT_LANG)==lang]
            for cs in items:
                cs["html"] = md2html(cs.get("body_md") or "")
                cs["url"]  = url_for(lang, f"case/{cs.get('slug')}")
            head = make_head({"lang":lang, "slug":"case", "title":"Case Studies","slugKey":"cs-index","publish":True}, published_pages, company)
            html = render_page("case_index.html", {"site_url":SITE_URL,"brand":BRAND,"head":head,"items":items,"nav":nav})
            write_text(DIST / f"{lang}/case/index.html", html)
            urls_for_sitemap.append({"loc": f"/{lang}/case/", "lastmod": NOW})
            for cs in items:
                head_cs = {
                    "title": cs.get("title"), "description": cs.get("meta_desc") or "", "canonical": abs_url(cs["url"]),
                    "hreflangs":[], "x_default": abs_url(cs["url"]),
                    "og_title": cs.get("title"), "og_description": cs.get("meta_desc") or "",
                    "og_image": abs_url(f"/static/img/{cs.get('image')}") if cs.get("image") else abs_url("/static/img/placeholder-hero-desktop.webp"),
                    "jsonld":[ld_webpage(cs.get("title"), cs["url"], cs.get("meta_desc") or "")],
                    "extra_head":""
                }
                html_cs = render_page("case_item.html", {"site_url":SITE_URL,"brand":BRAND,"head":head_cs,"item":cs,"nav":nav})
                write_text(DIST / cs["url"].strip("/") / "index.html", html_cs)
                urls_for_sitemap.append({"loc": cs["url"], "lastmod": NOW})

    # --- Reviews (opinie) ---
    if reviews:
        # strona zbiorcza + AggregateRating
        langs = sorted(set(r.get("lang") or DEFAULT_LANG for r in reviews))
        for lang in langs:
            items = [r for r in reviews if (r.get("lang") or DEFAULT_LANG)==lang]
            agg = ld_aggregate_rating(items)
            head = {
                "title":"Opinie klientów","description":"Opinie i oceny klientów o firmie Kras-Trans",
                "canonical": abs_url(f"/{lang}/opinie/"), "hreflangs":[], "x_default": abs_url(f"/{lang}/opinie/"),
                "og_title":"Opinie klientów","og_description":"Zobacz, co mówią o nas klienci",
                "og_image": abs_url("/static/img/placeholder-hero-desktop.webp"),
                "jsonld":[agg] if agg else [],
                "extra_head":""
            }
            html = render_page("reviews.html", {"site_url":SITE_URL,"brand":BRAND,"head":head,"reviews":items,"nav":nav})
            write_text(DIST / f"{lang}/opinie/index.html", html)
            urls_for_sitemap.append({"loc": f"/{lang}/opinie/", "lastmod": NOW})

    # --- Locations (NAP) ---
    if locations:
        langs = sorted(set(l.get("lang") or DEFAULT_LANG for l in locations))
        for lang in langs:
            items = [l for l in locations if (l.get("lang") or DEFAULT_LANG)==lang]
            for loc in items:
                loc["url"] = url_for(lang, f"lokalizacja/{loc.get('slug')}")
                head = {
                    "title": loc.get("title") or f"Lokalizacja — {BRAND}",
                    "description": loc.get("meta_desc") or "",
                    "canonical": abs_url(loc["url"]),
                    "hreflangs": [], "x_default": abs_url(loc["url"]),
                    "og_title": loc.get("title") or BRAND, "og_description": loc.get("meta_desc") or "",
                    "og_image": abs_url("/static/img/placeholder-hero-desktop.webp"),
                    "jsonld":[ld_webpage(loc.get("title") or BRAND, loc["url"], loc.get("meta_desc") or "")],
                    "extra_head":""
                }
                html = render_page("location.html", {"site_url":SITE_URL,"brand":BRAND,"head":head,"loc":loc,"nav":nav})
                write_text(DIST / loc["url"].strip("/") / "index.html", html)
                urls_for_sitemap.append({"loc": loc["url"], "lastmod": NOW})

    # --- Jobs ---
    if jobs:
        langs = sorted(set(j.get("lang") or DEFAULT_LANG for j in jobs))
        for lang in langs:
            items = [j for j in jobs if (j.get("lang") or DEFAULT_LANG)==lang]
            for j in items:
                j["url"] = url_for(lang, f"praca/{j.get('slug')}")
            head = make_head({"lang":lang,"slug":"praca","title":"Oferty pracy","slugKey":"jobs-index","publish":True}, published_pages, company)
            html = render_page("jobs_index.html", {"site_url":SITE_URL,"brand":BRAND,"head":head,"jobs":items,"nav":nav})
            write_text(DIST / f"{lang}/praca/index.html", html)
            urls_for_sitemap.append({"loc": f"/{lang}/praca/", "lastmod": NOW})
            for j in items:
                ld = ld_job(j, j["url"])
                head_j = {
                    "title": j.get("title"), "description": j.get("meta_desc") or "",
                    "canonical": abs_url(j["url"]), "hreflangs":[], "x_default": abs_url(j["url"]),
                    "og_title": j.get("title"), "og_description": j.get("meta_desc") or "",
                    "og_image": abs_url("/static/img/placeholder-hero-desktop.webp"),
                    "jsonld":[ld], "extra_head":""
                }
                html_j = render_page("job_item.html", {"site_url":SITE_URL,"brand":BRAND,"head":head_j,"job":j,"nav":nav})
                write_text(DIST / j["url"].strip("/") / "index.html", html_j)
                urls_for_sitemap.append({"loc": j["url"], "lastmod": NOW})

    # --- Redirects (HTML + meta refresh jako fallback dla GH Pages) ---
    for r in redirects or []:
        src = r.get("from") or r.get("src") or r.get("source")
        dst = r.get("to") or r.get("dst") or r.get("target")
        if not src or not dst: continue
        src = src.strip("/"); 
        html = f"""<!doctype html><meta http-equiv="refresh" content="0; url={dst}"><link rel="canonical" href="{abs_url(dst)}"><a href="{dst}">Przekierowano…</a>"""
        write_text(DIST / src / "index.html", html)

    # --- CNAME (dla GH Pages custom domain) ---
    if CNAME:
        write_text(DIST / "CNAME", CNAME.strip())

    # --- robots/sitemap/404/root ---
    write_sitemap(urls_for_sitemap)
    write_robots()
    write_404()
    write_root_redirect(DEFAULT_LANG)

    # --- ZIP snapshot + diagnostics ---
    zip_site()
    diagnostics(published_pages)

    print(f"OK: built {len(urls_for_sitemap)} URLs to dist/")

if __name__ == "__main__":
    main()
