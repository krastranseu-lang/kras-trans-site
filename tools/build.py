#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans • Static Builder (MAX+ • scalony)
Autor: Kras-Trans Project Builder

CELE:
- Połączenie pełnych funkcji starego buildera (P0–P20) z dodatkami „nowego patcha”.
- Zgodność z pages.yml v6, i18n (pl,en,de,fr,it,ru,ua), SEO, performance, a11y.

NAJWAŻNIEJSZE FUNKCJE:
- ENV override: SITE_URL, APPS_URL, APPS_KEY, GA_ID, GSC_VERIFICATION, INDEXNOW_KEY, BING_SITE_AUTH_USER, NEWS_ENABLED
- CMS: pobieranie z Google Apps Script (?key=...), fallback do data/cms.json, robust timeout/log
- Kopiowanie assets/ → dist/assets
- Render Jinja + autolinki + sanity DOM (a11y/perf)
- Head injections (jeśli brakuje w szablonie): <meta name="cms-endpoint">, GA (gtag), GSC meta, canonical, hreflang, OG/Twitter, JSON-LD
- Root "/" = redirect do /{defaultLang}/ + GSC meta + canonical
- City×Service generator + thin/noindex + OG-image (opcjonalnie)
- Sitemapy z alternates (xhtml:link), news-sitemap (okno godz.), robots.txt
- Redirect stubs, BingSiteAuth.xml, {INDEXNOW_KEY}.txt, /admin/indexing.html (Apps Script dispatch)
- On-site search index (per lang), RSS/Atom, link-checker, raporty

WYMAGANE PAKIETY:
  PyYAML, Jinja2, Markdown, requests, beautifulsoup4, lxml
OPCJONALNE:
  Pillow (OG-image), python-slugify (nieobowiązkowo)

UŻYCIE (CI):
  python -u tools/build.py
"""
import os, re, io, csv, json, math, sys, time, glob, shutil, hashlib, unicodedata, pathlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Tuple, Iterable, Optional, Set

# --------------------------- ZALEŻNOŚCI ------------------------------------
try:
    import yaml
    from jinja2 import Environment, FileSystemLoader, select_autoescape, TemplateNotFound
    from markdown import markdown
    import requests
    from bs4 import BeautifulSoup
    try:
        from slugify import slugify as _slugify
    except Exception:
        _slugify = None
    try:
        from PIL import Image, ImageDraw, ImageFont
        PIL_OK = True
    except Exception:
        PIL_OK = False
except Exception as e:
    print("Brak wymaganych pakietów. Zainstaluj requirements.txt.", file=sys.stderr)
    raise

# --------------------------- POMOCNICZE ------------------------------------
ROOT = pathlib.Path(".")
OUT  = pathlib.Path("dist")
OUT.mkdir(parents=True, exist_ok=True)

UTC  = lambda dt=None: (dt or datetime.now(timezone.utc)).isoformat(timespec="seconds")

def read_yaml(path: "str|pathlib.Path") -> Dict[str, Any]:
    p = pathlib.Path(path)
    raw = p.read_text("utf-8")
    # Normalizacja, żeby YAML nie walił się na tabach/BOM/CRLF
    if raw.startswith("\ufeff"):  # BOM
        raw = raw.lstrip("\ufeff")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    raw = raw.replace("\t", "  ")  # TAB -> 2 spacje
    try:
        return yaml.safe_load(raw)
    except yaml.YAMLError as e:
        print("[YAML] Parse error:", e, file=sys.stderr)
        mark = getattr(e, "problem_mark", None)
        if mark:
            err_line = mark.line + 1
            start = max(1, err_line - 3)
            end = err_line + 3
            lines = raw.split("\n")
            for i in range(start, min(end, len(lines)) + 1):
                prefix = ">>" if i == err_line else "  "
                print(f"{prefix} {i:4d}: {lines[i-1]}", file=sys.stderr)
        raise

def read_text(p: pathlib.Path) -> str:
    return p.read_text("utf-8") if p.exists() else ""

def write_text(p: pathlib.Path, s: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, "utf-8")

def ensure_dir(p: pathlib.Path):
    p.mkdir(parents=True, exist_ok=True)

def norm_slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii","ignore").decode("ascii")
    s = re.sub(r"&","-and-", s.lower())
    s = re.sub(r"[^a-z0-9]+","-", s).strip("-")
    return re.sub(r"-{2,}","-", s)

def url_from(lang: str, slug: str) -> str:
    return f"/{lang}/{(slug + '/') if slug else ''}"

def canonical(site_url: str, lang: str, slug: str, canonical_path: Optional[str]=None) -> str:
    path = canonical_path or url_from(lang, slug)
    return site_url.rstrip("/") + path

def md_to_html(md: str) -> str:
    if not md: return ""
    return markdown(md, extensions=["extra","sane_lists","tables","toc"])

def soupify(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "lxml")

def text_of(html: str) -> str:
    return soupify(html).get_text(" ", strip=True)

def is_external(href: str, site_url: str) -> bool:
    return bool(re.match(r"^https?://", href)) and (not href.startswith(site_url))

def set_img_defaults(soup: BeautifulSoup):
    # lazy + hero LCP
    for img in soup.find_all("img"):
        if "loading" not in img.attrs:   img["loading"]="lazy"
        if "decoding" not in img.attrs:  img["decoding"]="async"
        if img.find_parent(id="hero") or "hero-media" in (img.get("class") or []):
            img["fetchpriority"]="high"; img["loading"]="eager"

def set_ext_link_attrs(soup: BeautifulSoup, site_url: str):
    for a in soup.find_all("a", href=True):
        href=a["href"]
        if href.startswith("mailto:") or href.startswith("tel:"): continue
        if is_external(href, site_url):
            rel=set(a.get("rel") or []); rel.update(["noopener","noreferrer"]); a["rel"]=list(rel)
            a["target"]="_blank"

def hash_stable(s: str) -> int:
    h=5381
    for ch in (s or ""): h=((h<<5)+h)+ord(ch)
    return abs(h)

def simhash(tokens: List[str], bits:int=64)->int:
    v=[0]*bits
    for t in tokens:
        h=int(hashlib.md5(t.encode("utf-8")).hexdigest(),16)
        for i in range(bits):
            v[i]+=1 if (h>>i)&1 else -1
    out=0
    for i in range(bits):
        if v[i]>0: out|=(1<<i)
    return out

def hamming(a:int,b:int)->int:
    return (a^b).bit_count()

def tfidf_keywords(text:str, top:int=8) -> List[str]:
    tokens=[w.lower() for w in re.findall(r"[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9]{3,}", text)]
    freq={}
    for t in tokens: freq[t]=freq.get(t,0)+1
    return [k for k,_ in sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:top]]

# --------------------------- KONFIG + ENV -----------------------------------
CFG = read_yaml("pages.yml")
C   = CFG.get("constants", {})

def _env(name: str, default: Any) -> Any:
    v = os.getenv(name)
    return default if v is None or str(v).strip()=="" else v

SITE_URL = (_env("SITE_URL", C.get("SITE_URL","")) or "").rstrip("/")
APPS_URL = (_env("APPS_URL", C.get("APPS_URL","")) or "").strip()
APPS_KEY = (_env("APPS_KEY", C.get("APPS_KEY","")) or "").strip()
GA_ID    = _env("GA_ID", C.get("GA_ID",""))
GSC      = _env("GSC_VERIFICATION", C.get("GSC_VERIFICATION",""))
INDEXNOW_KEY = _env("INDEXNOW_KEY", C.get("INDEXNOW_KEY",""))
BING_USER    = _env("BING_SITE_AUTH_USER", C.get("BING_SITE_AUTH_USER",""))
NEWS_ENABLED = str(_env("NEWS_ENABLED", C.get("NEWS_ENABLED", False))).lower() in ("1","true","yes")

DEFAULT_LANG = CFG.get("site",{}).get("defaultLang","pl")
LOCALES      = list((CFG.get("site",{}).get("locales") or {}).keys()) or ["pl"]

# --------------------------- KOPIOWANIE ASSETS ------------------------------
ASSETS_DIR = pathlib.Path("assets")
if ASSETS_DIR.exists():
    shutil.copytree(ASSETS_DIR, OUT / "assets", dirs_exist_ok=True)

# ---------------------------- ŚRODOWISKO JINJA -----------------------------
env = Environment(
    loader=FileSystemLoader(CFG["paths"]["src"]["templates"]),
    autoescape=select_autoescape(["html"])
)
env.globals.update({
    "site": CFG.get("site",{}),
    "cms_endpoint": (f"{APPS_URL}?key={APPS_KEY}" if APPS_URL and APPS_KEY else ""),
    "ga_id": GA_ID,
    "gsc_verification": GSC,
    "assets": CFG.get("assets", {})
})

# --------------------------- CMS: load + fallback ---------------------------
def _cms_fallback() -> Dict[str,Any]:
    p = pathlib.Path("data/cms.json")
    if p.exists():
        try:
            data = json.loads(p.read_text("utf-8"))
            if not data.get("ok"): data["ok"]=True
            print("[CMS] Fallback: data/cms.json", file=sys.stderr)
            return data
        except Exception as e:
            print(f"[CMS] Błąd parsowania data/cms.json: {e}", file=sys.stderr)
    # minimalistyczny default (home)
    return {
        "ok": True,
        "pages": [{
            "lang": DEFAULT_LANG, "slugKey":"home", "slug":"", "type":"home",
            "h1":"Kras-Trans — firma transportowa i spedycja w Polsce i UE",
            "title":"Kras-Trans — firma transportowa i spedycja w Polsce i UE",
            "meta_desc": "Transport i spedycja, flota EURO6, terminowość i bezpieczeństwo.",
            "body_md": "## Witamy w Kras-Trans\n\nTransport międzynarodowy i krajowy."
        }],
        "hreflang": {}, "redirects": [], "blocks": [], "faq": []
    }

def load_cms() -> Dict[str,Any]:
    url = f"{APPS_URL}?key={APPS_KEY}" if (APPS_URL and APPS_KEY) else ""
    if not url:
        print("[CMS] Brak APPS_URL/APPS_KEY → fallback", file=sys.stderr)
        return _cms_fallback()
    try:
        r = requests.get(url, timeout=45)
        r.raise_for_status()
        data = r.json()
        assert data.get("ok", False), "CMS .ok != true"
        print("[CMS] OK z Apps Script")
        return data
    except Exception as e:
        print(f"[CMS] Błąd pobrania CMS ({e}) → fallback", file=sys.stderr)
        return _cms_fallback()

CMS = load_cms()

# ---------------------------- CSV: cities / keywords ------------------------
def read_csv(path:str, dialect="auto")->List[Dict[str,str]]:
    p=pathlib.Path(path)
    if not p.exists(): return []
    raw = p.read_text("utf-8")
    sep=";"
    if dialect=="auto":
        if "\t" in raw: sep="\t"
        elif raw.count(",")>raw.count(";"): sep=","
    rdr=csv.DictReader(io.StringIO(raw), delimiter=sep)
    rows=[]
    for row in rdr:
        rows.append({(k or "").strip(): (v or "").strip() for k,v in row.items()})
    return rows

def csv_map(rows:List[Dict[str,str]], mapping:Dict[str,List[str]])->List[Dict[str,str]]:
    out=[]
    alias_flat=set()
    for aliases in mapping.values(): alias_flat.update(aliases)
    for r in rows:
        o={}
        for canonical_name, aliases in mapping.items():
            v=""
            for a in aliases:
                if a in r and r[a]:
                    v=r[a]; break
            o[canonical_name]=v
        for k,v in r.items():
            if k not in alias_flat: o[k]=v
        out.append(o)
    return out

cities_src = CFG.get("sources",{}).get("cities_csv",{})
cities_rows = csv_map(
    read_csv(cities_src.get("path",""), cities_src.get("dialect","auto")),
    cities_src.get("map_columns",{
        "city":["city","miasto"],"voivodeship":["voivodeship","region"],"slug":["slug"],"lang":["lang"]
    })
) if cities_src else []

kw_src = CFG.get("sources",{}).get("keywords_csv",{})
kw_rows = csv_map(
    read_csv(kw_src.get("path",""), kw_src.get("dialect","auto")),
    kw_src.get("map_columns",{
        "lang":["lang"],"term":["term","keyword"],"type":["type"],"weight":["weight"],"anchor":["anchor"]
    })
) if kw_src else []

# ---------------------------- POMOC: wybór szablonu ------------------------
def choose_template(page:Dict[str,Any])->str:
    rules=CFG.get("template_rules",{})
    t=(page.get("type") or "").lower()
    if t and (t in (rules.get("by_type") or {})): return rules["by_type"][t]
    sk=page.get("slugKey") or ""
    if sk and (sk in (rules.get("by_slugKey") or {})): return rules["by_slugKey"][sk]
    sl=page.get("slug") or ""
    for r in (rules.get("by_slug_pattern") or []):
        if re.search(r["match"], sl): return r["template"]
    return CFG["templates"]["page"]

# ---------------------------- PAGES: bazowe --------------------------------
def base_pages()->List[Dict[str,Any]]:
    pages=[]
    for p in CMS.get("pages", []):
        lang=p.get("lang") or DEFAULT_LANG
        slug=p.get("slug","")
        ctx=dict(p)
        ctx["canonical"]=canonical(SITE_URL, lang, slug, p.get("canonical_path"))
        ctx["og_image"]=p.get("og_image") or CFG.get("seo",{}).get("open_graph",{}).get("default_image")
        ctx["body_html"]=p.get("body_html") or md_to_html(p.get("body_md",""))
        if not ctx.get("seo_title"):
            ctx["seo_title"] = (p.get("seo_title") or p.get("title") or p.get("h1") or "")
        if not ctx.get("title"):
            ctx["title"] = (p.get("h1") or ctx["seo_title"])
        ctx["template"]=choose_template(ctx)
        ctx["__from"]="pages"
        pages.append(ctx)
    return pages

# ------------------------ PAGES: city × service ----------------------------
def merge_places()->List[Dict[str,str]]:
    out=[]; seen=set()
    for row in CMS.get("places", []):
        lang=(row.get("lang") or "pl").lower()
        city=row.get("city") or ""
        slug=row.get("slug") or norm_slug(city)
        key=f"{lang}::{slug}"
        if key in seen: continue
        seen.add(key)
        out.append({"lang":lang,"city":city,"voivodeship":row.get("voivodeship") or row.get("region") or "","slug":slug})
    for row in cities_rows:
        lang=(row.get("lang") or "pl").lower()
        city=row.get("city") or ""
        slug=row.get("slug") or norm_slug(city)
        key=f"{lang}::{slug}"
        if key in seen: continue
        seen.add(key)
        out.append({"lang":lang,"city":city,"voivodeship":row.get("voivodeship") or "","slug":slug})
    return out

def generate_city_service()->List[Dict[str,Any]]:
    cfg=CFG.get("collections",{}).get("city_service",{})
    if not cfg: return []
    per_lang = cfg.get("limits",{}).get("perLang", 0)
    max_total= cfg.get("limits",{}).get("maxPages", 0)
    langs    = cfg.get("langs", LOCALES)
    services=[p for p in CMS.get("pages",[]) if (p.get("type")=="service" and p.get("publish",True))]
    places=merge_places()
    out=[]; total=0
    for L in langs:
        used=0
        svcL=[s for s in services if (s.get("lang") or L)==L]
        for svc in svcL:
            svc_slug=svc.get("slug") or norm_slug(svc.get("slugKey") or svc.get("h1") or "service")
            svc_h1=svc.get("h1") or svc.get("title") or svc_slug
            for city in places:
                if (city.get("lang") or L).lower()!=L: continue
                city_slug=city.get("slug") or norm_slug(city.get("city") or "")
                if not city_slug: continue
                slug=norm_slug(f"{svc_slug}-{city_slug}")
                h1=f"{svc_h1} — {city.get('city')}"
                meta=f"Transport i spedycja — {svc_h1} w {city.get('city')}. Wycena w 15 min, kontakt 24/7."
                row={
                    "lang":L,"type":"city_service","slugKey":f"{svc.get('slugKey','service')}__{city_slug}",
                    "slug":slug,"template":choose_template({"type":"city_service","slug":slug}),
                    "publish":True,"h1":h1,"title":h1,"seo_title":f"{h1} | Kras-Trans","meta_desc":meta,
                    "hero_alt":h1,"lead":svc.get("lead") or svc.get("title") or "",
                    "og_image":svc.get("og_image") or CFG.get("seo",{}).get("open_graph",{}).get("default_image"),
                    "canonical_path":f"/{L}/{slug}/",
                    "city":city.get("city"),"voivodeship":city.get("voivodeship") or city.get("region") or "",
                    "service_slug":svc_slug,"service_h1":svc_h1,"__from":"city_service",
                    "body_html":""
                }
                out.append(row); used+=1; total+=1
                if used>=per_lang or total>=max_total: break
            if used>=per_lang or total>=max_total: break
        if total>=max_total: break
    return out

# ------------------------------ SEO / GATES --------------------------------
TITLE_MIN = CFG.get("seo",{}).get("titles",{}).get("min", 30)
TITLE_MAX = CFG.get("seo",{}).get("titles",{}).get("max", 65)
DESC_MIN  = CFG.get("seo",{}).get("descriptions",{}).get("min", 80)
DESC_MAX  = CFG.get("seo",{}).get("descriptions",{}).get("max", 165)
THIN_MIN_CHARS = CFG.get("collections",{}).get("city_service",{}).get("quality",{}).get("thin_min_chars", 400)

def clamp_len(s:str, minL:int, maxL:int)->Tuple[str,List[str]]:
    s=s or ""; warns=[]
    if len(s)<minL: warns.append(f"<{minL}")
    if len(s)>maxL:
        s=s[:maxL].rstrip()
        if not s.endswith("…"): s+="…"
        warns.append(f">{maxL}")
    return s, warns

def apply_quality(page:Dict[str,Any])->Tuple[Dict[str,Any],List[str]]:
    warns=[]
    page["seo_title"], w = clamp_len(page.get("seo_title") or page.get("title") or "", TITLE_MIN, TITLE_MAX); warns+=["title"+x for x in w]
    fallback_desc = text_of(page.get("body_html",""))[:180]
    page["meta_desc"],  w = clamp_len(page.get("meta_desc") or fallback_desc, DESC_MIN, DESC_MAX); warns+=["desc"+x for x in w]
    if not (page.get("h1") or "").strip(): warns.append("missing_h1")
    # thin content – tylko generator
    text_len=len(text_of(page.get("body_html","")))
    if page.get("__from")=="city_service" and text_len<THIN_MIN_CHARS:
        page["noindex"]=True; warns.append(f"thin({text_len})")
    return page, warns

# ------------------------------ JSON-LD ------------------------------------
def jsonld_blocks(page:Dict[str,Any])->List[Dict[str,Any]]:
    ld=[]
    ld.append({"@context":"https://schema.org","@type":"Organization","name":CFG.get("site",{}).get("brand","Kras-Trans"),"url":SITE_URL})
    if (page.get("slugKey")=="home" or (page.get("slug") or "")==""):
        ld.append({"@context":"https://schema.org","@type":"WebSite","name":CFG.get("site",{}).get("brand","Kras-Trans"),
                   "url": SITE_URL + f"/{page.get('lang', DEFAULT_LANG)}/",
                   "potentialAction":{"@type":"SearchAction","target": SITE_URL + "/search?q={query}","query-input":"required name=query"}})
    ld.append({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":CFG.get("site",{}).get("brand","Kras-Trans"),"item":SITE_URL},
        {"@type":"ListItem","position":2,"name":page.get("h1") or page.get("title") or page.get("slug") or "Page","item":page.get("canonical")}
    ]})
    # FAQ (po slugKey/slug)
    fq=[]
    lang=page.get("lang")
    need_keys = ((page.get("slugKey") or "").lower(), (page.get("slug") or "").lower())
    for f in CMS.get("faq", []):
        lang_f=(f.get("lang") or lang).lower()
        key=(f.get("page_slug") or f.get("slugKey") or "").lower()
        if lang_f==lang and key in need_keys:
            fq.append({"@type":"Question","name":f.get("q",""),"acceptedAnswer":{"@type":"Answer","text":f.get("a","")}})
    if fq: ld.append({"@context":"https://schema.org","@type":"FAQPage","mainEntity":fq[:30]})
    # typowe typy
    t=(page.get("type") or "page").lower()
    if t=="service":
        ld.append({"@context":"https://schema.org","@type":"Service","name":page.get("h1") or page.get("title")})
    if t=="blog_post":
        ld.append({"@context":"https://schema.org","@type":"Article","headline":page.get("h1") or page.get("title"),"mainEntityOfPage":page.get("canonical")})
    if t in ("job","job_post","jobposting"):
        ld.append({"@context":"https://schema.org","@type":"JobPosting","title":page.get("h1") or page.get("title"),
                   "hiringOrganization":{"@type":"Organization","name":CFG.get("site",{}).get("brand","Kras-Trans")}})
    if t=="city_service":
        company = (CMS.get("company") or [{}])[0]
        ld.append({"@context":"https://schema.org","@type":"LocalBusiness",
                   "name": CFG.get("site",{}).get("brand","Kras-Trans")+" - "+(page.get("h1") or ""),
                   "address":{"@type":"PostalAddress","addressLocality":page.get("city",""),"addressCountry":"PL"},
                   "telephone": company.get("telephone") or CFG.get("site",{}).get("contacts",{}).get("phone",""),
                   "url": page.get("canonical")})
    return ld

# ------------------------------ AUTOLINKI ----------------------------------
def fetch_explainer(lang:str)->str:
    blocks = [b for b in CMS.get("blocks", []) if str(b.get("enabled","true")).lower() not in ("false","0","no") and (b.get("type") or b.get("block"))=="explainer"]
    cand=[b for b in blocks if (b.get("lang") or lang).lower()==lang]
    if not cand: cand=blocks
    if not cand: return ""
    pick=cand[hash_stable(lang) % len(cand)]
    body = pick.get("body_md") or pick.get("desc") or pick.get("title") or ""
    return text_of(md_to_html(body))[:600]

def inject_autolinks(html:str, lang:str)->Tuple[str,int,int]:
    rules=[]
    for r in CMS.get("autolinks", []):
        if str(r.get("enabled","true")).lower() in ("false","0","no"): continue
        rules.append({"anchor":(r.get("anchor") or r.get("a") or "").strip(),
                      "href":(r.get("href") or "").strip(),
                      "lang":(r.get("lang") or lang).lower()})
    rules=[r for r in rules if r["anchor"] and r["href"] and r["lang"]==lang]
    if not rules: return html,0,0

    cfg=CFG.get("autolinks",{
        "inline":{"ignoreSelectors":["h1","h2","h3",".hero",".cta",".btn","nav","header","footer",".no-autolink"],"maxPerPage":6,"minDistanceChars":40},
        "fallback":{"enabled":True,"limit":3}
    })
    soup=soupify(html)
    ignore_nodes=set()
    for sel in cfg["inline"]["ignoreSelectors"]:
        for el in soup.select(sel): ignore_nodes.add(el)

    made=0; missed=[]
    pattern_cache={}
    maxN=cfg["inline"]["maxPerPage"]; minDist=cfg["inline"]["minDistanceChars"]

    for r in rules:
        if made>=maxN: break
        anchor=r["anchor"]; href=r["href"]
        found=False
        for p in soup.find_all(["p","li"]):
            if any(p is n or n in p.parents for n in ignore_nodes): continue
            if p.find("a"): continue
            txt=p.get_text()
            if len(txt)>(minDist*2):
                m=re.search(re.escape(anchor), txt, flags=re.IGNORECASE)
                if m and m.start()<minDist: continue
            if anchor not in pattern_cache:
                pattern_cache[anchor]=re.compile(rf"(?<!\w){re.escape(anchor)}(?!\w)", flags=re.IGNORECASE)
            html_p=str(p)
            new=pattern_cache[anchor].sub(f'<a href="{href}" title="{anchor}">{anchor}</a>', html_p, count=1)
            if new!=html_p:
                p.replace_with(soupify(new)); made+=1; found=True; break
        if not found: missed.append(r)

    fb=0
    if cfg["fallback"]["enabled"] and missed:
        cont = soup.find(id="content") or soup.find("article") or soup.body
        if cont:
            title_map={"pl":"Zobacz też","en":"See also","de":"Siehe auch","fr":"Voir aussi","it":"Vedi anche","ru":"См. также","ua":"Див. також"}
            h=soup.new_tag("h3"); h.string = title_map.get(lang,"See also"); cont.append(h)
            wrap=soup.new_tag("div", **{"class":"see-also cards"})
            expl = fetch_explainer(lang)
            for r in missed[:max(0, cfg["fallback"]["limit"]-(made))]:
                card=soup.new_tag("article", **{"class":"tile3d"})
                p=soup.new_tag("p"); p.string = expl or r["anchor"]
                a=soup.new_tag("a", href=r["href"], **{"class":"tile-link"}); a.string=r["anchor"]
                card.append(p); card.append(a); wrap.append(card); fb+=1
            cont.append(wrap)

    set_ext_link_attrs(soup, SITE_URL); set_img_defaults(soup)
    return str(soup), made, fb

# ------------------------------ OG IMAGE (opcja) ---------------------------
def og_image_for(page:Dict[str,Any])->Optional[str]:
    if not PIL_OK: return None
    t=(page.get("type") or "page").lower()
    if t not in ("service","city_service","page"): return None
    if page.get("og_image"): return page["og_image"]
    # generator PNG 1200x630
    w,h=1200,630
    img=Image.new("RGB",(w,h),(11,18,32))
    draw=ImageDraw.Draw(img)
    title=(page.get("h1") or page.get("title") or CFG.get("site",{}).get("brand","Kras-Trans"))[:90]
    sub=(page.get("meta_desc") or "")[:120]
    try:
        font1=ImageFont.truetype("DejaVuSans-Bold.ttf", 60)
        font2=ImageFont.truetype("DejaVuSans.ttf", 32)
    except Exception:
        font1=ImageFont.load_default(); font2=ImageFont.load_default()
    draw.text((60,220), title, fill=(233,237,246), font=font1)
    draw.text((60,320), sub,   fill=(168,179,199), font=font2)
    draw.rectangle([(0,h-10),(w,h)], fill=(34,195,166))
    out=OUT/"og"; out.mkdir(parents=True, exist_ok=True)
    name=f"{norm_slug(page.get('slugKey') or page.get('slug') or 'page')}.png"
    path=out/name; img.save(path, "PNG")
    return f"/og/{name}"

# ------------------------------ HEAD INJECTIONS -----------------------------
def ensure_head_injections(soup:BeautifulSoup, page:Dict[str,Any], hreflang_map:Dict[str,Dict[str,str]]):
    """
    Wstrzykuje: canonical, hreflang, OG/Twitter, GSC, cms-endpoint, GA, JSON-LD (jeśli brak).
    Bez duplikacji. Szanuje istniejące tagi z szablonów.
    """
    head = soup.find("head")
    if not head:
        head = soup.new_tag("head")
        if soup.html:
            soup.html.insert(0, head)
        else:
            soup.insert(0, head)

    def has_selector(sel:str)->bool:
        return bool(head.select_one(sel))

    def add_meta(**attrs):
        if not head.find("meta", attrs=attrs):
            head.append(soup.new_tag("meta", attrs=attrs))

    def add_link(**attrs):
        # unikaj duplikatów
        for link in head.find_all("link"):
            if all(link.get(k) == v for k, v in attrs.items()):
                return
        head.append(soup.new_tag("link", attrs=attrs))

    # canonical
    if page.get("canonical") and not has_selector('link[rel="canonical"]'):
        add_link(rel="canonical", href=page["canonical"])

    # hreflang alternates
    alts = (hreflang_map.get(page.get("slugKey","home"), {}) or {})
    for L, href in alts.items():
        add_link(rel="alternate", hreflang=L, href=href)

    # description
    if (page.get("meta_desc") or "") and not head.find("meta", attrs={"name":"description"}):
        add_meta(name="description", content=page["meta_desc"])

    # OG/Twitter
    og_map = {
        "og:title": page.get("seo_title") or page.get("title") or page.get("h1") or "",
        "og:description": page.get("meta_desc") or "",
        "og:url": page.get("canonical") or "",
        "og:image": page.get("og_image") or CFG.get("seo",{}).get("open_graph",{}).get("default_image",""),
        "og:type": "website" if (page.get("slug","")=="" or page.get("type") in (None,"home","page")) else "article"
    }
    for prop,val in og_map.items():
        if val and not head.find("meta", attrs={"property":prop}):
            head.append(soup.new_tag("meta", attrs={"property":prop, "content":val}))
    if og_map["og:image"] and not head.find("meta", attrs={"name":"twitter:card"}):
        add_meta(name="twitter:card", content="summary_large_image")
    if og_map["og:title"] and not head.find("meta", attrs={"name":"twitter:title"}):
        add_meta(name="twitter:title", content=og_map["og:title"])
    if og_map["og:description"] and not head.find("meta", attrs={"name":"twitter:description"}):
        add_meta(name="twitter:description", content=og_map["og:description"])
    if og_map["og:image"] and not head.find("meta", attrs={"name":"twitter:image"}):
        add_meta(name="twitter:image", content=og_map["og:image"])

    # GSC verification
    if (GSC or "").strip() and not head.find("meta", attrs={"name":"google-site-verification"}):
        add_meta(name="google-site-verification", content=GSC)

    # cms-endpoint
    cms_endpoint = (f"{APPS_URL}?key={APPS_KEY}" if APPS_URL and APPS_KEY else "")
    if cms_endpoint and not head.find("meta", attrs={"name":"cms-endpoint"}):
        add_meta(name="cms-endpoint", content=cms_endpoint)

    # GA (gtag) – wstrzykuj tylko, jeśli w całym dokumencie nie ma już configu
    if (GA_ID or "").strip():
        has_gtm_any = bool(soup.find("script", src=re.compile(r"googletagmanager\.com/gtag/js")))
        has_conf_any = bool(soup.find("script", string=re.compile(r"gtag\('config',\s*['\"]"+re.escape(GA_ID))))
        if not has_gtm_any:
            s = soup.new_tag("script", attrs={"src": f"https://www.googletagmanager.com/gtag/js?id={GA_ID}"})
            s["async"] = "async"
            head.append(s)
        if not has_conf_any:
            conf = soup.new_tag("script")
            conf.string = (
                "window.dataLayer=window.dataLayer||[];"
                "function gtag(){dataLayer.push(arguments);}gtag('js',new Date());"
                f"gtag('config','{GA_ID}',{{anonymize_ip:true}});"
            )
            head.append(conf)

    # JSON-LD – dołóż tylko jeśli w całym dokumencie nie ma ld+json
    if not soup.find("script", attrs={"type":"application/ld+json"}):
        try:
            ld = json.dumps(jsonld_blocks(page), ensure_ascii=False)
            ld_tag = soup.new_tag("script", attrs={"type":"application/ld+json"})
            ld_tag.string = ld
            head.append(ld_tag)
        except Exception:
            pass

# --------- LINK GRAPH (pozostawione jak w starym; może być użyte w szabl.) --
def neighbors_for(city_pages:List[Dict[str,Any]], page:Dict[str,Any], k_region:int, k_alt:int)->List[Dict[str,Any]]:
    lang=page.get("lang")
    region=(page.get("voivodeship") or "").strip().lower()
    city=(page.get("city") or "").strip().lower()
    svc=page.get("service_h1")
    same_region=[p for p in city_pages if p.get("lang")==lang and (p.get("voivodeship","").strip().lower()==region) and (p.get("city","").strip().lower()!=city) and p.get("service_h1")==svc]
    alt_service=[p for p in city_pages if p.get("lang")==lang and (p.get("city","").strip().lower()==city) and p.get("service_h1")!=svc]
    out=same_region[:k_region] + alt_service[:k_alt]
    return out

# ------------------------------ RENDER / BUILD ------------------------------
def build_all():
    pages = base_pages()
    city  = generate_city_service()
    all_pages = pages + city

    hreflang_map = CMS.get("hreflang", {})
    indexables: List[Tuple[str,str,str]] = []
    today=UTC()
    logs=[]
    autolink_inline=0; autolink_fb=0

    # simhash (P4) – wykrywanie duplikatów
    sim_index={}
    dup_warns=0

    # TF-IDF (P3) – z tekstu strony
    tfidf_map={}

    for p in all_pages:
        lang=p.get("lang") or DEFAULT_LANG
        slug=p.get("slug","")
        p["canonical"]=canonical(SITE_URL, lang, slug, p.get("canonical_path"))

        # OG image generator (opcjonalnie; tylko gdy brak)
        gen_og = og_image_for(p)
        if gen_og: p["og_image"]=gen_og

        # SEO gates
        p, warns = apply_quality(p)

        # JSON-LD (przekazany do Jinja, a dodatkowo do-inject po renderze jeśli brak)
        ld_html = '<script type="application/ld+json">'+json.dumps(jsonld_blocks(p), ensure_ascii=False)+'</script>'

        # Render Jinja
        ctx={
            "page": dict(p),
            "hreflang": hreflang_map.get(p.get("slugKey","home"), {}),
            "ctas": {"primary": p.get("cta_label") or "Wycena transportu", "secondary": p.get("cta_secondary","")},
            "jsonld": ld_html,
            "ga_id": GA_ID, "gsc_verification": GSC
        }
        tpl = p.get("template") or choose_template(p)
        try:
            html = env.get_template(pathlib.Path(tpl).name).render(**ctx)
        except TemplateNotFound:
            html = f"<!doctype html><html lang=\"{lang}\"><head><meta charset='utf-8'><title>{p.get('seo_title','')}</title></head><body><h1>{p.get('h1','')}</h1></body></html>"

        # AUTOLINKI + fallback
        html, ai, fb = inject_autolinks(html, lang)
        autolink_inline+=ai; autolink_fb+=fb

        # OSTATECZNY DOM
        soup=soupify(html)
        set_ext_link_attrs(soup, SITE_URL); set_img_defaults(soup)
        ensure_head_injections(soup, p, hreflang_map)

        # TF-IDF prosty
        tfidf_map[p.get("canonical")] = tfidf_keywords(soup.get_text(" ", strip=True))

        # simhash
        sim = simhash(tfidf_map[p.get("canonical")])
        near = [k for k,v in sim_index.items() if hamming(sim,v)<=4]  # bardzo podobne
        if near: warns.append("near-duplicate")
        sim_index[p.get("canonical")] = sim
        if "near-duplicate" in warns: dup_warns += 1

        # ZAPIS
        out_dir = OUT / lang / (slug or "")
        ensure_dir(out_dir)
        (out_dir/"index.html").write_text(str(soup), "utf-8")

        # do sitemap (tylko indexowalne)
        if not p.get("noindex"):
            indexables.append((p["canonical"], p.get("lastmod") or today, p.get("slugKey","home")))

        logs.append(f"{lang}/{slug or ''} [{p.get('__from','pages')}] warns={','.join(warns) if warns else '-'}")

    # Redirect stubs (z CMS.redirects)
    for r in CMS.get("redirects", []):
        src = r.get("from") or r.get("src") or ""
        dst = r.get("to")   or r.get("dst") or ""
        if not src or not dst: continue
        if not src.startswith("/"): src="/"+src
        if not src.endswith("/"): src+="/"
        dest = OUT / src.strip("/")
        ensure_dir(dest)
        write_text(dest/"index.html", f"<!doctype html><meta charset='utf-8'><meta http-equiv='refresh' content='0;url={dst}'><link rel='canonical' href='{dst}'><meta name='robots' content='noindex,follow'><title>Redirect</title>")

    # root redirect index (+ GSC meta + canonical + cms-endpoint)
    root_html = f"""<!doctype html><html lang="{DEFAULT_LANG}"><head><meta charset="utf-8">
<title>{CFG.get('site',{}).get('brand','Kras-Trans')}</title>
<meta name="google-site-verification" content="{GSC}">
<link rel="canonical" href="/{DEFAULT_LANG}/">
<meta name="cms-endpoint" content="{(f'{APPS_URL}?key={APPS_KEY}' if APPS_URL and APPS_KEY else '')}">
<meta http-equiv="refresh" content="0; url=/{DEFAULT_LANG}/">
<script>location.replace('/{DEFAULT_LANG}/');</script>
</head><body></body></html>"""
    write_text(OUT/"index.html", root_html)
    # GSC HTML file verification (drugi, pewny sposób weryfikacji)
    html_file = (CFG.get("constants", {}).get("GSC_HTML_FILE") or "").strip()
    if html_file and html_file.startswith("google") and html_file.endswith(".html"):
        # "google4377ff145fac0f52.html" -> token: "4377ff145fac0f52"
        token = html_file.replace("google", "", 1).removesuffix(".html")
        write_text(OUT / html_file, f"google-site-verification: {token}")



    # 404.html (prosty)
    write_text(OUT/"404.html", "<h1>404</h1><p>Nie znaleziono strony. <a href='/pl/'>Wróć do strony głównej</a>.</p>")

    # robots.txt
    write_text(OUT/"robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")

    # BingSiteAuth.xml
    if BING_USER:
        write_text(OUT/"BingSiteAuth.xml", f'<?xml version="1.0"?><users><user>{BING_USER}</user></users>')

    # IndexNow key file
    if INDEXNOW_KEY and INDEXNOW_KEY.lower()!="change_me_indexnow_key":
        write_text(OUT/f"{INDEXNOW_KEY}.txt", INDEXNOW_KEY)

    # Admin: „Powiadom wyszukiwarki” (POST → Apps Script action=dispatch)
    if (CFG.get("indexing",{}).get("ui_button",{}).get("enabled", False)):
        admin = OUT/"admin"; admin.mkdir(parents=True, exist_ok=True)
        btn = f"""<!doctype html><meta charset="utf-8"><title>Powiadom wyszukiwarki</title>
<h1>Powiadom wyszukiwarki</h1>
<button id="go">Wyślij IndexNow</button><pre id="out"></pre>
<script>
document.getElementById('go').onclick = async () => {{
  const res = await fetch('{APPS_URL}?key={APPS_KEY}&action=dispatch', {{ method: 'POST' }});
  document.getElementById('out').textContent = 'Apps Script: ' + (await res.text());
}};
</script>"""
        write_text(admin/"indexing.html", btn)

    # SITEMAPY
    write_sitemaps(indexables, CMS.get("hreflang", {}))
    if NEWS_ENABLED or (CFG.get("blog",{}).get("news_sitemap",{}).get("enabled", False)):
        write_news_sitemap()

    # SEARCH INDEX (on-site)
    build_search_indexes()

    # FEEDS (RSS/Atom prosty)
    build_feeds()

    # Link-checker (wewnętrzny)
    internal_link_checker()

    # RAPORT
    report = [
        f"[OK] pages={len(pages)} city×service={len(city)} indexable={len(indexables)}",
        f"autolinks_inline={autolink_inline} fallback_cards={autolink_fb}",
        f"near_duplicates_warn={dup_warns}"
    ]
    write_text(OUT/"_reports"/"summary.txt", "\n".join(report))
    print("\n".join(report))
    print("\n".join(logs[:80] + (["…"] if len(logs)>80 else [])))

# ----------------------------- SITEMAPS ------------------------------------
def write_sitemaps(urls: List[Tuple[str, str, str]] | List[Tuple[str, str]] , alternates: Dict[str, Dict[str, str]] | None = None):
    """
    urls: [(loc, lastmod, slugKey?)] – trzeci element może nie wystąpić (wtedy alternates ignorujemy)
    alternates: { slugKey: { 'pl': '...', 'en': '...', ... } }
    """
    alternates = alternates or {}
    # wyciągnij slugKey jeśli jest; ujednolić do 3-elementowej krotki
    norm_urls: List[Tuple[str, str, str]] = []
    for u in urls:
        if len(u) == 3:
            norm_urls.append(u)  # (loc, lastmod, slugKey)
        elif len(u) == 2:
            loc, lastmod = u
            norm_urls.append((loc, lastmod, ""))  # brak slugKey
        else:
            continue

    shard = int(CFG.get("sitemap", {}).get("shard_size", 45000))
    groups = [norm_urls[i:i+shard] for i in range(0, len(norm_urls), shard)]
    index: List[Tuple[str, str]] = []

    for i, g in enumerate(groups or [[]]):
        name = f"sitemap-{i+1}.xml"
        path = OUT / name
        lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
        for loc, lastmod, slugKey in g:
            lines.append("  <url>")
            lines.append(f"    <loc>{loc}</loc>")
            lines.append(f"    <lastmod>{lastmod}</lastmod>")
            # alternates (hreflang) jeśli mamy slugKey i są wpisy
            if slugKey and CFG.get("sitemap", {}).get("include_alternates", True):
                for L, href in (alternates.get(slugKey, {}) or {}).items():
                    lines.append(f'    <xhtml:link rel="alternate" hreflang="{L}" href="{href}"/>')
            lines.append("  </url>")
        lines.append("</urlset>")
        write_text(path, "\n".join(lines))
        index.append((f"{SITE_URL}/{name}", UTC()))

    # index
    idx = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in index:
        idx.append(f"  <sitemap><loc>{loc}</loc><lastmod>{lastmod}</lastmod></sitemap>")
    idx.append("</sitemapindex>")
    write_text(OUT/"sitemap.xml", "\n".join(idx))

# ------------------------------ SEARCH INDEX -------------------------------
def build_search_indexes():
    docs_by_lang={L:[] for L in LOCALES}
    for lang_dir in (OUT).glob("*"):
        if not lang_dir.is_dir(): continue
        L=lang_dir.name
        if L not in LOCALES: continue
        for idx in lang_dir.rglob("index.html"):
            html=read_text(idx)
            s=soupify(html)
            h1=(s.find("h1").get_text(" ",strip=True) if s.find("h1") else "")
            title=(s.find("title").get_text(" ",strip=True) if s.find("title") else "")
            desc=""
            m=s.find("meta", attrs={"name":"description"})
            if m and m.get("content"): desc=m["content"]
            body=s.find("main") or s
            text=body.get_text(" ",strip=True)
            docs_by_lang[L].append({
                "path": "/"+idx.relative_to(OUT).as_posix().replace("index.html",""),
                "title": title, "h1": h1, "desc": desc, "text": text[:6000]
            })
    for L, arr in docs_by_lang.items():
        if not arr: continue
        write_text(OUT/f"search-index-{L}.json", json.dumps(arr, ensure_ascii=False))

# ------------------------------ FEEDS --------------------------------------
def build_feeds():
    posts=[p for p in CMS.get("pages",[]) if p.get("type")=="blog_post"]
    if not posts: return
    brand = CFG.get("site",{}).get("brand","Kras-Trans")
    for L in LOCALES:
        postsL=[p for p in posts if p.get("lang")==L]
        if not postsL: continue
        # RSS
        rss=['<?xml version="1.0" encoding="UTF-8"?>',
             '<rss version="2.0"><channel>',
             f"<title>{brand} – Blog</title>",
             f"<link>{SITE_URL}/{L}/blog/</link>",
             f"<description>Aktualności</description>"]
        for p in postsL[:50]:
            link=canonical(SITE_URL, L, p.get("slug",""), p.get("canonical_path"))
            rss.append("<item>")
            rss.append(f"<title>{(p.get('h1') or p.get('title') or '').strip()}</title>")
            rss.append(f"<link>{link}</link>")
            rss.append(f"<guid>{link}</guid>")
            rss.append(f"<description>{(p.get('meta_desc') or '').strip()}</description>")
            if p.get("date"):
                rss.append(f"<pubDate>{p.get('date')}</pubDate>")
            rss.append("</item>")
        rss.append("</channel></rss>")
        write_text(OUT/L/"feed.xml", "\n".join(rss))

        # Atom
        atom=['<?xml version="1.0" encoding="UTF-8"?>',
              '<feed xmlns="http://www.w3.org/2005/Atom">',
              f"<title>{brand} – Blog</title>",
              f"<link href=\"{SITE_URL}/{L}/blog/\"/>",
              f"<updated>{UTC()}</updated>",
              f"<id>{SITE_URL}/{L}/blog/</id>"]
        for p in postsL[:50]:
            link=canonical(SITE_URL, L, p.get("slug",""), p.get("canonical_path"))
            atom.append("<entry>")
            atom.append(f"<title>{(p.get('h1') or p.get('title') or '').strip()}</title>")
            atom.append(f"<link href=\"{link}\"/>")
            atom.append(f"<id>{link}</id>")
            atom.append(f"<updated>{p.get('date') or UTC()}</updated>")
            atom.append(f"<summary>{(p.get('meta_desc') or '').strip()}</summary>")
            atom.append("</entry>")
        atom.append("</feed>")
        write_text(OUT/L/"atom.xml", "\n".join(atom))

# ------------------------------ LINK-CHECKER -------------------------------
def internal_link_checker():
    all_paths=set()
    for idx in OUT.rglob("index.html"):
        url="/"+idx.relative_to(OUT).as_posix().replace("index.html","")
        all_paths.add(url)
    broken=[]
    for idx in OUT.rglob("index.html"):
        html=read_text(idx)
        s=soupify(html)
        for a in s.find_all("a", href=True):
            href=a["href"]
            if href.startswith("mailto:") or href.startswith("tel:"): continue
            if href.startswith("http"): continue
            if not href.endswith("/"): href=href+"/"
            if href not in all_paths:
                broken.append((str(idx.relative_to(OUT)), href))
    if broken:
        lines=["BROKEN INTERNAL LINKS (first 100):"] + [f"{p} → {h}" for p,h in broken[:100]]
        write_text(OUT/"_reports"/"broken-links.txt", "\n".join(lines))

# ----------------------------- NEWS SITEMAP ---------------------------------
def write_news_sitemap():
    """
    Generuje news-sitemap na podstawie CMS.pages[type=blog_post] w oknie czasowym.
    Działa tylko gdy NEWS_ENABLED=True lub blog.news_sitemap.enabled=True.
    """
    enabled_cfg = bool(CFG.get("blog", {}).get("news_sitemap", {}).get("enabled", False))
    if not (NEWS_ENABLED or enabled_cfg):
        return  # nic do roboty

    window_h = int(CFG.get("blog", {}).get("news_sitemap", {}).get("window_hours", 48))
    limit_dt = datetime.now(timezone.utc) - timedelta(hours=window_h)

    items = []
    for p in CMS.get("pages", []):
        if (p.get("type") == "blog_post") and p.get("date"):
            try:
                dt = datetime.fromisoformat(str(p["date"]).replace("Z", "+00:00"))
                if dt >= limit_dt:
                    loc = canonical(SITE_URL, p.get("lang", "pl"), p.get("slug", ""), p.get("canonical_path"))
                    items.append((loc, dt.isoformat()))
            except Exception:
                pass

    if not items:
        return

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
    ]
    for loc, dt in items:
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append('    <news:news>')
        lines.append('      <news:publication><news:name>Kras-Trans</news:name><news:language>pl</news:language></news:publication>')
        lines.append(f"      <news:publication_date>{dt}</news:publication_date>")
        lines.append("      <news:title>Aktualność</news:title>")
        lines.append("    </news:news>")
        lines.append("  </url>")
    lines.append("</urlset>")

    write_text(OUT / "news-sitemap.xml", "\n".join(lines))


# ------------------------------ MAIN ---------------------------------------
if __name__=="__main__":
    build_all()
