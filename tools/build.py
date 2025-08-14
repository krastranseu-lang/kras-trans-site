#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans — Smart Build MAX
Autor: dla Ilji

NOWOŚCI (2 & 3):
- [UX/UI] Auto CSS: płynna typografia, tokeny odstępów, line-clamp kart, prefers-reduced-motion, utilities.
- [UX/UI] Wymuszanie kontraktu sekcji (H2 + container), heurystyki kart (różnice wysokości -> sugestie).
- [Perf] Preload hero (as=image + imagesrcset/imagesizes) i priority hints.
- [Perf] Generatory AVIF/WEBP + srcset/sizes + width/height, lazy/decoding; fallback gdy AVIF niewspierane.
- [Perf] (Opcjonalnie) RUN_CRITICAL=1 -> npx critical (inline critical CSS do <head>).

Logi:
- dist/build-report.html   — raport do podglądu w przeglądarce
- dist/logs/build.log      — log tekstowy
- dist/logs/build.json     — log strukturalny (np. dla CI)

Zachowanie:
- WARN nie zatrzymuje builda (chyba że STRICT=1).
- FAIL zapisze pliki i raport, a na końcu da exit 1 (chyba że CONTINUE_ON_FAIL=1).

ENV:
  SITE_URL="https://kras-trans.com"
  RUN_CRITICAL=1     # inline critical CSS (wymaga Node i 'critical')
  RUN_LHCI=1         # Lighthouse CI (opcjonalnie)
  RUN_AXE=1          # axe-core (opcjonalnie, wymaga podania URL serwowanej dist/)
  RUN_VR=1           # Playwright Visual Regression (opcjonalnie)
  STRICT=1           # traktuj WARN jak FAIL
  CONTINUE_ON_FAIL=1 # nie przerywaj nawet przy FAIL
"""

import os, sys, re, json, gzip, shutil, hashlib, time, subprocess, base64
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
from urllib.parse import urlparse

from jinja2 import Environment, FileSystemLoader, select_autoescape
from bs4 import BeautifulSoup

# Opcjonalne formaty obrazów
try:
    from PIL import Image
except Exception:
    Image = None

# Parsery danych
try:
    import yaml
except Exception:
    yaml = None

# Minifikatory
try:
    import htmlmin
except Exception:
    htmlmin = None
try:
    from rcssmin import cssmin
except Exception:
    cssmin = None
try:
    from jsmin import jsmin
except Exception:
    jsmin = None

ROOT = Path(__file__).parent.resolve()
SRC  = ROOT
TPL  = SRC / "templates"
DATA = SRC / "data"
ASSETS = SRC / "assets"
DIST = ROOT / "dist"
LOGS = DIST / "logs"

SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
RUN_CRIT = os.getenv("RUN_CRITICAL","0") in ("1","true","TRUE")
RUN_LHCI = os.getenv("RUN_LHCI","0") in ("1","true","TRUE")
RUN_AXE  = os.getenv("RUN_AXE","0")  in ("1","true","TRUE")
RUN_VR   = os.getenv("RUN_VR","0")   in ("1","true","TRUE")
STRICT   = os.getenv("STRICT","0")   in ("1","true","TRUE")
NOFAIL   = os.getenv("CONTINUE_ON_FAIL","0") in ("1","true","TRUE")

# White-lista hostów (iframe + fetch)
ALLOWED_WIDGET_HOSTS = {
    "www.google.com", "calendar.google.com",
    "www.youtube.com", "player.vimeo.com",
    "maps.google.com", "www.openstreetmap.org",
    # dopisz swoje hosty:
    "kras-trans.com", "www.kras-trans.com",
    "widgets.kras-trans.com", "cdn.kras-trans.com"
}

# Budżety (gzip)
BUDGETS = {
    "html_gzip_kb": 40,
    "css_critical_gzip_kb": 50,
    "js_init_gzip_kb": 70,
    "hero_img_kb": 180,
}

# Obrazy: warianty
IMG_SIZES = [320, 480, 640, 800, 1024, 1280, 1600]
IMG_QUAL  = 82

REPORTS: List[Tuple[str,str]] = []
FAIL_HAPPENED = False

# ---------------- log/raport ----------------
def _ensure_dirs():
    DIST.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)

def log(kind: str, msg: str):
    global FAIL_HAPPENED
    k = kind.upper()
    if k == "FAIL":
        FAIL_HAPPENED = True
    REPORTS.append((k, msg))
    prefix = {"OK":"✅","WARN":"⚠️","FAIL":"❌"}.get(k,"•")
    print(f"{prefix} {msg}")

def write_logs():
    rows = "\n".join(f"<tr class='{k.lower()}'><td>{k}</td><td>{msg}</td></tr>" for k,msg in REPORTS)
    (DIST/"build-report.html").write_text(f"""<!doctype html>
<html lang="pl"><meta charset="utf-8">
<title>Build Report</title>
<style>
body{{font:14px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;max-width:1200px;margin:auto}}
table{{border-collapse:collapse;width:100%;border:1px solid #e5e7eb}}
td,th{{border-top:1px solid #e5e7eb;padding:8px 10px;vertical-align:top}}
td:first-child{{width:90px;text-transform:uppercase;font-weight:700;letter-spacing:.03em}}
tr:nth-child(even){{background:#fafafa}}
.ok{{color:#0a7}} .warn{{color:#c80}} .fail{{color:#d33}}
</style>
<h1>Raport builda</h1>
<table><tbody>
{rows}
</tbody></table>
</html>""", encoding="utf-8")
    (LOGS/"build.log").write_text("\n".join(f"[{k}] {m}" for k,m in REPORTS), encoding="utf-8")
    (LOGS/"build.json").write_text(json.dumps(REPORTS, ensure_ascii=False, indent=2), encoding="utf-8")

# ---------------- utils ----------------
def gzip_size_bytes(p: Path) -> int:
    if not p.exists(): return 0
    with open(p, "rb") as f:
        return len(gzip.compress(f.read()))

def is_external_url(href: str) -> bool:
    try:
        u = urlparse(href)
        return bool(u.scheme and u.netloc)
    except Exception:
        return False

def host_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""

def tojson(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)

# ---------------- data ----------------
def load_data() -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    if not DATA.exists():
        log("WARN", "Brak katalogu data/ – wyrenderuję stronę domyślną /pl/")
        return ctx
    for p in DATA.rglob("*"):
        if p.suffix.lower() in (".json",".yml",".yaml"):
            try:
                with p.open("r", encoding="utf-8") as f:
                    obj = json.load(f) if p.suffix.lower()==".json" else (yaml and yaml.safe_load(f))
                if obj is None and p.suffix.lower()!=".json":
                    log("WARN", f"Brak PyYAML – pomijam {p.name}")
                    continue
                ctx[p.stem] = obj
            except Exception as e:
                log("FAIL", f"Błąd danych {p.relative_to(DATA)}: {e}")
    return ctx

# ---------------- render ----------------
def render_site(context: Dict[str, Any]):
    env = Environment(
        loader=FileSystemLoader(str(TPL)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True, lstrip_blocks=True
    )
    env.filters["tojson"] = tojson
    env.globals["SITE_URL"] = SITE_URL
    env.globals["ALLOWED_WIDGET_HOSTS"] = ALLOWED_WIDGET_HOSTS
    env.globals["now"] = time.strftime("%Y-%m-%d")

    pages = context.get("pages") or []
    if not isinstance(pages, list) or not pages:
        pages = [{"lang":"pl","slug":"","template":"page.html","slugKey":"home"}]

    copy_assets_minify_sri()

    for page in pages:
        lang = (page.get("lang") or "pl").lower()
        slug = page.get("slug") or ""
        tpl_name = page.get("template") or "page.html"
        out_dir = DIST / lang / (slug if slug else "")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "index.html"

        html = env.get_template(tpl_name).render(
            **dict(context, page=page, samekey=page.get("slugKey") or slug or "home")
        )

        html = postprocess_html(html, out_dir)  # + auto-fixes + preload hero
        out_file.write_text(html, encoding="utf-8")
        log("OK", f"Wygenerowano {out_file.relative_to(DIST)}")

    generate_sitemap_and_robots(pages)

# ---------------- assets: copy + minify + SRI ----------------
def copy_assets_minify_sri():
    if ASSETS.exists():
        shutil.copytree(ASSETS, DIST / "assets", dirs_exist_ok=True)
        log("OK","Skopiowano /assets")
    else:
        log("WARN","Brak assets/")

    # minify CSS/JS lokalnych
    for css in (DIST/"assets").rglob("*.css"):
        if cssmin:
            try: css.write_text(cssmin(css.read_text(encoding="utf-8")), encoding="utf-8")
            except Exception as e: log("WARN", f"CSS minify {css.name}: {e}")
    for js in (DIST/"assets").rglob("*.js"):
        if jsmin:
            try: js.write_text(jsmin(js.read_text(encoding="utf-8")), encoding="utf-8")
            except Exception as e: log("WARN", f"JS minify {js.name}: {e}")

    # mapa SRI dla lokalnych CSS/JS/WOFF2 (BASE64!)
    sri_map = {}
    for p in list((DIST/"assets").rglob("*.css")) + list((DIST/"assets").rglob("*.js")) + list((DIST/"assets").rglob("*.woff2")):
        try:
            sri_map["/" + str(p.relative_to(DIST)).replace("\\","/")] = calc_sri(p)
        except Exception as e:
            log("WARN", f"SRI {p.name}: {e}")
    (DIST/"sri-map.json").write_text(json.dumps(sri_map, ensure_ascii=False, indent=2), encoding="utf-8")
    log("OK","Obliczono SRI")

def calc_sri(path: Path) -> str:
    h = hashlib.sha384()
    with open(path, "rb") as f:
        h.update(f.read())
    return "sha384-" + base64.b64encode(h.digest()).decode()

# ---------------- images helpers ----------------
def local_image_path(src_url: str, page_dir: Path) -> Optional[Path]:
    if is_external_url(src_url): return None
    src = src_url.split("?")[0].split("#")[0]
    return ((ROOT / src.lstrip("/")) if src.startswith("/") else (page_dir / src).resolve())

def generate_responsive_images(img_path: Path) -> Tuple[List[str], List[str], Optional[str], Tuple[int,int]]:
    """Return (srcset_avif, srcset_webp, smallest_webp, (orig_w,h))"""
    if Image is None or not img_path.exists(): return [], [], None, (0,0)
    try:
        im = Image.open(img_path)
    except Exception:
        return [], [], None, (0,0)
    width, height = im.size
    sizes = [w for w in IMG_SIZES if w <= width] or [width]
    avif, webp = [], []
    smallest_webp = None

    out_base = DIST / img_path.relative_to(ROOT).parent
    out_base.mkdir(parents=True, exist_ok=True)

    for fmt in ("AVIF","WEBP"):
        for w in sizes:
            h = int(max(1, round(height * (w/width))))
            try:
                im2 = im.copy().resize((w,h), Image.LANCZOS)
            except Exception:
                continue
            out = out_base / f"{img_path.stem}-{w}.{ 'avif' if fmt=='AVIF' else 'webp' }"
            try:
                if fmt == "AVIF":
                    try:
                        im2.save(out, format="AVIF", quality=IMG_QUAL, effort=4)
                        avif.append("/" + str(out.relative_to(DIST)).replace("\\","/") + f" {w}w")
                    except Exception:
                        if not avif: log("WARN","AVIF niedostępny – użyję tylko WEBP")
                else:
                    im2.save(out, format="WEBP", quality=IMG_QUAL, method=6)
                    u = "/" + str(out.relative_to(DIST)).replace("\\","/") + f" {w}w"
                    webp.append(u)
                    if w == min(sizes) and smallest_webp is None:
                        smallest_webp = u.split()[0]
            except Exception:
                continue

    return avif, webp, smallest_webp, (width, height)

# ---------------- auto CSS (UX/UI) ----------------
AUTO_CSS_PATH = Path("assets/css/auto-fixes.css")

def generate_auto_css() -> str:
    """Lekki, uniwersalny pakiet płynnej typografii + utilities."""
    return """
/* ======== auto-fixes.css (gen by build) ======== */
:root{
  --maxw:1200px;
  --space-1:clamp(4px,0.2rem + 0.2vw,8px);
  --space-2:clamp(8px,0.4rem + 0.3vw,12px);
  --space-3:clamp(12px,0.6rem + 0.5vw,16px);
  --space-4:clamp(16px,0.8rem + 0.8vw,24px);
  --space-5:clamp(24px,1rem + 1.2vw,32px);
  --space-6:clamp(32px,1.25rem + 2vw,56px);
  --radius-2:12px;
  --shadow-1:0 1px 2px rgba(0,0,0,.06),0 3px 8px rgba(0,0,0,.10);
  --shadow-2:0 12px 30px rgba(0,0,0,.18);
}

html{font-size:clamp(15px,0.6vw + 14px,18px);line-height:1.5;text-size-adjust:100%}
h1{font-size:clamp(28px,3.2vw,44px);line-height:1.15}
h2{font-size:clamp(22px,2.4vw,32px);line-height:1.2;margin:0 0 var(--space-3)}
h3{font-size:clamp(18px,1.6vw,24px);line-height:1.25}
p{max-width:75ch}

.section{padding:var(--space-6) 0}
.container.text{max-width:var(--maxw);margin:0 auto;padding:0 var(--space-4)}

/* karty: wyrównanie wysokości opisów */
.cards .card{border-radius:var(--radius-2); box-shadow:var(--shadow-1);}
.cards .card .pad{display:flex;flex-direction:column;height:100%}
.cards .card p{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;-webkit-line-clamp:3}

/* prefers-reduced-motion: mniej animacji */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}
}

/* drobne utilities */
.center{margin-left:auto;margin-right:auto}
.stack>*+*{margin-top:var(--space-3)}
.line-clamp-2{-webkit-line-clamp:2}
.line-clamp-3{-webkit-line-clamp:3}
.line-clamp-4{-webkit-line-clamp:4}

/* hero obraz: zapobiegnij CLS (fallback gdy HTML nie ma width/height) */
.hero-media{aspect-ratio:21/9;display:block;border-radius:var(--radius-2)}
"""

def ensure_auto_css_and_link(soup: BeautifulSoup):
    """Zapisuje auto-fixes.css do dist i podłącza <link> w <head> z SRI."""
    css_text = generate_auto_css()
    out_css = DIST / AUTO_CSS_PATH
    out_css.parent.mkdir(parents=True, exist_ok=True)
    out_css.write_text(css_text, encoding="utf-8")

    # Minify + SRI
    if cssmin:
        try: out_css.write_text(cssmin(out_css.read_text(encoding="utf-8")), encoding="utf-8")
        except Exception: pass
    sri = calc_sri(out_css)
    href = "/" + str(out_css.relative_to(DIST)).replace("\\","/")

    head = soup.head or soup.find("head")
    if not head: return
    # Jeżeli już istnieje taki link — pomiń
    for l in head.find_all("link", rel=True, href=True):
        if l["href"] == href: return
    # Wstrzyknij <link> za istniejącym głównym stylem
    link = soup.new_tag("link", rel="stylesheet", href=href)
    link["integrity"] = sri
    link["crossorigin"] = "anonymous"
    head.append(link)

# ---------------- HTML postprocess ----------------
def postprocess_html(html: str, page_dir: Path) -> str:
    soup = BeautifulSoup(html, "html.parser")

    # 1) IMG: wymiary, srcset/sizes, wydajność + hero preload
    hero_preload = None  # (href, imagesrcset, imagesizes)
    hero_done = False

    for img in list(soup.find_all("img")):
        src = img.get("src")
        if not src: 
            continue

        # Atrybuty wydajności
        img.setdefault("loading", "lazy")
        img.setdefault("decoding", "async")

        is_hero = "hero-media" in (img.get("class") or [])
        if is_hero and not hero_done:
            img["fetchpriority"] = "high"
            img["loading"] = "eager"

        p = local_image_path(src, page_dir)
        if p and p.exists():
            # Wymiary
            if Image:
                try:
                    with Image.open(p) as im:
                        w,h = im.size
                        img.setdefault("width", str(w))
                        img.setdefault("height", str(h))
                except Exception:
                    pass

            # picture + srcset
            avif, webp, smallest_webp, _orig = generate_responsive_images(p)
            if (avif or webp) and (img.parent and img.parent.name != "picture"):
                picture = soup.new_tag("picture")
                if avif:
                    s = soup.new_tag("source")
                    s["type"] = "image/avif"
                    s["srcset"] = ", ".join(sorted(avif, key=lambda x:int(x.split()[-1][:-1])))
                    s["sizes"] = "(max-width: 1200px) 100vw, 1200px"
                    picture.append(s)
                if webp:
                    s = soup.new_tag("source")
                    s["type"] = "image/webp"
                    s["srcset"] = ", ".join(sorted(webp, key=lambda x:int(x.split()[-1][:-1])))
                    s["sizes"] = "(max-width: 1200px) 100vw, 1200px"
                    picture.append(s)
                    img["srcset"] = s["srcset"]
                    img["sizes"]  = s["sizes"]
                if smallest_webp:
                    img["src"] = smallest_webp
                img.wrap(picture)

                if is_hero and not hero_done:
                    hero_preload = (smallest_webp or img["src"], img.get("srcset",""), img.get("sizes","(max-width: 1200px) 100vw, 1200px"))
                    hero_done = True

    # 1b) PRELOAD HERO
    if hero_preload:
        href, imagesrcset, imagesizes = hero_preload
        head = soup.head or soup.find("head")
        if head:
            # Jeśli nie ma istniejącego preloadu na ten href
            has = any(l.get("rel")==["preload"] and l.get("as")=="image" for l in head.find_all("link"))
            if not has:
                l = soup.new_tag("link", rel="preload")
                l["as"] = "image"
                l["href"] = href
                if imagesrcset:
                    l["imagesrcset"] = imagesrcset
                    l["imagesizes"]  = imagesizes
                head.append(l)
                log("OK","Dodano preload hero image")

    # 2) SRI: wstaw integrity dla lokalnych CSS/JS (z dist/sri-map.json)
    sri_map = {}
    try:
        sri_map = json.loads((DIST/"sri-map.json").read_text(encoding="utf-8"))
    except Exception:
        pass
    for tag in soup.find_all(["script","link"]):
        if tag.name == "script" and tag.get("src"):
            href = tag["src"]
            if not is_external_url(href) and href in sri_map:
                tag["integrity"]   = sri_map[href]
                tag["crossorigin"] = "anonymous"
        if tag.name == "link" and tag.get("href"):
            rel = " ".join(tag.get("rel") or [])
            if ("stylesheet" in rel) or ("preload" in rel and tag.get("as")=="font"):
                href = tag["href"]
                if not is_external_url(href) and href in sri_map:
                    tag["integrity"]   = sri_map[href]
                    tag["crossorigin"] = "anonymous"

    # 3) Linki zewnętrzne: bezpieczeństwo
    for a in soup.find_all("a", href=True):
        if is_external_url(a["href"]) and a.get("target") == "_blank":
            rel = set((a.get("rel") or []))
            rel.update(["noopener","noreferrer"])
            a["rel"] = " ".join(rel)

    # 4) JSON-LD sanity
    for sc in soup.find_all("script", attrs={"type":"application/ld+json"}):
        try:
            data = json.loads(sc.string or "{}")
            _validate_jsonld(data)
        except Exception as e:
            log("WARN", f"JSON-LD parse: {e}")

    # 5) Whitelist widgetów
    for iframe in soup.find_all("iframe", src=True):
        host = host_of(iframe["src"])
        if host and host not in ALLOWED_WIDGET_HOSTS:
            log("FAIL", f"IFRAME host '{host}' nie jest na ALLOWED_WIDGET_HOSTS")
    for emb in soup.select("[data-embed-src]"):
        host = host_of(emb.get("data-embed-src",""))
        if host and host not in ALLOWED_WIDGET_HOSTS:
            log("FAIL", f"Widget host '{host}' nie jest na ALLOWED_WIDGET_HOSTS")

    # 6) A11y/HTML + kontrakt sekcji
    _a11y_min_checks(soup)
    _hreflang_sanity(soup)
    _section_contract_checks(soup)

    # 7) Link checker (wewnętrzne)
    _link_checker(soup)

    # 8) Auto CSS (UX/UI 2): płynna typografia, line-clamp, utilities
    ensure_auto_css_and_link(soup)

    # 9) Minifikacja HTML
    out_html = str(soup)
    if htmlmin:
        try:
            out_html = htmlmin.minify(out_html, remove_comments=True, remove_optional_attribute_quotes=False)
        except Exception as e:
            log("WARN", f"HTML minify: {e}")
    return out_html

# ---------------- walidatory ----------------
def _validate_jsonld(data: Any):
    def ensure(obj, key, path):
        if key not in obj or obj[key] in (None,"",[],{}):
            raise ValueError(f"Brak '{key}' w JSON-LD ({path})")

    if isinstance(data, dict) and data.get("@type"):
        t = data["@type"]
        if t == "FAQPage":
            ensure(data,"mainEntity","FAQPage")
        elif t == "BlogPosting":
            for k in ("headline","mainEntityOfPage","publisher"):
                ensure(data,k,"BlogPosting")
        elif t == "Product":
            ensure(data,"aggregateRating","Product")
        elif t == "JobPosting":
            ensure(data,"title","JobPosting")
    elif isinstance(data, dict) and data.get("@graph"):
        for n in data["@graph"]:
            if isinstance(n, dict) and n.get("@type"):
                _validate_jsonld(n)

def _a11y_min_checks(soup: BeautifulSoup):
    h1 = soup.find_all("h1")
    if len(h1)!=1: log("WARN", f"H1 na stronie: {len(h1)} (zalecane: 1)")
    for img in soup.find_all("img"):
        if not img.has_attr("alt"):
            log("WARN","<img> bez alt")
    for nav in soup.find_all("nav"):
        if not nav.get("aria-label"):
            log("WARN","<nav> bez aria-label")

def _hreflang_sanity(soup: BeautifulSoup):
    alts = soup.find_all("link", attrs={"rel":"alternate"})
    langs = [a.get("hreflang") for a in alts if a.get("hreflang")]
    if "x-default" not in langs: log("WARN","Brak hreflang='x-default'")
    hrefs = [a.get("href") for a in alts if a.get("href")]
    if len(hrefs) != len(set(hrefs)): log("WARN","Duplikaty linków hreflang")

def _section_contract_checks(soup: BeautifulSoup):
    """Lekki kontrakt: każda <section> powinna mieć H2 w .container.text."""
    for sec in soup.find_all("section"):
        title_ok = bool(sec.select_one(".container.text h2"))
        if not title_ok:
            sec_id = sec.get("id") or "(bez id)"
            log("WARN", f"Sekcja {sec_id}: brak H2 w .container.text")

def _link_checker(soup: BeautifulSoup):
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("#"):
            anchor = href[1:]
            if anchor and not soup.find(id=anchor):
                log("WARN", f"Anchor #{anchor} może nie istnieć")
            continue
        if is_external_url(href): continue
        clean = href.split("?")[0].split("#")[0]
        target = (DIST / clean.lstrip("/")).resolve()
        if target.is_dir():
            if not (target/"index.html").exists():
                log("WARN", f"Link {href} -> katalog bez index.html")
        elif not target.exists():
            if not (DIST / clean.lstrip("/")).exists():
                log("WARN", f"Brak zasobu: {href}")

# ---------------- sitemap/robots ----------------
def generate_sitemap_and_robots(pages: List[Dict[str,Any]]):
    urls = []
    for p in pages:
        lang = (p.get("lang") or "pl").lower()
        slug = p.get("slug") or ""
        urls.append(f"{SITE_URL}/{lang}/" + (f"{slug}/" if slug else ""))
    urls = sorted(set(urls))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm += ["<url>", f"<loc>{u}</loc>", f"<lastmod>{time.strftime('%Y-%m-%d')}</lastmod>", "</url>"]
    sm += ["</urlset>"]
    (DIST/"sitemap.xml").write_text("\n".join(sm), encoding="utf-8")
    (DIST/"robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
    log("OK","Wygenerowano sitemap.xml + robots.txt")

# ---------------- budżety ----------------
def budgets_and_report():
    for p in DIST.rglob("*.html"):
        kb = gzip_size_bytes(p)/1024.0
        if kb > BUDGETS["html_gzip_kb"]:
            log("WARN", f"HTML {p.relative_to(DIST)} = {kb:.1f} KB gzip (> {BUDGETS['html_gzip_kb']} KB)")
    crit = list(DIST.rglob("*critical*.css"))
    if crit:
        total = sum(gzip_size_bytes(x) for x in crit)/1024.0
        if total > BUDGETS["css_critical_gzip_kb"]:
            log("WARN", f"Critical CSS = {total:.1f} KB gzip (> {BUDGETS['css_critical_gzip_kb']} KB)")
    init_js = list(DIST.rglob("*init*.js")) + list(DIST.rglob("kras-global.js"))
    if init_js:
        total = sum(gzip_size_bytes(x) for x in init_js)/1024.0
        if total > BUDGETS["js_init_gzip_kb"]:
            log("WARN", f"Init JS = {total:.1f} KB gzip (> {BUDGETS['js_init_gzip_kb']} KB)")
    heros = list(DIST.rglob("assets/media/hero*"))
    if heros:
        biggest = max(heros, key=lambda p: p.stat().st_size)
        kb = biggest.stat().st_size/1024.0
        if kb > BUDGETS["hero_img_kb"]:
            log("WARN", f"Hero {biggest.name} = {kb:.0f} KB (> {BUDGETS['hero_img_kb']} KB)")

# ---------------- opcjonalne narzędzia Node ----------------
def run_critical_inline():
    if not RUN_CRIT:
        log("OK","Critical CSS pominięty (RUN_CRITICAL=1 aby włączyć)")
        return
    # Podejdź per plik HTML – critical sam inline'uje i zapisuje
    htmls = list(DIST.rglob("*.html"))
    if not htmls:
        return
    for h in htmls:
        rel = "/" + str(h.relative_to(DIST)).replace("\\","/")
        try:
            subprocess.run([
                "npx","critical",
                "--inline","--rebase",
                "--base", str(DIST),
                "--src",  rel,
                "--target", rel,
                "--width","1300","--height","900"
            ], check=True)
            log("OK", f"Critical CSS inline: {rel}")
        except Exception as e:
            log("WARN", f"critical ({rel}): {e}")

def run_lhci():
    if not RUN_LHCI:
        log("OK","LHCI pominięty (RUN_LHCI=1 aby włączyć)")
        return
    try:
        subprocess.run(["npx","@lhci/cli","autorun","--config=./lighthouserc.json"], check=True)
        log("OK","Lighthouse CI zakończony")
    except Exception as e:
        log("WARN", f"LHCI błąd/niedostępny: {e}")

def run_axe():
    if not RUN_AXE:
        log("OK","axe-core pominięty (RUN_AXE=1 aby włączyć)")
        return
    try:
        subprocess.run(["npx","axe","http://localhost:4173/pl/","--quiet"], check=True)
        log("OK","axe-core zakończony")
    except Exception as e:
        log("WARN", f"axe-core błąd: {e}")

def run_visual():
    if not RUN_VR:
        log("OK","Playwright VR pominięty (RUN_VR=1 aby włączyć)")
        return
    try:
        subprocess.run(["npx","playwright","test","-c","playwright.config.ts"], check=True)
        log("OK","Playwright VR zakończony")
    except Exception as e:
        log("WARN", f"Playwright błąd: {e}")

# ---------------- CLI ----------------
def clean():
    if DIST.exists(): shutil.rmtree(DIST)
    _ensure_dirs()

def build():
    clean()
    ctx = load_data()
    render_site(ctx)
    budgets_and_report()
    write_logs()
    run_critical_inline()
    run_lhci(); run_axe(); run_visual()

    if FAIL_HAPPENED or (STRICT and any(k=="WARN" for k,_ in REPORTS)):
        if NOFAIL:
            log("WARN","Były błędy/ostrzeżenia, ale CONTINUE_ON_FAIL=1 – nie przerywam.")
        else:
            sys.exit(1)

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv)>1 else "build"
    if cmd=="clean": clean()
    elif cmd=="build": build()
    else:
        print("Użycie: python build.py [build|clean]")
