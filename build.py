import os, re, json, datetime, pathlib, requests
from jinja2 import Environment, FileSystemLoader, select_autoescape
from slugify import slugify

SITE_URL = os.getenv("SITE_URL", "https://krastranseu-lang.github.io/kras-trans-site").rstrip("/")
API_URL = os.getenv("SHEETS_JSON_URL")
API_KEY = os.getenv("SHEETS_API_KEY")
OUT = pathlib.Path("public")

def fetch_data():
    assert API_URL and API_KEY, "Missing SHEETS_JSON_URL or SHEETS_API_KEY"
    url = f"{API_URL}?key={API_KEY}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

def words(t): return set(re.findall(r"[a-z0-9ąćęłńóśżź\-]+", (t or "").lower()))
def similarity(a, b):
    sa, sb = set(a.get("tags", [])), set(b.get("tags", []))
    j = len(sa & sb) / (len(sa | sb) or 1)
    bonus = len(words(a.get("title")) & words(b.get("title"))) / (len(words(a.get("title"))) or 1) * 0.2
    return j + bonus

def compute_related(pages):
    by_slug = {p["slug"]: p for p in pages}
    for p in pages:
        overrides = set(p.get("related_override", []) or [])
        others = [q for q in pages if q["slug"] != p["slug"]]
        scored = sorted(others, key=lambda q: similarity(p, q), reverse=True)
        kmin = int(p.get("min_outlinks", 3) or 3)
        kmax = int(p.get("max_outlinks", 6) or 6)
        chosen = [q["slug"] for q in scored[:kmax]]
        chosen = list(overrides) + [s for s in chosen if s not in overrides]
        p["related"] = chosen[:kmax]
        if len(p["related"]) < kmin and len(scored) >= kmin:
            p["related"] = [q["slug"] for q in scored[:kmin]]
    for p in pages:
        for r in list(p.get("related", [])):
            if p["slug"] not in by_slug[r].get("related", []):
                by_slug[r].setdefault("related", []).append(p["slug"])
    return pages

def jsonld_localbusiness(company):
    if not company: return {}
    c = company[0]
    lb = {
        "@context":"https://schema.org",
        "@type":["Organization","LocalBusiness"],
        "name": c.get("name") or "Kras-Trans",
        "url": SITE_URL + "/",
        "telephone": c.get("telephone"),
        "email": c.get("email"),
        "address": {"@type":"PostalAddress",
            "streetAddress": c.get("street_address"),
            "addressLocality": c.get("city"),
            "addressRegion": c.get("region"),
            "postalCode": c.get("postal_code"),
            "addressCountry": c.get("country","PL")}
    }
    if c.get("logo"): lb["logo"] = SITE_URL + "/static/img/" + c["logo"]
    same = [c.get("same_as_facebook"), c.get("same_as_linkedin"), c.get("same_as_instagram")]
    lb["sameAs"] = [s for s in same if s]
    if c.get("opening_hours"): lb["openingHours"] = [c["opening_hours"]]
    if c.get("area_served"):
        lb["areaServed"] = [s.strip() for s in str(c["area_served"]).split(",") if s.strip()]
    return lb

def faq_for_slug(faq, slug):
    items = [f for f in faq if str(f.get("slug")) == slug]
    if not items: return None
    return {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":i.get("question"),"acceptedAnswer":{"@type":"Answer","text":i.get("answer")}}
        for i in sorted(items, key=lambda x: int(x.get("rank") or 0))
    ]}

def breadcrumb_for_slug(pages, slug):
    lookup = {p["slug"]: p for p in pages}
    me = lookup.get(slug)
    if not me: return None
    chain = []
    parent = me.get("breadcrumbs_parent")
    if parent and parent in lookup: chain.append(lookup[parent])
    chain.append(me)
    return {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":i+1,"name":p["title"],"item": SITE_URL + "/" + (p["slug"] + "/" if p["slug"] else "")}
        for i,p in enumerate(chain)
    ]}

def service_schema(page, company):
    if not page: return None
    return {"@context":"https://schema.org","@type":"Service",
            "name": page.get("title"),
            "areaServed": page.get("service_area") or (company[0].get("area_served") if company else None),
            "provider": {"@type":"Organization","name": company[0].get("name","Kras-Trans")} if company else None}

def ensure_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def main():
    data = fetch_data()
    pages = data.get("pages", [])
    faq = data.get("faq", [])
    company = data.get("company", [])
    redirects = data.get("redirects", [])

    for p in pages:
        p["slug"] = p.get("slug") or slugify(p.get("title","page"))
        p["url"] = f"/{p['slug']}/" if p["slug"] else "/"
        p["title"] = p.get("title") or p.get("h1") or "Kras-Trans — Transport ekspresowy"
        p["meta_title"] = p.get("meta_title") or p["title"]
        p["meta_description"] = p.get("meta_description") or (p.get("lead") or "")[:160]
        p["og_title"] = p.get("og_title") or p["meta_title"]
        p["og_description"] = p.get("og_description") or p["meta_description"]
        p["hero_image"] = p.get("hero_image") or "placeholder-hero-desktop.webp"
        p["hero_image_mobile"] = p.get("hero_image_mobile") or p["hero_image"]
        p["lcp_image"] = p.get("lcp_image") or p["hero_image"]
        p["html"] = p.get("body_md") or ""
    pages = compute_related(pages)

    env = Environment(loader=FileSystemLoader("templates"), autoescape=select_autoescape(['html']))
    env.filters["tojson"] = lambda obj: json.dumps(obj, ensure_ascii=False)
    page_tpl = env.get_template("page.html")

    OUT.mkdir(parents=True, exist_ok=True)

    for p in pages:
        rel = [q for q in pages if q["slug"] in (p.get("related") or [])]
        faq_ld = faq_for_slug(faq, p["slug"])
        bc_ld  = breadcrumb_for_slug(pages, p["slug"])
        svc_ld = service_schema(p, company)
        ld = [jsonld_localbusiness(company)]
        if svc_ld: ld.append(svc_ld)
        if faq_ld: ld.append(faq_ld)
        if bc_ld:  ld.append(bc_ld)
        head = {
            "title": p["meta_title"],
            "description": p["meta_description"],
            "canonical": p.get("canonical") or (SITE_URL + p["url"]),
            "og_title": p.get("og_title") or p["meta_title"],
            "og_description": p.get("og_description") or p["meta_description"],
            "og_image": SITE_URL + "/static/img/" + (p.get("og_image") or p["hero_image"]),
            "jsonld": [x for x in ld if x]
        }
        html = page_tpl.render(page=p, pages=pages, related=rel, company=company, head=head, site_url=SITE_URL)
        ensure_file(OUT / p["slug"] / "index.html", html)

    # Strona główna
    home = {"slug":"", "url":"/", "title":"Kras-Trans — Ekspresowy transport 24/7",
            "h1":"Ekspresowy transport 24/7 — Polska & UE",
            "lead":"Busy do 3,5 t i TIR. Rodzinna firma z Łodzi. Zadzwoń: +48 793 927 467",
            "hero_image":"placeholder-hero-desktop.webp", "hero_image_mobile":"placeholder-hero-desktop.webp", "html":""}
    head = {"title": home["title"], "description":"Transport ekspresowy i dedykowany — Polska & Europa.",
            "canonical": SITE_URL + "/", "og_title": home["title"],
            "og_description":"Transport ekspresowy i dedykowany — 24/7.",
            "og_image": SITE_URL + "/static/img/placeholder-hero-desktop.webp",
            "jsonld":[ jsonld_localbusiness(company) ]}
    ensure_file(OUT/"index.html", page_tpl.render(page=home, pages=pages, related=[], company=company, head=head, site_url=SITE_URL))

    # sitemap + robots
    today = datetime.date.today().isoformat()
    sm = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', f'<url><loc>{SITE_URL}/</loc><lastmod>{today}</lastmod></url>']
    for p in pages: sm.append(f'<url><loc>{SITE_URL}{p["url"]}</loc><lastmod>{today}</lastmod></url>')
    sm.append('</urlset>')
    (OUT/"sitemap.xml").write_text("\n".join(sm), encoding="utf-8")
    (OUT/"robots.txt").write_text(f"Sitemap: {SITE_URL}/sitemap.xml\nUser-agent: *\nAllow: /", encoding="utf-8")

    # Redirects (HTML meta refresh dla GH Pages)
    for r in redirects:
        frm = str(r.get("from_path","")).strip().strip("/")
        to  = str(r.get("to_url","")).strip()
        if not frm or not to: continue
        html = f'<!doctype html><meta http-equiv="refresh" content="0; url={to}"><link rel="canonical" href="{to}">'
        (OUT/frm/"index.html").parent.mkdir(parents=True, exist_ok=True)
        (OUT/frm/"index.html").write_text(html, encoding="utf-8")

    print("Built", len(pages), "pages ->", OUT)

if __name__ == "__main__":
    main()
