#!/usr/bin/env python3
import json, os, shutil, time, pathlib, zipfile
from urllib.parse import quote
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CMS  = ROOT / "data" / "cms.json"
SITE_URL = "https://kras-trans.com"   # baza do canonical/og

def clean():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def copy_static():
    for name in ("static", "assets", "index.html", "CNAME"):
        p = ROOT / name
        if p.exists():
            if p.is_dir():
                shutil.copytree(p, DIST / name, dirs_exist_ok=True)
            else:
                shutil.copy2(p, DIST / p.name)

def keep_cms_json():
    dst = DIST / "data"
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CMS, dst / "cms.json")

def write_robots():
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n",
        "utf-8"
    )

def path_for(page):
    lang = (page.get("lang") or "pl").strip("/")
    slug = (page.get("slug") or "").strip("/")
    if (page.get("type") or "").lower() == "home":
        return f"/{lang}/"
    return f"/{lang}/{slug}/" if slug else f"/{lang}/"

def sitemap(pages):
    urls = []
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for p in pages:
        if p.get("publish") is False: 
            continue
        urls.append(SITE_URL.rstrip("/") + path_for(p))
    items = "\n".join(f"<url><loc>{u}</loc><lastmod>{now}</lastmod></url>" for u in sorted(set(urls)))
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' \
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' \
          f"{items}\n</urlset>\n"
    (DIST / "sitemap.xml").write_text(xml, "utf-8")

def zip_site():
    outdir = DIST / "download"
    outdir.mkdir(parents=True, exist_ok=True)
    zpath = outdir / "site.zip"
    if zpath.exists():
        zpath.unlink()
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in DIST.rglob("*"):
            if p.is_file():
                arc = p.relative_to(DIST)
                # nie pakuj samego ZIPa do ZIPa
                if str(arc).startswith("download/site.zip"):
                    continue
                zf.write(p, arcname=str(arc))

def make_env():
    env = Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html"])
    )
    # prosty filtr tojson (Jinja ma go w niektórych integracjach, tutaj dodajemy jawnie)
    env.filters["tojson"] = lambda v: json.dumps(v, ensure_ascii=False)
    return env

def build_head(env, page, company, siblings_by_lang, hreflang_map):
    url_path = path_for(page)
    canonical = SITE_URL.rstrip("/") + url_path
    title = page.get("seo_title") or page.get("title") or page.get("h1") or "Kras-Trans"
    desc = page.get("meta_description") or page.get("lead") or "Ekspresowy transport 3,5t – Europa."
    og_image = SITE_URL + "/static/img/placeholder-hero-desktop.webp"

    # hreflang – z mapy stron o tym samym slugKey
    hreflangs = []
    x_default = None
    group = hreflang_map.get(page.get("slugKey") or "")
    if group:
        for lang, p in group.items():
            hreflangs.append({"lang": lang, "url": SITE_URL.rstrip("/") + path_for(p)})
        # x-default: domyślnie PL
        if "pl" in group:
            x_default = SITE_URL.rstrip("/") + path_for(group["pl"])

    # Organization JSON-LD (E‑E‑A‑T)
    org = (company[0] if company else {})
    same_as = []
    for k in ("instagram","linkedin","facebook"):
        u = (org.get(k) or "").strip()
        if u: same_as.append(u)
    organization_ld = {
        "@context":"https://schema.org",
        "@type":"Organization",
        "name": org.get("name") or "Kras-Trans",
        "legalName": org.get("legal_name") or org.get("name") or "Kras-Trans",
        "url": SITE_URL,
        "email": org.get("email") or "contact@kras-trans.eu",
        "telephone": org.get("telephone") or "+48793927467",
        "taxID": org.get("nip") or "726 266 23 03",
        "address": {
          "@type":"PostalAddress",
          "streetAddress": org.get("street_address") or "Trzcinowa 14/11",
          "postalCode": org.get("postal_code") or "91-495",
          "addressLocality": org.get("city") or "Łódź",
          "addressCountry": org.get("country") or "PL"
        },
        "sameAs": same_as
    }

    # Breadcrumbs
    crumbs = []
    p = page
    while p:
        crumbs.append({
          "name": p.get("h1") or p.get("title") or p.get("slug"),
          "item": SITE_URL.rstrip("/") + path_for(p)
        })
        parent_slug = p.get("parentSlug")
        if not parent_slug:
            break
        # znajdź rodzica w tym samym języku
        p = siblings_by_lang.get(p.get("lang","pl"), {}).get(parent_slug)
    crumbs = list(reversed(crumbs))
    breadcrumb_ld = {
      "@context":"https://schema.org",
      "@type":"BreadcrumbList",
      "itemListElement":[
        {"@type":"ListItem","position":i+1,"name":c["name"],"item":c["item"]} for i,c in enumerate(crumbs)
      ]
    }

    return {
        "title": title,
        "description": desc,
        "canonical": canonical,
        "og_title": title,
        "og_description": desc,
        "og_image": og_image,
        "hreflangs": hreflangs,
        "x_default": x_default,
        "jsonld": [organization_ld, breadcrumb_ld],
    }

def main():
    if not CMS.exists():
        raise SystemExit("data/cms.json not found (fetch failed)")

    data = json.loads(CMS.read_text("utf-8"))
    pages = data.get("pages", [])
    company = data.get("company", [])
    # indexy pomocnicze
    by_lang_slug = {}
    by_slugkey_lang = {}
    for p in pages:
        lang = (p.get("lang") or "pl").lower()
        by_lang_slug.setdefault(lang, {})[ (p.get("slug") or "").strip("/") ] = p
        sk = p.get("slugKey") or ""
        by_slugkey_lang.setdefault(sk, {})[lang] = p

    env = make_env()
    tpl = env.get_template("page.html")

    clean()
    copy_static()
    keep_cms_json()

    # buduj strony
    for p in pages:
        if p.get("publish") is False:
            continue
        head = build_head(env, p, company, by_lang_slug, by_slugkey_lang)
        ctx = {
            "page": p,
            "site_url": SITE_URL.rstrip("/"),
            "head": head,
            "company": company
        }
        html = tpl.render(**ctx)

        # zapis
        out = DIST / path_for(p).lstrip("/") / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, "utf-8")

    # sitemap / robots / zip
    sitemap(pages)
    write_robots()
    zip_site()

if __name__ == "__main__":
    main()
