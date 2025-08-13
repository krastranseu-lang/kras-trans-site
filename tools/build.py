#!/usr/bin/env python3
import json, shutil, time, pathlib
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, select_autoescape
import markdown as md

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CMS  = ROOT / "data" / "cms.json"

SITE_URL = "https://kras-trans.com"  # kanoniczna domena

# ---------- narzędzia ----------
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

def write_cname():
    (DIST / "CNAME").write_text("kras-trans.com\n", "utf-8")

def write_robots():
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", "utf-8"
    )

def env_jinja():
    env = Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html"])
    )
    env.filters["tojson"] = lambda x: json.dumps(x, ensure_ascii=False)
    return env

# ---------- JSON-LD ----------
def jsonld_org(company):
    """Organization/LocalBusiness z tabeli Company."""
    if not company:
        return None
    c = dict(company[0])
    name = c.get("name") or c.get("legal_name") or "Kras-Trans"
    logo = c.get("logo") or "logo.svg"
    same_as = [x for x in [c.get("instagram"), c.get("linkedin"), c.get("facebook")] if x]
    addr = None
    if c.get("street_address") or c.get("city"):
        addr = {
            "@type": "PostalAddress",
            "streetAddress": c.get("street_address",""),
            "postalCode": c.get("postal_code",""),
            "addressLocality": c.get("city",""),
            "addressRegion": c.get("region",""),
            "addressCountry": c.get("country","PL"),
        }
    ld = {
        "@context": "https://schema.org",
        "@type": "Organization" if not addr else "LocalBusiness",
        "name": name,
        "legalName": c.get("legal_name") or name,
        "taxID": c.get("tax_id") or c.get("nip") or "",
        "url": SITE_URL,
        "telephone": c.get("telephone",""),
        "email": c.get("email",""),
        "logo": urljoin(SITE_URL, f"static/img/{logo}"),
        "sameAs": same_as,
    }
    if addr: ld["address"] = addr
    if c.get("opening_hours"): ld["openingHours"] = c["opening_hours"]
    return ld

def jsonld_breadcrumbs(page, by_slug):
    """BreadcrumbList: Home -> parent (jeśli jest) -> bieżąca strona."""
    crumbs = []
    pos = 1
    home_url = SITE_URL + "/" + (page.get("lang") or "pl") + "/"
    crumbs.append({"@type":"ListItem","position":pos,"name":"Home","item": home_url})
    pos += 1
    parent_slug = (page.get("parentSlug") or "").strip("/")
    if parent_slug:
        parent = by_slug.get(parent_slug)
        parent_name = (parent.get("h1") or parent.get("title") or parent_slug) if parent else parent_slug
        parent_url = SITE_URL + "/" + (page.get("lang") or "pl") + "/" + parent_slug + "/"
        crumbs.append({"@type":"ListItem","position":pos,"name":parent_name,"item": parent_url})
        pos += 1
    crumbs.append({
        "@type":"ListItem","position":pos,
        "name": page.get("h1") or page.get("title") or "",
        "item": page["abs_url"]
    })
    return {
        "@context":"https://schema.org",
        "@type":"BreadcrumbList",
        "itemListElement": crumbs
    }

# ---------- przetwarzanie stron ----------
def normalize_pages(pages_raw):
    pages = []
    for p in pages_raw:
        if p.get("publish") is False:
            continue
        item = dict(p)
        # URL
        lang = (item.get("lang") or "pl").strip("/")
        slug = (item.get("slug") or "").strip("/")
        if item.get("type") == "home":
            path = f"/{lang}/"
        else:
            path = f"/{lang}/{slug}/" if slug else f"/{lang}/"
        item["url_path"] = path
        item["abs_url"]  = urljoin(SITE_URL, path.lstrip("/"))
        # body_html
        html = item.get("html") or ""
        if not html:
            md_src = item.get("body_md") or ""
            if md_src.strip():
                html = md.markdown(md_src, extensions=["extra","sane_lists","tables"])
        item["html"] = html
        # head
        title = item.get("seo_title") or item.get("title") or ""
        descr = item.get("meta_description") or ""
        item["head"] = {
            "title": title,
            "description": descr,
            "canonical": item["abs_url"],
            "og_title": title,
            "og_description": descr,
            "og_image": urljoin(SITE_URL, f"static/img/{item.get('lcp_image') or 'og-default.webp'}"),
        }
        pages.append(item)
    return pages

def compute_hreflang(pages):
    """Grupuje po slugKey -> dodaje do head.hreflangs + x-default."""
    by_key = {}
    for p in pages:
        key = (p.get("slugKey") or "").strip()
        if not key: 
            continue
        by_key.setdefault(key, {})[p["lang"]] = p["abs_url"]
    for p in pages:
        key = (p.get("slugKey") or "").strip()
        alts = by_key.get(key, {})
        p["head"]["hreflangs"] = [{"lang":k, "url":v} for k,v in sorted(alts.items())]
        # x-default = PL jeśli jest, inaczej pierwszy
        xdef = alts.get("pl") or (list(alts.values())[0] if alts else None)
        p["head"]["x_default"] = xdef

def render_pages(pages, company):
    env = env_jinja()
    tpl = env.get_template("page.html")
    # indeks po slug do breadcrumbs
    by_slug = { (p.get("slug") or "").strip(): p for p in pages }
    org_ld = jsonld_org(company)
    for p in pages:
        ld = [ jsonld_breadcrumbs(p, by_slug) ]
        if org_ld: ld.append(org_ld)
        p["head"]["jsonld"] = ld

        out_dir = DIST / p["url_path"].lstrip("/")
        out_dir.mkdir(parents=True, exist_ok=True)
        html = tpl.render(
            page=p, head=p["head"], company=company,
            site_url=SITE_URL, related=[]
        )
        (out_dir / "index.html").write_text(html, "utf-8")

def write_sitemap(pages):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    items = "\n".join(
        f"<url><loc>{p['abs_url']}</loc><lastmod>{now}</lastmod></url>"
        for p in sorted(pages, key=lambda x: x["abs_url"])
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{items}\n</urlset>\n"
    )
    (DIST / "sitemap.xml").write_text(xml, "utf-8")

def main():
    data = json.loads(CMS.read_text("utf-8"))
    pages_raw = data.get("pages", [])
    company = data.get("company", [])

    clean()
    copy_static()
    keep_cms_json()
    write_cname()
    write_robots()

    pages = normalize_pages(pages_raw)
    compute_hreflang(pages)
    render_pages(pages, company)
    write_sitemap(pages)

if __name__ == "__main__":
    if not CMS.exists():
        raise SystemExit("cms.json not found")
    main()
