#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans | FULL Static Site Builder (MAX)
Źródło: data/cms.json (Apps Script)
Wynik:  dist/
Wymaga: jinja2, markdown, beautifulsoup4, lxml, python-slugify, requests
"""

import os, sys, json, shutil, csv, zipfile, re, datetime, hashlib
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
from urllib.parse import urljoin

import markdown as md
from jinja2 import Environment, FileSystemLoader, select_autoescape
from bs4 import BeautifulSoup
from slugify import slugify

# ==============================
# ENV / ŚCIEŻKI
# ==============================
ROOT        = Path(__file__).resolve().parent.parent
DIST        = ROOT / "dist"
DATA_FILE   = ROOT / "data" / "cms.json"
TEMPLATES   = ROOT / "templates"
STATIC_DIR  = ROOT / "static"
ASSETS_DIR  = ROOT / "assets"

SITE_URL       = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG   = os.getenv("DEFAULT_LANG", "pl").lower()
BRAND          = os.getenv("BRAND", "Kras-Trans")
GA_ID          = os.getenv("GA_ID", "")  # GA4
GSC_VERIF      = os.getenv("GSC_VERIFICATION", "")
CNAME_VALUE    = os.getenv("CNAME", "kras-trans.com")

# ==============================
# UTIL
# ==============================
def now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat()+"Z"

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True);  return p

def read_json(p: Path) -> Dict[str, Any]:
    if not p.exists():
        sys.exit(f"[FATAL] Brak pliku {p}")
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def write_text(p: Path, s: str):
    ensure_dir(p.parent);  p.write_text(s, "utf-8")

def copy_tree(src: Path, dst: Path):
    if not src.exists(): return
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(src, dst)

def md_to_html(text: str) -> str:
    if not text: return ""
    return md.markdown(
        text,
        extensions=["extra","sane_lists","tables","smarty","toc","admonition",
                    "abbr","attr_list","def_list","fenced_code"],
        output_format="html5"
    )

def strip_html(html: str) -> str:
    return BeautifulSoup(html or "", "lxml").get_text(" ", strip=True)

def words_count(html: str) -> int:
    return len(re.findall(r"\w+", strip_html(html), re.UNICODE))

def norm_lang(v: str) -> str:
    return (v or DEFAULT_LANG).lower().strip()

def norm_slug(v: str) -> str:
    v = (v or "").strip().strip("/")
    return slugify(v, lowercase=True, separator="-")

def parse_csv(v) -> List[str]:
    if not v: return []
    return [x.strip() for x in str(v).split(",") if x.strip()]

def as_bool(v) -> bool:
    if isinstance(v, bool): return v
    return str(v).strip().lower() in ("1","true","yes","y")

def join_url(*parts) -> str:
    u = SITE_URL + "/"
    for part in parts:
        part = str(part).strip("/")
        if part:
            u = urljoin(u, part + "/")
    return u.rstrip("/")

# ==============================
# JINJA
# ==============================
env = Environment(
    loader=FileSystemLoader(str(TEMPLATES)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True, lstrip_blocks=True
)
env.filters["tojson"] = lambda v: json.dumps(v, ensure_ascii=False, separators=(",",":"))

# ==============================
# ŁADOWANIE CMS
# ==============================
def load_cms() -> Dict[str, Any]:
    raw = read_json(DATA_FILE)
    keys = ["pages","faq","media","company","redirects","blocks","nav","templates","strings",
            "routes","places","blog","categories","authors","caseStudies","reviews",
            "locations","jobs","autoLinks"]
    return {k: raw.get(k, []) for k in keys}

# ==============================
# INDEKS / MAPY / QA
# ==============================
class Index:
    def __init__(self, cms: Dict[str,Any]):
        self.warn: List[str] = []
        self.pages: List[Dict[str,Any]] = []
        for p in cms.get("pages", []):
            if p.get("publish","").__class__ is str:
                p["publish"] = as_bool(p.get("publish"))
            if p.get("publish", True):
                self.pages.append(p)

        # slugKey -> {lang -> page}
        self.by_key_lang: Dict[str, Dict[str, Dict[str,Any]]] = {}
        for p in self.pages:
            key = (p.get("slugKey") or p.get("page_ref") or "").strip()
            lang= norm_lang(p.get("lang"))
            if not key:
                key = f"__{lang}:{norm_slug(p.get('slug') or '')}"
            self.by_key_lang.setdefault(key, {})[lang] = p

        self.used_paths=set()

    def warn_if(self, cond: bool, msg: str):
        if cond: self.warn.append(msg)

def build_path(page: Dict[str,Any]) -> str:
    lang = norm_lang(page.get("lang"))
    slug = norm_slug(page.get("slug"))
    typ  = (page.get("type") or "").lower()
    if typ=="home" or page.get("hom") or slug in ("","home"):
        return f"/{lang}/"
    return f"/{lang}/{slug}/"

def canonical(page): return SITE_URL + build_path(page)

def hreflangs(idx: Index, page: Dict[str,Any]) -> Tuple[List[Dict[str,str]], str]:
    key=(page.get("slugKey") or page.get("page_ref") or "").strip()
    if not key: return [], ""
    items=[]; xdef=""
    for lang,p in (idx.by_key_lang.get(key) or {}).items():
        url = SITE_URL + build_path(p)
        items.append({"lang": lang, "url": url})
        if lang == DEFAULT_LANG: xdef = url
    return items, xdef

def breadcrumb_ld(page: Dict[str,Any]) -> Dict[str,Any]:
    items=[]
    items.append({"@type":"ListItem","position":1,"name":BRAND,"item":SITE_URL+"/"})
    lang = norm_lang(page.get("lang"))
    items.append({"@type":"ListItem","position":2,"name":lang.upper(),"item":f"{SITE_URL}/{lang}/"})
    pos=3
    parent = norm_slug(page.get("parentSlug"))
    if parent:
        items.append({"@type":"ListItem","position":pos,"name":parent.replace("-"," ").title(),
                      "item": f"{SITE_URL}/{lang}/{parent}/"}); pos+=1
    items.append({"@type":"ListItem","position":pos,"name":page.get("title") or page.get("h1") or "Strona",
                  "item": SITE_URL + build_path(page)})
    return {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":items}

def org_ld(company: List[Dict[str,Any]]) -> Dict[str,Any]:
    c=(company or [{}])[0]
    name=c.get("name") or c.get("legal_name") or BRAND
    ld={"@context":"https://schema.org","@type":"Organization","name":name,"url":SITE_URL}
    if c.get("email"): ld["email"]=c["email"]
    tel=(c.get("telephone") or c.get("phone") or "").replace(" ","")
    if tel: ld["telephone"]=tel
    if c.get("sameAs"): ld["sameAs"]=parse_csv(c.get("sameAs"))
    logo="/static/img/logo.png";  ld["logo"]=SITE_URL+logo
    return ld

def service_ld(page: Dict[str,Any]) -> Dict[str,Any]:
    return {"@context":"https://schema.org","@type":"Service",
            "name": page.get("h1") or page.get("title") or "",
            "provider":{"@type":"Organization","name":BRAND,"url":SITE_URL},
            "areaServed": parse_csv(page.get("service_languages") or page.get("lang")),
            "url": SITE_URL + build_path(page),
            "description": page.get("description") or page.get("meta_desc") or ""}

def article_ld(page: Dict[str,Any]) -> Dict[str,Any]:
    return {"@context":"https://schema.org","@type":"Article",
            "headline": page.get("h1") or page.get("title") or "",
            "mainEntityOfPage": SITE_URL + build_path(page),
            "publisher":{"@type":"Organization","name":BRAND},
            "datePublished": now_iso(),"dateModified": now_iso(),
            "image": SITE_URL + "/" + (page.get("hero_image") or "static/img/placeholder-hero-desktop.webp")}

def localbusiness_ld(loc: Dict[str,Any]) -> Dict[str,Any]:
    return {"@context":"https://schema.org","@type":"LocalBusiness",
            "name": loc.get("name") or f"{BRAND} — {loc.get('city','')}",
            "url": SITE_URL + build_path(loc),
            "address":{"@type":"PostalAddress","streetAddress":loc.get("street"),
                       "addressLocality":loc.get("city"),"postalCode":loc.get("zip"),
                       "addressCountry":loc.get("country") or "PL"},
            "telephone": loc.get("phone") or ""}

def job_ld(job: Dict[str,Any]) -> Dict[str,Any]:
    return {"@context":"https://schema.org","@type":"JobPosting",
            "title": job.get("title") or "Oferta pracy",
            "description": strip_html(job.get("body_html") or ""),
            "hiringOrganization":{"@type":"Organization","name":BRAND,"sameAs":SITE_URL},
            "datePosted": now_iso(),
            "employmentType": job.get("type") or "FULL_TIME",
            "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality": job.get("city") or "Łódź",
                                                     "addressCountry":"PL"}},
            "validThrough": job.get("validThrough") or (datetime.date.today()+datetime.timedelta(days=60)).isoformat()}

def review_ld(r: Dict[str,Any]) -> Dict[str,Any]:
    return {"@context":"https://schema.org","@type":"Review",
            "author":{"@type":"Person","name": r.get("author") or "Klient"},
            "reviewBody": r.get("text") or "",
            "datePublished": r.get("date") or now_iso(),
            "reviewRating":{"@type":"Rating","ratingValue": r.get("rating") or "5","bestRating":"5","worstRating":"1"}}

# ==============================
# AUTO-LINKI / POWIĄZANIA
# ==============================
def apply_autolinks(html: str, rules: List[Dict[str,Any]]) -> str:
    if not rules: return html
    soup = BeautifulSoup(html or "", "lxml")
    for rule in rules:
        phrase=(rule.get("phrase") or "").strip()
        url=(rule.get("url") or "").strip()
        if not phrase or not url: continue
        regex=re.compile(rf"(?<!\w)({re.escape(phrase)})", re.IGNORECASE)
        for node in list(soup.find_all(text=True)):
            if not node or not node.parent: continue
            if node.parent.name in ("a","script","style","code","pre"): continue
            new_html = regex.sub(f'<a href="{url}">\\1</a>', str(node))
            if new_html != str(node):
                node.replace_with(BeautifulSoup(new_html, "lxml").string or new_html)
    return str(soup)

def related(idx: Index, cur: Dict[str,Any], limit=6) -> List[Dict[str,Any]]:
    tags=set(parse_csv(cur.get("tags"))); lang=norm_lang(cur.get("lang"))
    scored=[]
    for p in idx.pages:
        if p is cur or norm_lang(p.get("lang"))!=lang: continue
        s=0
        s += 5 * len(tags.intersection(parse_csv(p.get("tags"))))
        if p.get("parentSlug")==cur.get("parentSlug"): s+=2
        if p.get("pillar") and cur.get("pillar"): s+=1
        if s>0: scored.append((s,p))
    scored.sort(key=lambda x:x[0], reverse=True)
    out=[]
    for _,p in scored[:limit]:
        out.append({"title": p.get("title") or p.get("h1") or p.get("seo_title") or "",
                    "url": build_path(p)})
    return out

# ==============================
# HEAD/SEO
# ==============================
def build_head(idx: Index, page: Dict[str,Any], company: List[Dict[str,Any]]) -> Dict[str,Any]:
    title= page.get("seo_title") or page.get("title") or page.get("h1") or BRAND
    desc = page.get("description") or page.get("meta_desc") or \
           (strip_html(page.get("body_html") or "")[:160])
    can  = canonical(page)
    og   = SITE_URL + "/" + (page.get("og_image") or page.get("hero_image") or "static/img/placeholder-hero-desktop.webp")
    hre, xdef = hreflangs(idx, page)
    jsonld=[org_ld(company), breadcrumb_ld(page)]

    # typy
    types=parse_csv(page.get("structured_data_types"))
    if "Service" in types or (page.get("type") or "").lower()=="service":
        jsonld.append(service_ld(page))
    if (page.get("template") or "").lower() in ("blog_post","post"):
        jsonld.append(article_ld(page))

    extra=[]
    if GSC_VERIF: extra.append(f'<meta name="google-site-verification" content="{GSC_VERIF}">')
    if GA_ID:
        extra.append(
            f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>'
            f'<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}'
            f'gtag("js",new Date());gtag("config","{GA_ID}");</script>'
        )

    return {"title":title,"description":desc,"canonical":can,"og_title":title,
            "og_description":desc,"og_image":og,"hreflangs":hre,"x_default":xdef,
            "jsonld":jsonld,"extra_head":"\n".join(extra)}

# ==============================
# RENDER
# ==============================
def pick_template(p: Dict[str,Any]) -> str:
    t=(p.get("template") or "").lower()
    return {
        "blog_post":"blog_post.html",
        "post":"blog_post.html",
        "blog_index":"blog_index.html",
        "blog":"blog_index.html",
        "case_item":"case_item.html",
        "case":"case_item.html",
        "case_index":"case_index.html",
        "cases":"case_index.html",
        "reviews":"reviews.html",
        "opinie":"reviews.html",
        "location":"location.html",
        "place":"location.html",
        "jobs_index":"jobs_index.html",
        "jobs":"jobs_index.html",
        "job_item":"job_item.html",
        "job":"job_item.html",
    }.get(t, "page.html")

def render_one(idx: Index, page: Dict[str,Any], cms: Dict[str,Any]) -> Tuple[str,str,Dict[str,Any]]:
    # kopia + html
    p=dict(page)
    p["lang"]=norm_lang(p.get("lang"));  p["slug"]=norm_slug(p.get("slug"))
    p["body_html"]=md_to_html(p.get("body_md") or p.get("body_html") or "")
    p["body_html"]=apply_autolinks(p["body_html"], cms.get("autoLinks", []))

    # FAQ: dopasowane lub globalne top
    faq_sel=[]
    key=(p.get("slugKey") or p.get("page_ref") or "").strip()
    for f in cms.get("faq", []):
        ref=(f.get("slugKey") or f.get("page_ref") or "").strip()
        if ref and ref==key: faq_sel.append(f)
    if not faq_sel: faq_sel = cms.get("faq", [])[:8]

    head=build_head(idx, p, cms.get("company",[]))
    nav=cms.get("nav", [])
    rel=related(idx, p, limit=int(p.get("max_outlinks") or 6))

    ctx={"site_url":SITE_URL,"brand":BRAND,"page":p,"head":head,
         "company":cms.get("company",[]),"nav":nav,"blocks":cms.get("blocks",[]),
         "faq":faq_sel,"related":rel}

    try: tpl=env.get_template(pick_template(p))
    except: tpl=env.get_template("page.html")
    html=tpl.render(**ctx)

    out_path = DIST / build_path(p).strip("/") / "index.html"
    write_text(out_path, html)

    return str(out_path), html, p

def render_collections(idx: Index, cms: Dict[str,Any], lang: str):
    # BLOG
    posts=[b for b in cms.get("blog",[]) if norm_lang(b.get("lang"))==lang and as_bool(b.get("publish",True))]
    for b in posts:
        b["template"]="blog_post"; b["type"]="post"; b["body_html"]=md_to_html(b.get("body_md",""))
        render_one(idx,b,cms)
    if posts:
        render_one(idx, {"lang":lang,"template":"blog_index","type":"blog_index",
                         "title":"Blog","h1":"Blog","slug":"blog"}, cms)

    # CASE STUDIES
    cases=[c for c in cms.get("caseStudies",[]) if norm_lang(c.get("lang"))==lang and as_bool(c.get("publish",True))]
    for c in cases:
        c["template"]="case_item"; c["body_html"]=md_to_html(c.get("body_md",""))
        render_one(idx,c,cms)
    if cases:
        render_one(idx, {"lang":lang,"template":"case_index","type":"case_index",
                         "title":"Realizacje","h1":"Studia przypadków","slug":"realizacje"}, cms)

    # REVIEWS (zbiorcza)
    if cms.get("reviews"):
        page={"lang":lang,"template":"reviews","type":"reviews","title":"Opinie klientów",
              "h1":"Opinie klientów","slug":"opinie",
              "reviews_ld":[review_ld(r) for r in cms.get("reviews",[])]}
        render_one(idx,page,cms)

    # LOCATIONS
    locs=[l for l in cms.get("locations",[]) if norm_lang(l.get("lang") or lang)==lang and as_bool(l.get("publish",True))]
    for l in locs:
        l=dict(l); l["template"]="location"; l["body_html"]=md_to_html(l.get("body_md",""))
        render_one(idx,l,cms)

    # JOBS
    jobs=[j for j in cms.get("jobs",[]) if norm_lang(j.get("lang") or lang)==lang and as_bool(j.get("publish",True))]
    for j in jobs:
        j=dict(j); j["template"]="job_item"; j["body_html"]=md_to_html(j.get("body_md",""))
        render_one(idx,j,cms)
    if jobs:
        render_one(idx, {"lang":lang,"template":"jobs_index","type":"jobs_index",
                         "title":"Praca","h1":"Oferty pracy","slug":"praca"}, cms)

# ==============================
# TECH PLIKI
# ==============================
def write_root_redirect(dist: Path, default_lang=DEFAULT_LANG):
    html=f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>{BRAND}</title>
<meta http-equiv="refresh" content="0; url=/{default_lang}/">
<link rel="canonical" href="{SITE_URL}/{default_lang}/">
<meta name="robots" content="noindex,follow">
</head><body><p>Przenoszę do <a href="/{default_lang}/">/{default_lang}/</a>…</p>
<script>location.replace("/{default_lang}/")</script></body></html>"""
    write_text(dist/"index.html", html)

def write_404(dist: Path, lang=DEFAULT_LANG):
    html=f"""<!doctype html><html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 — Nie znaleziono</title>
<link rel="stylesheet" href="/static/css/site.css"></head>
<body><main class="content" style="max-width:720px;margin:4rem auto;padding:0 1rem">
<h1>404 — Nie znaleziono</h1>
<p>Ups! Tej strony nie ma. Wróć do <a href="/{lang}/">strony głównej</a>.</p></main></body></html>"""
    write_text(dist/"404.html", html)

def write_robots(dist: Path):
    write_text(dist/"robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")

def collect_urls(dist: Path) -> List[Tuple[str,str]]:
    out=[]
    for p in dist.rglob("index.html"):
        rel="/"+str(p.parent).replace(str(dist), "").strip("/").replace("\\","/")
        if not rel: rel="/"
        out.append((SITE_URL+rel, now_iso()))
    return out

def write_sitemap(dist: Path):
    urls=collect_urls(dist)
    items="\n".join([f"<url><loc>{u}</loc><lastmod>{m}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>" for u,m in urls])
    xml=f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    write_text(dist/"sitemap.xml", xml)

def write_cname(dist: Path, cname=CNAME_VALUE):
    write_text(dist/"CNAME", cname.strip()+"\n")

def write_redirects(dist: Path, redirects: List[Dict[str,Any]]):
    # /redirects.json + mini-HTML 1×1
    ensure_dir(dist/"r")
    data=[]
    for r in redirects or []:
        src=("/"+(r.get("from") or r.get("src") or "").strip("/")).rstrip("/")
        dst=(r.get("to") or r.get("dst") or "").strip()
        if not src or not dst: continue
        code=str(r.get("code") or 301)
        data.append({"from":src, "to":dst, "code":code})
        # mini strona
        fname = (dist/"r"/(slugify(src.strip("/")) or "index")).with_suffix(".html")
        html=f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url={dst}"><link rel="canonical" href="{dst}"><title>Przenoszę…</title><a href="{dst}">{dst}</a><script>location.replace("{dst}")</script>'
        write_text(fname, html)
    write_text(dist/"redirects.json", json.dumps(data, ensure_ascii=False, indent=2))

def zip_site(dist: Path):
    zdir=ensure_dir(dist/"download"); zpath=zdir/"site.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for p in dist.rglob("*"):
            if "download" in p.parts: continue
            if p.is_file(): z.write(p, arcname=str(p.relative_to(dist)))
    return zpath

# ==============================
# SEO STATS
# ==============================
def collect_seo_stats(dist: Path) -> List[Dict[str,Any]]:
    stats=[]
    for html_file in dist.rglob("index.html"):
        url="/"+str(html_file.parent).replace(str(dist),"").strip("/");  url="/"+url.strip("/")
        h=html_file.read_text("utf-8", errors="ignore")
        soup=BeautifulSoup(h,"lxml")
        title=(soup.title.string if soup.title else "") or ""
        desc=""; m=soup.find("meta", attrs={"name":"description"})
        if m and m.get("content"): desc=m["content"]
        h1=(soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "")
        imgs=len(soup.find_all("img"));  links=len(soup.find_all("a"))
        wc=words_count(h)
        stats.append({"url": SITE_URL+(url if url!="/" else ""), "title_len":len(title),
                      "desc_len":len(desc), "h1_len":len(h1), "images":imgs, "links":links, "words":wc})
    return stats

def write_seo_stats(dist: Path):
    data=collect_seo_stats(dist)
    write_text(dist/"seo_stats.json", json.dumps(data, ensure_ascii=False, indent=2))
    # CSV
    with (dist/"seo_stats.csv").open("w", newline="", encoding="utf-8") as f:
        w=csv.DictWriter(f, fieldnames=["url","title_len","desc_len","h1_len","images","links","words"])
        w.writeheader();  w.writerows(data)

# ==============================
# GŁÓWNY BUILD
# ==============================
def build(cms: Dict[str,Any]):
    # czyszczenie i kopiowanie assetów
    if DIST.exists(): shutil.rmtree(DIST)
    ensure_dir(DIST)
    copy_tree(STATIC_DIR, DIST/"static")
    copy_tree(ASSETS_DIR, DIST/"assets")

    idx=Index(cms)
    langs=set()

    # RENDER PAGES
    for p in idx.pages:
        path, html, pnorm = render_one(idx, p, cms)
        langs.add(norm_lang(pnorm.get("lang")))

        # QA
        idx.warn_if(not (pnorm.get("title") or pnorm.get("h1")), f"[SEO] Brak tytułu/H1 w {build_path(pnorm)}")
        idx.warn_if(len(strip_html(pnorm.get("body_html") or ""))<120, f"[SEO] Mało treści na {build_path(pnorm)}")

    # KOLEKCJE
    for lang in (langs or {DEFAULT_LANG}):
        render_collections(idx, cms, lang)

    # TECH pliki
    write_root_redirect(DIST, DEFAULT_LANG)
    write_404(DIST, DEFAULT_LANG)
    write_robots(DIST)
    write_redirects(DIST, cms.get("redirects", []))
    write_sitemap(DIST)
    write_cname(DIST, CNAME_VALUE)
    zip_site(DIST)
    write_seo_stats(DIST)

    # QA raport
    if idx.warn:
        write_text(DIST/"audit_warnings.txt", "\n".join(idx.warn))
        print("\n".join(["[WARN] "+w for w in idx.warn]))
    total=len(list(DIST.rglob("index.html")))
    print(f"[OK] Zbudowano {total} stron. Dist: {DIST}")

# ==============================
# ENTRY
# ==============================
if __name__=="__main__":
    print(f"[i] SITE_URL={SITE_URL} DEFAULT_LANG={DEFAULT_LANG} BRAND={BRAND}")
    cms=load_cms()
    # pre: zrób body_html w Pages (żeby head miał opis)
    for p in cms.get("pages", []):
        if not p.get("body_html"): p["body_html"]=md_to_html(p.get("body_md",""))
    build(cms)
