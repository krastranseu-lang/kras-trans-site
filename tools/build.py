#!/usr/bin/env python3
import json, os, shutil, time, zipfile
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown import markdown

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA = ROOT / "data" / "cms.json"
SITE_URL = os.environ.get("SITE_URL", "https://kras-trans.com").rstrip("/")

def clean():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def copy_static():
    for folder in ("static", "assets"):
        src = ROOT / folder
        if src.exists():
            shutil.copytree(src, DIST / folder, dirs_exist_ok=True)

def write_index_redirect(lang="pl"):
    (DIST / "index.html").write_text(
        f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/{lang}/">',
        "utf-8",
    )

def write_robots():
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", "utf-8"
    )

def write_cname():
    cname = ROOT / "CNAME"
    if cname.exists():
        (DIST / "CNAME").write_text(cname.read_text("utf-8"), "utf-8")

def load_json():
    if not DATA.exists():
        raise SystemExit("cms.json not found (did Fetch CMS JSON run?)")
    with open(DATA, "r", encoding="utf-8") as f:
        return json.load(f)

def normalize_url(pg):
    lang = (pg.get("lang") or "pl").strip("/")
    slug = (pg.get("slug") or "").strip("/")
    if pg.get("type") == "home" or slug == "":
        return f"/{lang}/"
    return f"/{lang}/{slug}/"

def company_ld(company):
    if not company:
        return None
    c = company[0]
    same = []
    for k in (
        "same_as_facebook",
        "same_as_linkedin",
        "same_as_instagram",
        "same_as_x",
        "same_as_tiktok",
        "same_as_youtube",
    ):
        u = (c.get(k) or "").strip()
        if u:
            same.append(u)
    ld = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "url": SITE_URL,
        "name": c.get("name") or c.get("legal_name") or "Kras-Trans",
        "email": c.get("email", ""),
        "telephone": c.get("telephone", ""),
        "logo": c.get("logo_url", ""),
        "taxID": (c.get("nip") or "").replace(" ", ""),
        "address": {
            "@type": "PostalAddress",
            "streetAddress": c.get("street_address", ""),
            "postalCode": c.get("postal_code", ""),
            "addressLocality": c.get("address_locality", c.get("city", "")),
            "addressRegion": c.get("address_region", ""),
            "addressCountry": c.get("address_country", c.get("country", "PL")),
        },
    }
    if same:
        ld["sameAs"] = same
    return ld

def make_hreflangs(pages, cur):
    # group by slugKey
    key = cur.get("slugKey") or ""
    if not key:
        return [], None
    variants = [p for p in pages if (p.get("slugKey") or "") == key]
    items = []
    x_default = None
    for v in variants:
        url = SITE_URL + normalize_url(v)
        lang = (v.get("lang") or "pl").lower()
        items.append({"lang": lang, "url": url})
        if lang == "pl":  # domyślnie PL jako x-default (zmień, jeśli inny)
            x_default = url
    # usuń SELF
    cur_lang = (cur.get("lang") or "pl").lower()
    items = [i for i in items if i["lang"] != cur_lang]
    return items, x_default

def breadcrumbs(pages_by_slug, pg):
    trail = []
    guard = 0
    cur = pg
    while cur and cur.get("parentSlug") and guard < 10:
        parent = pages_by_slug.get(cur["parentSlug"])
        if not parent or parent.get("slug") == cur.get("slug"):
            break
        trail.append(
            {"title": parent.get("h1") or parent.get("title"), "url": SITE_URL + normalize_url(parent)}
        )
        cur = parent
        guard += 1
    return list(reversed(trail))

def related(pages_by_parent, pg):
    sibs = [p for p in pages_by_parent.get(pg.get("parentSlug"), []) if p is not pg]
    # ogranicz do 6
    return sibs[:6]

def faq_for_page(faq_all, pg):
    slugs = set(
        s for s in [pg.get("slug"), pg.get("slugKey"), pg.get("id")] if s
    )
    out = []
    for f in faq_all:
        ref = (f.get("page_ref") or "").strip()
        if ref in slugs:
            out.append({"q": f.get("q"), "a": f.get("a")})
    return out

def write_sitemap(pages):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    urls = []
    for pg in pages:
        if pg.get("publish") is False:
            continue
        urls.append(SITE_URL + normalize_url(pg))
    items = "\n".join(
        f"<url><loc>{u}</loc><lastmod>{now}</lastmod></url>" for u in sorted(set(urls))
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{items}\n</urlset>\n"
    )
    (DIST / "sitemap.xml").write_text(xml, "utf-8")

def zip_site():
    zpath = ROOT / "download" / "site.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(DIST))
    return zpath

def main():
    clean()
    copy_static()
    write_index_redirect("pl")
    write_robots()
    write_cname()

    j = load_json()
    pages = j.get("pages", [])
    faq = j.get("faq", [])
    company = j.get("company", [])
    org_ld = company_ld(company)
    pages_by_slug = {p.get("slug"): p for p in pages if p.get("slug")}
    pages_by_parent = {}
    for p in pages:
        pages_by_parent.setdefault(p.get("parentSlug"), []).append(p)

    env = Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    tpl = env.get_template("page.html")

    built = 0
    for pg in pages:
        if pg.get("publish") is False:
            continue

        url_path = normalize_url(pg).strip("/")
        out_dir = DIST / url_path
        out_dir.mkdir(parents=True, exist_ok=True)

        # Head meta
        canonical = SITE_URL + normalize_url(pg)
        hreflangs, xdef = make_hreflangs(pages, pg)
        og_image = pg.get("og_image") or (SITE_URL + "/static/img/hero.svg")

        # body html (markdown -> html)
        body_md = pg.get("body_md") or ""
        body_html = markdown(body_md, extensions=["extra"]) if body_md else ""

        # breadcrumbs & related
        crumbs = breadcrumbs(pages_by_slug, pg)
        rel = related(pages_by_parent, pg)

        # FAQ (optional)
        faq_items = faq_for_page(faq, pg)
        faq_ld = None
        if faq_items:
            faq_ld = {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {"@type": "Question", "name": qa["q"], "acceptedAnswer": {"@type": "Answer", "text": qa["a"]}}
                    for qa in faq_items
                ],
            }

        # JSON-LD list
        json_ld = []
        if org_ld:
            json_ld.append(org_ld)
        if faq_ld:
            json_ld.append(faq_ld)

        head = {
            "title": pg.get("seo_title") or pg.get("title") or "",
            "description": pg.get("meta_description") or "",
            "canonical": canonical,
            "hreflangs": hreflangs,
            "x_default": xdef,
            "og_title": pg.get("seo_title") or pg.get("title") or "",
            "og_description": pg.get("meta_description") or "",
            "og_image": og_image,
            "jsonld": json_ld,
        }

        html = tpl.render(
            site_url=SITE_URL,
            page=pg,
            head=head,
            breadcrumbs=crumbs,
            related=rel,
            body_html=body_html,
        )

        (out_dir / "index.html").write_text(html, "utf-8")
        built += 1

    write_sitemap(pages)
    z = zip_site()
    (DIST / "download").mkdir(parents=True, exist_ok=True)
    shutil.copy2(z, DIST / "download" / "site.zip")
    print(f"Built {built} pages -> {DIST}")
    print(f"Snapshot: {z}")

if __name__ == "__main__":
    main()
