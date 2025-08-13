#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Buduje statyczną stronę z danych z Google Sheets (cms.json).
- generuje HTML wg templates/page.html
- tworzy sitemap.xml, robots.txt, CNAME
- dołącza JSON-LD: Organization, BreadcrumbList, FAQPage (jeśli jest)
- tworzy ZIP do pobrania: /download/site.zip
"""
import json, os, shutil, time, pathlib, re
from datetime import datetime
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA = ROOT / "data" / "cms.json"
SITE_URL = os.environ.get("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = "pl"

def clean():
    shutil.rmtree(DIST, ignore_errors=True)
    (DIST / "download").mkdir(parents=True, exist_ok=True)

def copy_static():
    # Kopiujemy assets/ i static/ oraz pliki w root (index.html, CNAME jeśli są)
    for name in ("assets", "static"):
        src = ROOT / name
        if src.exists():
            shutil.copytree(src, DIST / name, dirs_exist_ok=True)
    for fname in ("index.html", "CNAME"):
        p = ROOT / fname
        if p.exists():
            shutil.copy2(p, DIST / fname)

def read_cms():
    if not DATA.exists():
        raise SystemExit("Brak data/cms.json (krok 'Fetch CMS JSON' w Actions).")
    return json.loads(DATA.read_text("utf-8"))

def env():
    return Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

def path_for(page):
    lang = (page.get("lang") or DEFAULT_LANG).strip("/")
    if (page.get("type") or "").lower() == "home":
        return f"/{lang}/"
    slug = (page.get("slug") or "").strip("/")
    if not slug:
        return f"/{lang}/"
    return f"/{lang}/{slug}/"

def map_company_keys(org):
    """Dopasowanie nazw kolumn z Company do oczekiwanych kluczy."""
    if not org: return {}
    o = dict(org)
    # Mapowanie social
    for src, dst in (("same_as_facebook","facebook"),
                     ("same_as_linkedin","linkedin"),
                     ("same_as_instagram","instagram")):
        if src in o and o.get(src): o[dst] = o[src]
    # NIP
    if "nip" not in o and o.get("vat_id"):
        o["nip"] = o["vat_id"]
    # Logo
    if "logo_url" in o and o["logo_url"]:
        o["logo"] = o["logo_url"]
    # Telefon
    tel = (o.get("telephone") or o.get("phone") or "").replace(" ","")
    if tel and not tel.startswith("+"):
        o["telephone"] = "+48" + tel
    else:
        o["telephone"] = tel
    return o

def build_head(pages_all, page, company, faq):
    org = map_company_keys(company[0] if company else {})
    # --- meta ---
    title = page.get("seo_title") or page.get("title") or page.get("h1") or "Kras-Trans"
    desc = page.get("meta_description") or page.get("lead") or ""
    desc = (desc or "").strip()
    if len(desc) > 160:
        desc = desc[:157].rstrip() + "…"
    url_path = path_for(page)
    canonical = f"{SITE_URL}{url_path}"
    og_image = f"{SITE_URL}/static/img/{page.get('og_image') or page.get('hero_image') or 'hero.svg'}"

    # --- hreflang: grupujemy po slugKey ---
    group_key = page.get("slugKey") or page.get("id")
    alts = []
    if group_key:
        for other in pages_all:
            if (other.get("slugKey") or other.get("id")) == group_key:
                alts.append({
                    "lang": (other.get("lang") or DEFAULT_LANG).lower(),
                    "url": f"{SITE_URL}{path_for(other)}"
                })
    # Usuń duplikaty i self
    seen = set(); hreflangs = []
    for a in alts:
        key = (a["lang"], a["url"])
        if key in seen or a["lang"] == (page.get("lang") or DEFAULT_LANG).lower(): 
            continue
        seen.add(key); hreflangs.append(a)
    x_default = f"{SITE_URL}{path_for(page)}"
    # Jeżeli są inne języki, x-default daj na domyślny lang
    if hreflangs:
        # znajdź alt z DEFAULT_LANG
        for a in hreflangs:
            if a["lang"] == DEFAULT_LANG:
                x_default = a["url"]
                break

    # --- BreadcrumbList ---
    by_slug = { (pg.get("slug") or "").strip("/"): pg for pg in pages_all }
    crumbs = []
    cur = page
    safety = 0
    while cur and safety < 10:
        safety += 1
        name = cur.get("title") or cur.get("h1") or cur.get("slug") or ""
        crumbs.append({
            "@type":"ListItem",
            "position": len(crumbs)+1,
            "name": name,
            "item": f"{SITE_URL}{path_for(cur)}"
        })
        parent_slug = (cur.get("parentSlug") or "").strip("/")
        if not parent_slug: break
        cur = by_slug.get(parent_slug)
    crumbs = list(reversed(crumbs))
    breadcrumb_ld = {
        "@context":"https://schema.org",
        "@type":"BreadcrumbList",
        "itemListElement": crumbs
    }

    # --- Organization ---
    organization_ld = {
        "@context":"https://schema.org",
        "@type":["Organization","LocalBusiness"],
        "name": org.get("name") or "Kras-Trans",
        "legalName": org.get("legal_name") or org.get("name") or "Kras-Trans",
        "url": SITE_URL + "/",
        "email": org.get("email"),
        "telephone": org.get("telephone"),
        "taxID": org.get("nip"),
    }
    if org.get("logo"):
        organization_ld["logo"] = org["logo"]
    # Adres
    addr = {}
    for k_src, k_dst in (("street_address","streetAddress"),
                         ("postal_code","postalCode"),
                         ("address_locality","addressLocality"),
                         ("address_region","addressRegion"),
                         ("address_country","addressCountry")):
        v = org.get(k_src) or org.get(k_src.replace("_"," "))
        if v: addr[k_dst] = v
    if addr:
        organization_ld["address"] = {"@type":"PostalAddress", **addr}
    # sameAs
    same_as = []
    for k in ("facebook","linkedin","instagram"):
        v = org.get(k)
        if v: same_as.append(v)
    if same_as: organization_ld["sameAs"] = same_as
    # openingHours / areaServed opcjonalnie
    if org.get("opening_hours"):
        organization_ld["openingHours"] = org["opening_hours"]
    if org.get("area_served"):
        organization_ld["areaServed"] = org["area_served"]

    # --- FAQPage ---
    faq_items = []
    page_keys = { (page.get("slug") or "").strip("/"), page.get("slugKey"), page.get("id") }
    for f in faq:
        ref = (f.get("page_id") or f.get("page_ref") or f.get("page")) or ""
        if ref in page_keys:
            q = (f.get("q") or "").strip()
            a = (f.get("a") or "").strip()
            if q and a:
                faq_items.append({
                    "@type":"Question",
                    "name": q,
                    "acceptedAnswer": {"@type":"Answer", "text": a}
                })
    jsonld = [organization_ld, breadcrumb_ld]
    if faq_items:
        jsonld.append({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faq_items})

    head = {
        "title": title,
        "description": desc,
        "canonical": canonical,
        "og_title": title,
        "og_description": desc,
        "og_image": og_image,
        "hreflangs": hreflangs,
        "x_default": x_default,
        "jsonld": jsonld,
    }
    return head

def compute_related(pages_all, page, kmin=3, kmax=6):
    # Najpierw ręczne override
    rel = []
    override = [s.strip() for s in (page.get("related_override") or []) if s]
    by_slug = { (pg.get("slug") or "").strip("/"): pg for pg in pages_all }
    for slug in override:
        pg = by_slug.get(slug.strip("/"))
        if pg and pg != page: rel.append(pg)
    if len(rel) >= kmax: 
        return rel[:kmax]

    # Tag-based / rodzeństwo w tym samym parentSlug
    tags = set([t.lower() for t in page.get("tags") or []])
    for pg in pages_all:
        if pg == page: continue
        if (pg.get("parentSlug") or "") == (page.get("parentSlug") or ""):
            rel.append(pg); continue
        # wspólne tagi
        t2 = set([t.lower() for t in pg.get("tags") or []])
        if tags and (tags & t2):
            rel.append(pg)
    # Unikalność i limit
    seen = set(); uniq = []
    for pg in rel:
        key = pg.get("id") or pg.get("slug")
        if key in seen: continue
        seen.add(key); uniq.append(pg)
        if len(uniq) >= kmax: break
    return uniq

def render_pages(env, data):
    pages = data.get("pages", [])
    company = data.get("company", [])
    faq = data.get("faq", [])

    # domyślne obrazy
    for p in pages:
        p.setdefault("hero_image", "hero.svg")
        p.setdefault("lcp_image", p["hero_image"])

    template = env.get_template("page.html")

    built = 0
    for p in pages:
        if str(p.get("publish")).lower() in ("false","0","no"): 
            continue
        url_path = path_for(p)
        out_dir = DIST / url_path.strip("/")
        out_dir.mkdir(parents=True, exist_ok=True)
        head = build_head(pages, p, company, faq)
        related = [ 
            {"title": r.get("title") or r.get("h1") or "", "url": path_for(r)} 
            for r in compute_related(pages, p)
        ]
        html = template.render(page=p, head=head, company=company, related=related, site_url=SITE_URL)
        (out_dir / "index.html").write_text(html, "utf-8")
        built += 1

    # Root index -> przekierowanie do /pl/
    root_index = """<!doctype html><meta http-equiv="refresh" content="0; url=/pl/"><link rel="canonical" href="/pl/">"""
    (DIST / "index.html").write_text(root_index, "utf-8")

    return built

def write_sitemap(pages):
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    urls = []
    for p in pages:
        if str(p.get("publish")).lower() in ("false","0","no"): continue
        urls.append(f"{SITE_URL}{path_for(p)}")
    items = "\n".join(f"<url><loc>{u}</loc><lastmod>{now}</lastmod></url>" for u in sorted(set(urls)))
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}\n</urlset>\n'
    (DIST / "sitemap.xml").write_text(xml, "utf-8")

def write_robots():
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", "utf-8")

def write_cname():
    src = ROOT / "CNAME"
    if src.exists():
        shutil.copy2(src, DIST / "CNAME")
    else:
        (DIST / "CNAME").write_text("kras-trans.com\n", "utf-8")

def zip_site():
    zip_path = DIST / "download" / "site.zip"
    import zipfile, os
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(DIST):
            for f in files:
                if f == "site.zip": continue
                p = pathlib.Path(root) / f
                z.write(p, p.relative_to(DIST))
    return zip_path

def main():
    clean()
    copy_static()
    data = read_cms()
    env_jinja = env()
    built = render_pages(env_jinja, data)
    write_sitemap(data.get("pages", []))
    write_robots()
    write_cname()
    zip_site()
    print(f"Built {built} pages -> dist")

if __name__ == "__main__":
    main()
