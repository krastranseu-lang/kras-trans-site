#!/usr/bin/env python3
import json, os, shutil, time, pathlib
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, select_autoescape
import markdown as md

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CMS  = ROOT / "data" / "cms.json"

SITE_URL = "https://kras-trans.com"  # jedna źródłowa domena (kanonikal)

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
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n","utf-8"
    )

def env_jinja():
    env = Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html"])
    )
    env.filters["tojson"] = lambda x: json.dumps(x, ensure_ascii=False)
    return env

def normalize_pages(pages):
    out = []
    for p in pages:
        if p.get("publish") is False: 
            continue
        item = dict(p)
        # prefer HTML if provided, else render Markdown
        body_html = item.get("html") or ""
        if not body_html:
            body_md = item.get("body_md") or ""
            if body_md.strip():
                body_html = md.markdown(body_md, extensions=["extra","sane_lists","tables"])
        item["html"] = body_html

        # URL wg typu
        lang = (item.get("lang") or "pl").strip("/")
        slug = (item.get("slug") or "").strip("/")
        if item.get("type") == "home":
            path = f"/{lang}/"
        else:
            path = f"/{lang}/{slug}/" if slug else f"/{lang}/"
        item["url_path"] = path
        item["abs_url"]  = urljoin(SITE_URL, path.lstrip("/"))

        # Head/meta
        title = item.get("seo_title") or item.get("title") or ""
        descr = item.get("meta_description") or ""
        head = {
            "title": title,
            "description": descr,
            "canonical": item["abs_url"],
            "og_title": title,
            "og_description": descr,
            "og_image": urljoin(SITE_URL, f"static/img/{item.get('lcp_image') or 'og-default.webp'}"),
            "jsonld": build_jsonld(item)
        }
        item["head"] = head
        out.append(item)
    return out

def build_jsonld(page):
    # Organization (Company)
    # Wczytamy company z pliku CMS w renderze (tam podamy w template),
    # tutaj ograniczamy się do BreadcrumbList dla strony.
    crumbs = []
    # Silos oparty o parentSlug -> hub/pillar; na start uproszczamy:
    pos = 1
    crumbs.append({"@type":"ListItem","position":pos,"name":"Home","item": SITE_URL + "/"+(page.get("lang") or "pl")+"/"})
    pos += 1
    if page.get("parentSlug"):
        crumbs.append({"@type":"ListItem","position":pos,"name":page.get("parentSlug"),"item": SITE_URL + "/"+(page.get("lang") or "pl")+"/"+page.get("parentSlug").strip("/")+"/"})
        pos += 1
    crumbs.append({"@type":"ListItem","position":pos,"name": page.get("h1") or page.get("title") or "" ,"item": urljoin(SITE_URL, page.get("url_path","/"))})
    return [{
        "@context":"https://schema.org",
        "@type":"BreadcrumbList",
        "itemListElement": crumbs
    }]

def render_pages(pages, company):
    env = env_jinja()
    tpl = env.get_template("page.html")
    for p in pages:
        out_dir = DIST / p["url_path"].lstrip("/")
        out_dir.mkdir(parents=True, exist_ok=True)
        html = tpl.render(page=p, head=p["head"], company=company, site_url=SITE_URL, related=[])
        (out_dir / "index.html").write_text(html, "utf-8")

def write_sitemap(pages):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    urls = []
    for p in pages:
        urls.append(f"<url><loc>{p['abs_url']}</loc><lastmod>{now}</lastmod></url>")
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(sorted(urls)) + "\n</urlset>\n"
    )
    (DIST / "sitemap.xml").write_text(xml, "utf-8")

def main():
    if not CMS.exists():
        raise SystemExit("cms.json not found")
    data = json.loads(CMS.read_text("utf-8"))
    pages_raw = data.get("pages", [])
    company = data.get("company", [])

    clean()
    copy_static()
    keep_cms_json()
    write_cname()
    write_robots()

    pages = normalize_pages(pages_raw)
    render_pages(pages, company)
    write_sitemap(pages)

if __name__ == "__main__":
    main()
