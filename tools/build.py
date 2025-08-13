#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans — ultra build (statyczny SSG z CMS w Google Sheets)
Funkcje:
- generuje strony wg Jinja, z JSON-a (Apps Script)
- sitemap-index + sitemapy (strony, obrazki)
- robots.txt
- 404.html
- root redirect "/" -> "/pl/"
- PWA: manifest + service worker
- search.json (indeks treści)
- GA4 + Consent Mode + eventy
- Open Graph images (Pillow)
- responsive images (multi-width + webp)
- minifikacja HTML/CSS/JS + cache busting
- autolinki + powiązane (TF-IDF)
- SEO statystyki i audyt
"""

from __future__ import annotations
import os, re, json, shutil, hashlib, zipfile, math, time, glob
from pathlib import Path
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown import markdown
from slugify import slugify as py_slugify

from bs4 import BeautifulSoup
from lxml import etree  # używane w minifikacji/SEO check
from PIL import Image, ImageDraw, ImageFont

# --- Ścieżki ---
ROOT = Path(__file__).resolve().parents[1]  # repo root
SRC_TEMPLATES = ROOT / "templates"
SRC_STATIC = ROOT / "static"
DIST = ROOT / "dist"
DATA = ROOT / "data"

# --- ENV (z pages.yml) ---
SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = os.getenv("DEFAULT_LANG", "pl")
BRAND = os.getenv("BRAND", "Kras-Trans")
GA_ID = os.getenv("GA_ID", "")  # GA4
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "")
CNAME = os.getenv("CNAME", "kras-trans.com")

# --- Ustawienia obrazków ---
IMG_SIZES = [480, 720, 960, 1200, 1600]
IMG_QUALITY = 82

# --- Pomocnicze ---
def ensure_dir(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)

def write_text(path: Path, content: str, encoding="utf-8"):
    ensure_dir(path)
    path.write_text(content, encoding=encoding)

def read_json(path: Path):
    return json.loads(Path(path).read_text("utf-8"))

def slugify(s: str) -> str:
    if not s: return ""
    return py_slugify(s, separator="-", lowercase=True)

def file_hash(path: Path, block=65536) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(block), b""):
            h.update(chunk)
    return h.hexdigest()[:10]

def md_to_html(md: str) -> str:
    if not md: return ""
    html = markdown(md, extensions=["extra","sane_lists","smarty","toc"])
    return html

def minify_html(html: str) -> str:
    # bezpieczna, lekka minifikacja
    html = re.sub(r">\s+<", "><", html)
    html = re.sub(r"\s{2,}", " ", html)
    return html.strip()

def minify_css(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s*([{}:;,])\s*", r"\1", css)
    css = re.sub(r"\s+", " ", css)
    css = css.strip()
    return css

def minify_js(js: str) -> str:
    js = re.sub(r"//[^\n]*", "", js)
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    js = re.sub(r"\s{2,}", " ", js)
    return js.strip()

def text_words(txt: str) -> list[str]:
    return re.findall(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9\-]{2,}", txt or "")

# --- Ładowanie CMS ---
def load_cms() -> dict:
    src = DATA / "cms.json"
    if not src.exists():
        raise SystemExit("Brak data/cms.json (pobierz w Actionie Apps Script).")
    cms = read_json(src)
    if not cms.get("ok"):
        raise SystemExit("cms.json: ok=false")
    # Podstawowe kolekcje (zabezpieczenie na brak zakładki)
    for key in ("pages","faq","media","company","redirects","blocks","nav",
                "templates","strings","routes","places","blog","categories",
                "authors","caseStudies","reviews","locations","jobs","autoLinks"):
        cms.setdefault(key, [])
    return cms

# --- Jinja ---
def jenv():
    env = Environment(
        loader=FileSystemLoader(str(SRC_TEMPLATES)),
        autoescape=select_autoescape(["html","xml"]),
        trim_blocks=True, lstrip_blocks=True
    )
    env.filters["markdown"] = md_to_html
    env.filters["slugify"] = slugify
    env.filters["tojson"] = lambda x: json.dumps(x, ensure_ascii=False)
    return env

# --- Budowa mapy stron / ścieżek ---
def build_page_maps(pages: list[dict]) -> tuple[dict, dict, dict]:
    # indeks po slug, slugKey i (lang,slugKey)
    by_slug = {p.get("slug",""): p for p in pages if p.get("slug")}
    by_key = {}
    by_lang_key = {}
    for p in pages:
        key = p.get("slugKey") or p.get("slug") or ""
        by_key.setdefault(key, []).append(p)
        by_lang_key[(p.get("lang","pl"), key)] = p
    return by_slug, by_key, by_lang_key

def build_url(page: dict, by_slug: dict) -> str:
    lang = (page.get("lang") or DEFAULT_LANG).lower()
    if page.get("type") == "home" or page.get("ic") == "ho":
        # home → /pl/
        return f"/{lang}/"
    slug = page.get("slug","").strip("/")
    # łańcuch parentów po polu parentSlug (trzymamy slug rodzica)
    parts = [slug]
    parent = page.get("parentSlug","")
    safety = 0
    while parent and safety < 10:
        pp = by_slug.get(parent)
        parts.insert(0, parent)
        parent = (pp or {}).get("parentSlug","")
        safety += 1
    return f"/{lang}/" + "/".join(parts).strip("/") + "/"

# --- Responsive images + webp ---
def make_variants(src_path: Path, out_dir: Path) -> dict:
    """
    Zwraca: {"src": rel, "srcset": "path-480.webp 480w, ...", "sizes": "..."}
    Jeśli brak pliku wejściowego – zwraca pusty dict.
    """
    try:
        if not src_path.exists(): return {}
        ensure_dir(out_dir / "x.tmp")
        im = Image.open(src_path).convert("RGB")
        base = src_path.stem
        ext = src_path.suffix.lower()
        rels = []
        for w in IMG_SIZES:
            if im.width < w:  # nie powiększamy
                continue
            ratio = w / im.width
            h = int(im.height * ratio)
            im_res = im.resize((w,h), Image.LANCZOS)
            out = out_dir / f"{base}-{w}.webp"
            im_res.save(out, "WEBP", quality=IMG_QUALITY, method=6)
            rels.append((w, out))
        # srcset
        srcset = ", ".join([f"/{out.relative_to(DIST).as_posix()} {w}w" for w,out in rels])
        sizes = "(min-width: 64rem) 60rem, 92vw"
        # src
        src_rel = "/" + (src_path if src_path.is_absolute() else (src_path)).as_posix().lstrip("/")
        return {"src": src_rel, "srcset": srcset, "sizes": sizes}
    except Exception:
        return {}

# --- OG image generacja ---
def draw_og(title: str, out_path: Path):
    ensure_dir(out_path)
    W,H = 1200, 630
    bg = Image.new("RGB", (W,H), (18,20,24))
    draw = ImageDraw.Draw(bg)
    # prosta belka
    draw.rectangle([0,H-8,W,H], fill=(255,102,0))
    # tytuł
    try:
        # systemowy fallback – bez ciężkich fontów
        font = ImageFont.truetype("DejaVuSans.ttf", 56)
    except Exception:
        font = ImageFont.load_default()
    # łamanie wierszy ~ 28-32 zn/linia
    words = title.split()
    lines, cur = [], ""
    for w in words:
        test = (cur+" "+w).strip()
        if len(test) > 28:
            lines.append(cur); cur = w
        else:
            cur = test
    if cur: lines.append(cur)
    y = 220 - 40*max(0, len(lines)-3)
    for i,ln in enumerate(lines[:5]):
        draw.text((72,y+i*68), ln, fill=(240,244,248), font=font)
    draw.text((72,72), BRAND, fill=(160,170,180), font=font)
    bg.save(out_path, "JPEG", quality=90, optimize=True, progressive=True)

# --- Auto-linki (z zakładki AutoLinks) ---
def apply_autolinks(html: str, autolinks: list[dict]) -> str:
    if not autolinks: return html
    soup = BeautifulSoup(html, "lxml")
    body = soup if soup.body is None else soup.body
    txt_nodes = body.find_all(text=True)
    for rule in autolinks:
        phrase = (rule.get("phrase") or "").strip()
        url = (rule.get("url") or "").strip()
        cap = int(rule.get("cap") or 1)
        if not phrase or not url or cap<=0: continue
        replaced = 0
        # proste: zamiana tylko w tekstach, nie wewnątrz <a>
        for node in txt_nodes:
            if node.parent and node.parent.name == "a": 
                continue
            if phrase.lower() in node.lower():
                new_html = re.sub(
                    re.escape(phrase),
                    f'<a href="{url}">{phrase}</a>',
                    str(node), count=max(0, cap-replaced), flags=re.I
                )
                node.replace_with(BeautifulSoup(new_html, "lxml").text if "<a" not in new_html else BeautifulSoup(new_html, "lxml"))
                replaced = cap
                if replaced >= cap: break
    return str(soup)

# --- TF-IDF related (bardzo lekki) ---
def build_related(pages_data: list[dict], this_idx: int, k=6) -> list[dict]:
    # z tekstu wyłuskujemy słowa; punktujemy zbieżność
    docs = []
    for p in pages_data:
        text = " ".join([p.get("title",""), p.get("h1",""), p.get("lead",""), p.get("body_text","")])
        docs.append(text_words(text.lower()))
    # IDF
    df = {}
    for d in docs:
        seen=set()
        for w in d:
            if w in seen: continue
            df[w]=df.get(w,0)+1; seen.add(w)
    idf = {w: math.log((1+len(docs))/(1+df[w]))+1.0 for w in df}
    def vec(d): 
        v={}
        for w in d: v[w]=v.get(w,0)+1
        for w,c in v.items(): v[w]=c*idf.get(w,1)
        return v
    vecs=[vec(d) for d in docs]
    def cos(a,b):
        if not a or not b: return 0.0
        dot=sum(a.get(w,0)*b.get(w,0) for w in set(a)|set(b))
        na=math.sqrt(sum(x*x for x in a.values())); nb=math.sqrt(sum(x*x for x in b.values()))
        if na*nb==0: return 0.0
        return dot/(na*nb)
    scores=[]
    for j,v in enumerate(vecs):
        if j==this_idx: continue
        scores.append((j,cos(vecs[this_idx],v)))
    scores.sort(key=lambda x:-x[1])
    out=[]
    for j,_ in scores[:k]:
        out.append({"title": pages_data[j]["title"], "url": pages_data[j]["url"]})
    return out

# --- Cache busting (assets) ---
def fingerprint_assets():
    # kopiujemy static -> dist/static, fingerprintujemy css/js
    if DIST.exists(): shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)
    if SRC_STATIC.exists():
        shutil.copytree(SRC_STATIC, DIST/"static")
    # fingerprint
    mapping = {}
    for path in (DIST/"static").rglob("*"):
        if path.suffix.lower() not in (".css",".js"): continue
        h = file_hash(path)
        new = path.with_name(f"{path.stem}.{h}{path.suffix}")
        path.rename(new)
        rel_old = "/"+path.relative_to(DIST).as_posix()
        rel_new = "/"+new.relative_to(DIST).as_posix()
        mapping[rel_old] = rel_new
    return mapping

# --- GA/Consent/Events snippet ---
def ga_snippet() -> str:
    if not GA_ID: return ""
    return f"""
<script>
  // Consent Mode v2 (domyślnie granted — dostosuj jeśli użyjesz CMP)
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('consent','default',{{'ad_storage':'denied','analytics_storage':'granted','wait_for_update':500}});
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config','{GA_ID}');
  // Eventy UX
  document.addEventListener('DOMContentLoaded', function(){{
    const telLinks=[...document.querySelectorAll('a[href^="tel:"]')];
    telLinks.forEach(a=>a.addEventListener('click',()=>gtag('event','click_tel',{{'event_category':'engagement','event_label':a.href}})));
    const forms=[...document.querySelectorAll('form')];
    forms.forEach(f=>f.addEventListener('submit',()=>gtag('event','form_submit',{{'event_category':'lead','event_label':location.pathname}})));
    const faqs=[...document.querySelectorAll('details>summary')];
    faqs.forEach(s=>s.addEventListener('click',()=>gtag('event','faq_toggle',{{'event_category':'engagement','event_label':s.innerText.trim().slice(0,80)}})));
    let sent=false; window.addEventListener('scroll',()=>{{if(sent)return; if(scrollY>1200){{sent=true; gtag('event','scroll_depth',{{value:1200}});}}}}, {{passive:true}});
  }});
</script>""".strip()

# --- Render strony ---
def render_pages(cms: dict):
    env = jenv()
    pages = cms.get("pages", [])
    by_slug, by_key, by_lang_key = build_page_maps(pages)
    # przygotuj assets fingerprint mapping
    asset_map = fingerprint_assets()

    # krytyczny CSS (jeśli istnieje)
    critical_css = ""
    crit_path = DIST/"static/css/critical.css"
    if crit_path.exists():
        critical_css = minify_css(crit_path.read_text("utf-8"))

    # SEO/ORG
    company = cms.get("company", [])
    org = company[0] if company else {"name": BRAND}
    phone = org.get("telephone") or "+48793927467"

    # kolekcje supporting
    faq_all = cms.get("faq") or []
    autolinks = cms.get("autoLinks") or []

    # manifest + sw + CNAME
    write_text(DIST/"CNAME", CNAME.strip()+"\n")
    write_text(DIST/"manifest.json", json.dumps({
        "name": BRAND,
        "short_name": BRAND,
        "start_url": "/",
        "display": "standalone",
        "background_color": "#121418",
        "theme_color": "#121418",
        "icons": [
            {"src": "/static/img/icon-192.png", "sizes":"192x192", "type":"image/png"},
            {"src": "/static/img/icon-512.png", "sizes":"512x512", "type":"image/png"}
        ]
    }, ensure_ascii=False, indent=2))
    write_text(DIST/"service-worker.js", """
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{self.clients.claim()});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.origin===location.origin && (url.pathname.startsWith('/static/')||url.pathname.endsWith('.html'))){
    e.respondWith(caches.open('v1').then(async c=>{
      const m=await c.match(e.request);
      if(m) return m;
      const r=await fetch(e.request);
      c.put(e.request,r.clone());
      return r;
    }));
  }
});
""".strip())

    # root redirect
    def write_root_redirect():
        target = f"/{DEFAULT_LANG}/"
        write_text(DIST/"index.html", f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>{BRAND}</title>
<meta http-equiv="refresh" content="0; url={target}">
<link rel="canonical" href="{SITE_URL}{target}">
<meta name="robots" content="noindex,follow">
<link rel="manifest" href="/manifest.json">
<script>location.replace("{target}")</script>
</head><body><p>Przenoszę do <a href="{target}">{target}</a>…</p></body></html>""")

    write_root_redirect()

    # 404
    write_text(DIST/"404.html", f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><title>404 — Nie znaleziono | {BRAND}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/static/favicon.ico">
<style>body{{font:16px/1.5 system-ui,SegUI,Arial,sans-serif;margin:0;padding:4rem 1rem;color:#e6e6e6;background:#111;}}
main{{max-width:48rem;margin:0 auto}}a{{color:#ff7a1a}}</style></head>
<body><main><h1>404 — Nie znaleziono</h1><p>Ups! Tej strony nie ma. Wróć do <a href="{SITE_URL}/{DEFAULT_LANG}/">strony głównej</a>.</p></main></body></html>""")

    # przygotowanie danych stron (html + konteksty + assets)
    # rastery/OG
    og_dir = DIST/"static/og"
    img_out_dir = DIST/"static/img/resized"
    img_out_dir.mkdir(parents=True, exist_ok=True)

    rendered = []   # do sitemap
    images_for_sitemap = []

    # Preindeks do „related”
    pre_pages_data = []

    # pierwsza pętla — obróbka treści
    for p in pages:
        p = dict(p)  # kopia
        p["url"] = build_url(p, by_slug)
        p["canonical"] = SITE_URL + p["url"]
        p["title"] = p.get("title") or p.get("seo_title") or p.get("h1") or p.get("meta_desc") or BRAND
        p["h1"] = p.get("h1") or p.get("title") or p["slug"].replace("-", " ").title()
        p["description"] = p.get("description") or p.get("meta_desc") or ""
        # body html
        body_md = p.get("body_md","")
        p["body_html"] = md_to_html(body_md)
        # plain text do SEO
        p["body_text"] = BeautifulSoup(p["body_html"], "lxml").get_text(" ", strip=True)

        # hero responsive (jeśli jest plik)
        hero = p.get("hero_image","") or ""
        hero_path = SRC_STATIC / hero if hero and not hero.startswith("http") else None
        hero_v = make_variants(hero_path, img_out_dir) if hero_path else {}
        if hero_v:
            p["hero_srcset"] = hero_v["srcset"]
            p["hero_sizes"] = hero_v["sizes"]

        # OG image (tytuł)
        og_name = slugify(p.get("slugKey") or p.get("slug") or p.get("h1") or "page") + ".jpg"
        og_path = og_dir / og_name
        draw_og(p["title"], og_path)
        p["og_image"] = "/" + og_path.relative_to(DIST).as_posix()

        pre_pages_data.append({"title": p["title"], "h1": p["h1"], "lead": p.get("lead",""),
                               "body_text": p["body_text"], "url": p["url"]})

    # druga pętla — render + autolinki + related
    env = jenv()

    def choose_template(p: dict) -> str:
        tpl = (p.get("template") or "default").strip()
        if tpl and (SRC_TEMPLATES/f"{tpl}.html").exists():
            return f"{tpl}.html"
        # automatyczne dla typów (jeśli plik istnieje)
        mapping = {
            "blog":"blog_post.html",
            "service":"service.html",
            "case":"case_item.html",
            "location":"location.html",
            "job":"job_item.html",
        }
        t = mapping.get(p.get("type",""), "page.html")
        return t if (SRC_TEMPLATES/t).exists() else "page.html"

    # hreflang – grupujemy po slugKey
    groups = {}
    for p in pages:
        key = p.get("slugKey") or p.get("slug") or ""
        groups.setdefault(key, []).append(p)

    for idx,p in enumerate(pages):
        p = dict(p)
        p["url"] = build_url(p, by_slug)
        p["canonical"] = SITE_URL + p["url"]
        p["title"] = p.get("title") or p.get("seo_title") or p.get("h1") or p.get("meta_desc") or BRAND
        p["h1"] = p.get("h1") or p["title"]
        p["description"] = p.get("description") or p.get("meta_desc") or ""

        # breadcrumbs
        crumbs = []
        parts = [seg for seg in p["url"].strip("/").split("/")][1:]  # bez lang
        base = f"/{p.get('lang',DEFAULT_LANG)}/"
        path = base
        for seg in parts:
            path = path + seg + "/"
            crumbs.append({"name": seg.replace("-"," ").title(), "item": SITE_URL+path})

        # hreflang
        alts = []
        key = p.get("slugKey") or p.get("slug") or ""
        for alt in groups.get(key, []):
            alts.append({"lang": alt.get("lang","pl"), "url": SITE_URL + build_url(alt, by_slug)})
        x_default = SITE_URL + p["url"]

        # hero og/variants (z poprzedniej pętli)
        hero = p.get("hero_image","") or ""
        hero_path = SRC_STATIC / hero if hero and not hero.startswith("http") else None
        hero_v = make_variants(hero_path, img_out_dir) if hero_path else {}
        if hero_v:
            p["hero_srcset"] = hero_v["srcset"]
            p["hero_sizes"] = hero_v["sizes"]

        og_name = slugify(p.get("slugKey") or p.get("slug") or p.get("h1") or "page") + ".jpg"
        p["og_image"] = f"/static/og/{og_name}"

        # JSON-LD
        jsonld = []
        jsonld.append({
            "@context":"https://schema.org",
            "@type":"Organization",
            "name": org.get("name") or BRAND,
            "url": SITE_URL,
            "telephone": phone
        })
        if crumbs:
            jsonld.append({
                "@context":"https://schema.org",
                "@type":"BreadcrumbList",
                "itemListElement":[
                    {"@type":"ListItem","position":i+1,"name":c["name"],"item":c["item"]}
                    for i,c in enumerate(crumbs)
                ]
            })
        # FAQPage z arkusza, jeśli dotyczy
        faqs = [f for f in (cms.get("faq") or []) if (f.get("page_ref") or "") == (p.get("slugKey") or p.get("slug"))]
        if faqs:
            jsonld.append({
                "@context":"https://schema.org",
                "@type":"FAQPage",
                "mainEntity":[
                    {"@type":"Question","name":f.get("question"),"acceptedAnswer":{"@type":"Answer","text":md_to_html(f.get("answer",""))}}
                    for f in faqs
                ]
            })

        head = {
            "title": p["title"],
            "description": p["description"],
            "canonical": p["canonical"],
            "hreflangs": alts,
            "x_default": x_default,
            "og_title": p["title"],
            "og_description": p["description"][:180],
            "og_image": p["og_image"],
            "jsonld": jsonld,
            "extra_head": ""
        }

        # GSC
        if GSC_VERIFICATION:
            head["extra_head"] += f'\n<meta name="google-site-verification" content="{GSC_VERIFICATION}">'

        # GA
        if GA_ID:
            head["extra_head"] += "\n" + ga_snippet()

        # komponujemy html z szablonu
        tpl_name = choose_template(p)
        tpl = env.get_template(tpl_name)

        # dane do templatki
        ctx = {
            "site_url": SITE_URL,
            "brand": BRAND,
            "page": p,
            "head": head,
            "company": cms.get("company") or [],
            "faq": faqs,
            "nav": cms.get("nav") or [],
            "related": [],   # wypełnimy po autolinkach
            "asset_map": asset_map,
            "critical_css": critical_css
        }
        html = tpl.render(**ctx)

        # autolinki
        html = apply_autolinks(html, autolinks)

        # minifikacja + podmiana fingerprintów
        for old,new in asset_map.items():
            html = html.replace(old, new)
        html = minify_html(html)

        # zapis
        out = DIST / p["url"].lstrip("/")
        if out.name != "":  # folder kończy się /
            out = out / "index.html"
        else:
            out = out / "index.html"
        write_text(out, html)

        # rejestr do sitemap
        rendered.append({"url": p["url"], "path": out})

        # obrazki ze strony (do image sitemap)
        soup = BeautifulSoup(html, "lxml")
        for img in soup.select("img"):
            src = img.get("src") or ""
            if src.startswith("http"): continue
            images_for_sitemap.append(urljoin(SITE_URL, src))

    # RELATED (drugi przebieg po zapisaniu)
    # (tylko jako „suggestion” – jeśli chcesz wypisać w szablonie, podajemy „related” w ctx)
    # Tu zrobimy lekką wersję: osobny JSON do ewentualnego wczytania na froncie
    related_map = {}
    for i,pd in enumerate(pre_pages_data):
        related_map[pd["url"]] = build_related(pre_pages_data, i, k=6)
    write_text(DIST/"search-related.json", json.dumps(related_map, ensure_ascii=False, indent=2))

    return rendered, images_for_sitemap

# --- SEARCH JSON ---
def build_search_json(rendered: list[dict]):
    docs = []
    for r in rendered:
        html = Path(r["path"]).read_text("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "lxml")
        title = (soup.title.string if soup.title else "").strip()
        desc = ""
        m = soup.find("meta", attrs={"name":"description"})
        if m: desc = (m.get("content") or "").strip()
        text = soup.get_text(" ", strip=True)
        docs.append({"title": title, "url": r["url"], "description": desc, "content": text[:3000]})
    write_text(DIST/"search.json", json.dumps(docs, ensure_ascii=False))

# --- Sitemapy ---
def build_sitemaps(rendered: list[dict], images: list[str]):
    lastmod = time.strftime("%Y-%m-%d")
    # zwykła sitemap
    urlset = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for r in rendered:
        loc = SITE_URL + r["url"]
        urlset.append(f"<url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
    urlset.append("</urlset>")
    write_text(DIST/"sitemap.xml", "\n".join(urlset))

    # image sitemap
    imgset = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
              'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for r in rendered:
        loc = SITE_URL + r["url"]
        # zbieramy <img> z konkretnego pliku
        html = Path(r["path"]).read_text("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "lxml")
        imgs = []
        for img in soup.select("img"):
            src = img.get("src") or ""
            if not src: continue
            if not src.startswith("http"):
                src = urljoin(SITE_URL, src)
            imgs.append(src)
        if not imgs: 
            continue
        imgset.append(f"<url><loc>{loc}</loc>")
        for src in imgs:
            imgset.append(f"<image:image><image:loc>{src}</image:loc></image:image>")
        imgset.append("</url>")
    imgset.append("</urlset>")
    write_text(DIST/"image-sitemap.xml", "\n".join(imgset))

    # sitemap index
    index = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for name in ("sitemap.xml","image-sitemap.xml"):
        index.append(f"<sitemap><loc>{SITE_URL}/{name}</loc><lastmod>{lastmod}</lastmod></sitemap>")
    index.append("</sitemapindex>")
    write_text(DIST/"sitemap-index.xml", "\n".join(index))

# --- robots.txt ---
def build_robots():
    txt = f"""User-agent: *
Allow: /
Sitemap: {SITE_URL}/sitemap-index.xml
"""
    write_text(DIST/"robots.txt", txt)

# --- SEO/Audyt ---
def seo_audit(rendered: list[dict]):
    # prosto: duplikaty tytułów i meta, licznik słów
    seen_title = {}
    seen_desc = {}
    lines = ["# SEO audit\n"]
    for r in rendered:
        html = Path(r["path"]).read_text("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "lxml")
        title = (soup.title.string if soup.title else "").strip()
        desc = ((soup.find("meta", attrs={"name":"description"}) or {}).get("content") or "").strip()
        text = soup.get_text(" ", strip=True)
        wc = len(text_words(text))
        if title:
            seen_title.setdefault(title, []).append(r["url"])
        if desc:
            seen_desc.setdefault(desc, []).append(r["url"])
        lines.append(f"- {r['url']} — {wc} słów; title: {len(title)} zn., desc: {len(desc)} zn.")
    dups = [ (t,urls) for t,urls in seen_title.items() if len(urls)>1 ]
    if dups:
        lines.append("\n## Duplikaty TITLE:")
        for t,urls in dups:
            lines.append(f"- „{t}”\n  - " + "\n  - ".join(urls))
    dupsd = [ (d,urls) for d,urls in seen_desc.items() if len(urls)>1 ]
    if dupsd:
        lines.append("\n## Duplikaty META DESCRIPTION:")
        for d,urls in dupsd:
            lines.append(f"- „{d}”\n  - " + "\n  - ".join(urls))
    out = ROOT/"audit"
    out.mkdir(exist_ok=True)
    write_text(out/"seo.md", "\n".join(lines))

# --- ZIP snapshot ---
def snapshot_zip():
    zpath = DIST/"download/site.zip"
    ensure_dir(zpath)
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_dir(): continue
            rel = p.relative_to(DIST)
            z.write(p, rel)

def main():
    cms = load_cms()
    rendered, imgs = render_pages(cms)
    build_search_json(rendered)
    build_sitemaps(rendered, imgs)
    build_robots()
    seo_audit(rendered)
    snapshot_zip()
    print(f"OK: {len(rendered)} stron, {len(imgs)} obrazów; dist ready.")

if __name__ == "__main__":
    main()
