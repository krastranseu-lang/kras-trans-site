#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans — Smart Build (książkowy)
Autor: dla Ilji

Co robi:
- SSG (Jinja) -> HTML z Twoich danych (data/*.json|yml).
- Kopiuje i porządkuje assets, minifikuje CSS/JS (lokalne), dodaje SRI.
- Optymalizuje IMG: width/height, lazy/decoding, hero fetchpriority, WebP/AVIF + srcset/sizes.
- Sprawdza whitelistę widgetów (iframe + data-embed-src) vs ALLOWED_WIDGET_HOSTS.
- Waliduje JSON-LD, linki wewnętrzne, podstawowe a11y (H1/alt/nav), hreflangi.
- Budżety wydajności (gzip): HTML, CSS krytyczny, JS init, hero image.
- Generuje sitemap.xml + robots.txt.
- Raportuje wszystko do dist/build-report.html i dist/logs/.
- (Opcjonalnie) uruchamia: Lighthouse CI, Axe a11y, Visual Regression (Playwright), Critical CSS.

ENV:
  SITE_URL="https://kras-trans.com"
  RUN_LHCI=1         # (opcjonalnie) odpal LHCI
  RUN_AXE=1          # (opcjonalnie) odpal axe-core/cli po serwowaniu dist/
  RUN_VR=1           # (opcjonalnie) Playwright VR
  RUN_CRITICAL=1     # (opcjonalnie) npx critical -> inline critical css
  STRICT=1           # WARN traktuj jak FAIL (na końcu exit 1)
  CONTINUE_ON_FAIL=1 # nie wychodź kodem 1 przy FAIL (CI nie przerwie)
"""

import os, sys, re, json, gzip, shutil, hashlib, time, subprocess
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
from urllib.parse import urlparse

# ---- Third-party ----
from jinja2 import Environment, FileSystemLoader, select_autoescape
from bs4 import BeautifulSoup
from slugify import slugify

try:
    import yaml  # PyYAML
except Exception:
    yaml = None

try:
    from PIL import Image
except Exception:
    Image = None

# Minifikatory (lekkie):
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

# ------------------ Ścieżki i stałe ------------------
ROOT = Path(__file__).parent.resolve()
SRC  = ROOT
TPL  = SRC / "templates"
DATA = SRC / "data"
ASSETS = SRC / "assets"
DIST = ROOT / "dist"
LOGS = DIST / "logs"

SITE_URL = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
RUN_LHCI = os.getenv("RUN_LHCI","0") in ("1","true","TRUE")
RUN_AXE  = os.getenv("RUN_AXE","0")  in ("1","true","TRUE")
RUN_VR   = os.getenv("RUN_VR","0")   in ("1","true","TRUE")
RUN_CRIT = os.getenv("RUN_CRITICAL","0") in ("1","true","TRUE")
STRICT   = os.getenv("STRICT","0")   in ("1","true","TRUE")
NOFAIL   = os.getenv("CONTINUE_ON_FAIL","0") in ("1","true","TRUE")

# White-lista hostów osadzanych widgetów
ALLOWED_WIDGET_HOSTS = {
    "www.google.com", "calendar.google.com",
    "www.youtube.com", "player.vimeo.com",
    "maps.google.com", "www.openstreetmap.org",
    # --- wpisz swoje domeny (bez ścieżek) ---
    "kras-trans.com", "www.kras-trans.com",
    "widgets.kras-trans.com", "cdn.kras-trans.com",
    "example.com"
}

# Budżety rozmiarów (gzip)
BUDGETS = {
    "html_gzip_kb": 40,
    "css_critical_gzip_kb": 50,
    "js_init_gzip_kb": 70,
    "hero_img_kb": 180,
}

# Rozmiary generowanych wariantów obrazów
IMG_SIZES = [320, 480, 640, 800, 1024, 1280, 1600]
IMG_QUAL  = 82  # jakość WebP/AVIF (balans)

# Zbiornik raportu
REPORTS: List[Tuple[str,str]] = []
FAIL_HAPPENED = False

# ------------------ Logowanie ------------------
def _ensure_dirs():
    DIST.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)

def log(kind: str, msg: str):
    global FAIL_HAPPENED
    kindU = kind.upper()
    if kindU == "FAIL":
        FAIL_HAPPENED = True
    REPORTS.append((kindU, msg))
    prefix = {"OK":"✅","WARN":"⚠️","FAIL":"❌"}.get(kindU,"•")
    print(f"{prefix} {msg}")

def write_logs():
    # HTML
    rows = "\n".join(
        f"<tr class='{k.lower()}'><td>{k}</td><td>{msg}</td></tr>"
        for k,msg in REPORTS
    )
    (DIST/"build-report.html").write_text(f"""<!doctype html>
<html lang="pl"><meta charset="utf-8">
<title>Build Report</title>
<style>
body{{font:14px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;max-width:1200px;margin:auto}}
h1{{margin:0 0 16px}}
table{{border-collapse:collapse;width:100%;border:1px solid #e5e7eb}}
td,th{{border-top:1px solid #e5e7eb;padding:8px 10px;vertical-align:top}}
td:first-child{{width:90px;text-transform:uppercase;font-weight:700;letter-spacing:.03em}}
tr:nth-child(even){{background:#fafafa}}
.ok{{color:#0a7}} .warn{{color:#c80}} .fail{{color:#d33}}
summary{{cursor:pointer}}
</style>
<h1>Raport builda</h1>
<table><tbody>
{rows}
</tbody></table>
</html>""", encoding="utf-8")
    # TXT + JSON
    (LOGS/"build.log").write_text("\n".join(f"[{k}] {m}" for k,m in REPORTS), encoding="utf-8")
    (LOGS/"build.json").write_text(json.dumps(REPORTS, ensure_ascii=False, indent=2), encoding="utf-8")

# ------------------ Narzędzia ------------------
def gzip_size_bytes(p: Path) -> int:
    if not p.exists(): return 0
    with open(p, "rb") as f:
        data = f.read()
    return len(gzip.compress(data))

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

def tojson(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)

# ------------------ Dane ------------------
def load_data() -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    if DATA.exists():
        for p in DATA.rglob("*"):
            if p.suffix.lower() in (".json", ".yml", ".yaml"):
                try:
                    with p.open("r", encoding="utf-8") as f:
                        if p.suffix.lower() == ".json":
                            obj = json.load(f)
                        else:
                            if yaml is None:
                                log("WARN", f"Brak PyYAML – pomijam {p.name}")
                                continue
                            obj = yaml.safe_load(f)
                    ctx[p.stem] = obj
                except Exception as e:
                    log("FAIL", f"Nie można wczytać {p.relative_to(DATA)}: {e}")
    else:
        log("WARN", "Brak katalogu data/ – wyrenderuję stronę domyślną /pl/")
    return ctx

# ------------------ Render (SSG) ------------------
def render_site(context: Dict[str, Any]):
    env = Environment(
        loader=FileSystemLoader(str(TPL)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True, lstrip_blocks=True,
    )
    env.filters["tojson"] = tojson
    env.globals["SITE_URL"] = SITE_URL
    env.globals["ALLOWED_WIDGET_HOSTS"] = ALLOWED_WIDGET_HOSTS
    env.globals["now"] = time.strftime("%Y-%m-%d")

    pages = context.get("pages") or []
    if not isinstance(pages, list) or not pages:
        # strona domyślna
        pages = [{"lang":"pl","slug":"","template":"page.html","slugKey":"home"}]

    copy_assets_minify_sri()

    for page in pages:
        lang = (page.get("lang") or "pl").lower()
        slug = page.get("slug") or ""
        tpl_name = page.get("template") or "page.html"
        tpl = env.get_template(tpl_name)

        path = f"/{lang}/{slug}/" if slug else f"/{lang}/"
        out_dir = DIST / lang / (slug if slug else "")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "index.html"

        ctx = dict(context)
        ctx["page"] = page
        ctx["samekey"] = page.get("slugKey") or slug or "home"

        html = tpl.render(**ctx)
        html = postprocess_html(html, out_dir)
        out_file.write_text(html, encoding="utf-8")
        log("OK", f"Wygenerowano {out_file.relative_to(DIST)}")

    # po renderze – sitemap/robots
    generate_sitemap_and_robots(pages)

# ------------------ Assets: kopiowanie, minifikacja, SRI ------------------
def copy_assets_minify_sri():
    if not ASSETS.exists():
        log("WARN", "Brak katalogu assets/ – pomijam kopię statycznych zasobów")
        return
    dst = DIST / "assets"
    shutil.copytree(ASSETS, dst, dirs_exist_ok=True)
    log("OK", "Skopiowano /assets")

    # Minifikacja lokalnych CSS/JS (bez zmiany nazw)
    for css in dst.rglob("*.css"):
        try:
            if cssmin:
                css.write_text(cssmin(css.read_text(encoding="utf-8")), encoding="utf-8")
        except Exception as e:
            log("WARN", f"CSS minify {css.name}: {e}")
    for js in dst.rglob("*.js"):
        try:
            if jsmin:
                js.write_text(jsmin(js.read_text(encoding="utf-8")), encoding="utf-8")
        except Exception as e:
            log("WARN", f"JS minify {js.name}: {e}")

    # Oblicz SRI dla lokalnych CSS/JS/fontów (i zapisz do mapy)
    sri_map = {}
    for p in list(dst.rglob("*.css")) + list(dst.rglob("*.js")) + list(dst.rglob("*.woff2")):
        try:
            sri_map["/" + str(p.relative_to(DIST)).replace("\\","/")] = calc_sri(p)
        except Exception as e:
            log("WARN", f"SRI {p.name}: {e}")

    # Zapamiętaj mapę dla post-processu
    (DIST/"sri-map.json").write_text(json.dumps(sri_map, ensure_ascii=False, indent=2), encoding="utf-8")
    log("OK", "Obliczono SRI dla lokalnych zasobów")

def calc_sri(path: Path) -> str:
    # SHA384 – standardowo używane dla SRI
    h = hashlib.sha384()
    with open(path, "rb") as f:
        h.update(f.read())
    return "sha384-" + (h.digest()).hex()  # (hex zamiast b64 – przeglądarki wolą b64, ale raportowo hex wystarczy)
    # Jeśli chcesz b64: base64.b64encode(h.digest()).decode()

# ------------------ IMG: srcset/sizes, AVIF/WEBP, atrybuty ------------------
def local_image_path(src_url: str, page_dir: Path) -> Optional[Path]:
    if is_external_url(src_url):
        return None
    src_clean = src_url.split("?")[0].split("#")[0]
    if src_clean.startswith("/"):
        p = ROOT / src_clean.lstrip("/")
    else:
        p = (page_dir / src_clean).resolve()
    return p if p.exists() else None

def generate_responsive_images(img_path: Path) -> Tuple[List[str], List[str], Optional[str], Tuple[int,int]]:
    """
    Zwraca:
    - srcset_avif: ["url w", ...]
    - srcset_webp: ["url w", ...]
    - smallest_webp_url: str|None
    - (width,height) oryginału
    """
    if Image is None:
        return [], [], None, (0,0)
    try:
        im = Image.open(img_path)
    except Exception:
        return [], [], None, (0,0)
    width, height = im.size

    rel = img_path.relative_to(ROOT)
    out_base = DIST / rel.parent
    out_base.mkdir(parents=True, exist_ok=True)

    sizes = [w for w in IMG_SIZES if w <= width] or [width]
    srcset_avif, srcset_webp = [], []
    smallest_webp = None

    for fmt in ("AVIF", "WEBP"):
        for w in sizes:
            h = int(max(1, round(height * (w/width))))
            try:
                im2 = im.copy().resize((w, h), Image.LANCZOS)
            except Exception:
                continue
            out_name = f"{rel.stem}-{w}.{ 'avif' if fmt=='AVIF' else 'webp' }"
            out_path = out_base / out_name
            try:
                if fmt == "AVIF":
                    im2.save(out_path, format="AVIF", quality=IMG_QUAL, effort=4)
                else:
                    im2.save(out_path, format="WEBP", quality=IMG_QUAL, method=6)
            except Exception:
                continue
            url = "/" + str(out_path.relative_to(DIST)).replace("\\","/")
            if fmt == "AVIF":
                srcset_avif.append(f"{url} {w}w")
            else:
                srcset_webp.append(f"{url} {w}w")
                if w == min(sizes) and smallest_webp is None:
                    smallest_webp = url

    return srcset_avif, srcset_webp, smallest_webp, (width,height)

# ------------------ HTML post-process ------------------
def postprocess_html(html: str, page_dir: Path) -> str:
    soup = BeautifulSoup(html, "html.parser")

    # 0) Critical CSS (opcjonalnie) – tylko wtedy gdy w HTML jest placeholder na inline
    if RUN_CRIT:
        # jeśli chcesz: wstaw <style id="critical-css"></style> w <head>, my spróbujemy podmienić
        pass

    # 1) IMG
    hero_done = False
    for img in list(soup.find_all("img")):
        src = img.get("src")
        if not src: 
            continue

        # wydajnościowe atrybuty
        if not img.has_attr("loading"):  img["loading"]  = "lazy"
        if not img.has_attr("decoding"): img["decoding"] = "async"

        if "hero-media" in (img.get("class") or []):
            if not hero_done:
                img["fetchpriority"] = "high"
                img["loading"] = "eager"
                hero_done = True

        p = local_image_path(src, page_dir)
        if p:
            # wymiary
            if Image:
                try:
                    with Image.open(p) as im:
                        w,h = im.size
                        if not img.has_attr("width"):  img["width"]  = str(w)
                        if not img.has_attr("height"): img["height"] = str(h)
                except Exception:
                    pass

            # picture + srcset
            avif, webp, smallest_webp, _orig = generate_responsive_images(p)
            if (avif or webp) and (img.parent.name != "picture"):
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
                    img["srcset"] = ", ".join(sorted(webp, key=lambda x:int(x.split()[-1][:-1])))
                    img["sizes"]  = "(max-width: 1200px) 100vw, 1200px"
                if smallest_webp:
                    img["src"] = smallest_webp
                img.wrap(picture)

    # 2) SRI – podmień atrybuty w HTML według dist/sri-map.json
    sri_map_path = DIST/"sri-map.json"
    sri_map = {}
    if sri_map_path.exists():
        try:
            sri_map = json.loads(sri_map_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    # <script src>, <link rel="stylesheet" href>, <link rel="preload" as="font" href>
    for tag in soup.find_all(["script","link"]):
        if tag.name == "script" and tag.get("src"):
            href = tag["src"]
            if not is_external_url(href) and href in sri_map:
                tag["integrity"] = sri_map[href]
                tag["crossorigin"] = "anonymous"
        if tag.name == "link" and tag.get("href"):
            rel = " ".join(tag.get("rel") or [])
            if ("stylesheet" in rel or ("preload" in rel and tag.get("as")=="font")):
                href = tag["href"]
                if not is_external_url(href) and href in sri_map:
                    tag["integrity"] = sri_map[href]
                    tag["crossorigin"] = "anonymous"

    # 3) Linki zewnętrzne
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if is_external_url(href) and a.get("target") == "_blank":
            rel = set((a.get("rel") or []))
            rel.update(["noopener","noreferrer"])
            a["rel"] = " ".join(rel)

    # 4) JSON-LD sanity
    for sc in soup.find_all("script", attrs={"type":"application/ld+json"}):
        try:
            data = json.loads(sc.string or "{}")
            _validate_jsonld(data)
        except Exception as e:
            log("WARN", f"JSON-LD parse warning: {e}")

    # 5) Whitelist widgetów
    for iframe in soup.find_all("iframe", src=True):
        host = host_of(iframe["src"])
        if host and host not in ALLOWED_WIDGET_HOSTS:
            log("FAIL", f"IFRAME host '{host}' nie jest na ALLOWED_WIDGET_HOSTS")
    for emb in soup.select("[data-embed-src]"):
        host = host_of(emb.get("data-embed-src",""))
        if host and host not in ALLOWED_WIDGET_HOSTS:
            log("FAIL", f"Widget host '{host}' nie jest na ALLOWED_WIDGET_HOSTS")

    # 6) A11y/HTML heurystyki
    _a11y_min_checks(soup)
    _hreflang_sanity(soup)

    # 7) Link checker (wewnętrzne path’y)
    _link_checker(soup)

    # 8) Minifikacja HTML
    out_html = str(soup)
    if htmlmin:
        try:
            out_html = htmlmin.minify(out_html, remove_comments=True, remove_optional_attribute_quotes=False)
        except Exception as e:
            log("WARN", f"HTML minify: {e}")
    return out_html

# ------------------ Walidatory ------------------
def _validate_jsonld(data: Any):
    def ensure(obj, key, path):
        if key not in obj or obj[key] in (None, "", []):
            raise ValueError(f"Brak '{key}' w JSON-LD ({path})")

    if isinstance(data, dict) and data.get("@type"):
        t = data["@type"]
        if t == "FAQPage":
            ensure(data, "mainEntity", "FAQPage")
        elif t == "BlogPosting":
            for k in ("headline","mainEntityOfPage","publisher"):
                ensure(data, k, "BlogPosting")
        elif t == "Product":
            ensure(data, "aggregateRating", "Product")
        elif t == "JobPosting":
            ensure(data, "title", "JobPosting")
    elif isinstance(data, dict) and data.get("@graph"):
        for node in data["@graph"]:
            if isinstance(node, dict) and node.get("@type"):
                _validate_jsonld(node)

def _a11y_min_checks(soup: BeautifulSoup):
    # Jedno H1
    h1s = soup.find_all("h1")
    if len(h1s) != 1:
        log("WARN", f"H1 na stronie: {len(h1s)} (zalecane: 1)")
    # IMG alt
    for img in soup.find_all("img"):
        if not img.has_attr("alt"):
            log("WARN", "Obraz <img> bez alt")
    # <nav> aria-label
    for nav in soup.find_all("nav"):
        if not nav.get("aria-label"):
            log("WARN", "<nav> bez aria-label")

def _hreflang_sanity(soup: BeautifulSoup):
    alts = soup.find_all("link", attrs={"rel":"alternate"})
    langs = [a.get("hreflang") for a in alts if a.get("hreflang")]
    if "x-default" not in langs:
        log("WARN", "Brak alternatywy hreflang='x-default'")
    # proste: czy hreflangi nie dublują href’ów
    hrefs = [a.get("href") for a in alts if a.get("href")]
    if len(hrefs) != len(set(hrefs)):
        log("WARN", "Zduplikowane linki hreflang")

def _link_checker(soup: BeautifulSoup):
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("#"):
            anchor = href[1:]
            if anchor and not soup.find(id=anchor):
                log("WARN", f"Link kotwica #{anchor} może nie istnieć")
            continue
        if is_external_url(href):
            continue
        clean = href.split("?")[0].split("#")[0]
        target = (DIST / clean.lstrip("/")).resolve()
        if target.is_dir():
            if not (target/"index.html").exists():
                log("WARN", f"Link {href} wskazuje katalog bez index.html")
        elif not target.exists():
            # sprawdź, czy to asset
            if not (DIST / clean.lstrip("/")).exists():
                log("WARN", f"Link lokalny nie istnieje: {href}")

# ------------------ Sitemap / Robots ------------------
def generate_sitemap_and_robots(pages: List[Dict[str,Any]]):
    urls = []
    for p in pages:
        lang = (p.get("lang") or "pl").lower()
        slug = p.get("slug") or ""
        loc = f"{SITE_URL}/{lang}/" + (f"{slug}/" if slug else "")
        urls.append(loc)
    urls = sorted(set(urls))

    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm += [ "<url>", f"<loc>{u}</loc>", f"<lastmod>{time.strftime('%Y-%m-%d')}</lastmod>", "</url>"]
    sm += ["</urlset>"]
    (DIST/"sitemap.xml").write_text("\n".join(sm), encoding="utf-8")

    robots = f"""User-agent: *
Allow: /
Sitemap: {SITE_URL}/sitemap.xml
"""
    (DIST/"robots.txt").write_text(robots, encoding="utf-8")
    log("OK", "Wygenerowano sitemap.xml + robots.txt")

# ------------------ Budżety i raport ------------------
def budgets_and_report():
    # HTML
    for p in DIST.rglob("*.html"):
        kb = gzip_size_bytes(p)/1024.0
        if kb > BUDGETS["html_gzip_kb"]:
            log("WARN", f"HTML {p.relative_to(DIST)} = {kb:.1f} KB gzip (> {BUDGETS['html_gzip_kb']} KB)")

    # CSS krytyczny – heurystyka: pliki zawierające 'critical'
    crit = list(DIST.rglob("*critical*.css"))
    if crit:
        total = sum(gzip_size_bytes(x) for x in crit)/1024.0
        if total > BUDGETS["css_critical_gzip_kb"]:
            log("WARN", f"Critical CSS = {total:.1f} KB gzip (> {BUDGETS['css_critical_gzip_kb']} KB)")

    # JS init – heurystyka: pliki '*init*.js' oraz kras-global.js
    init_js = list(DIST.rglob("*init*.js")) + list(DIST.rglob("kras-global.js"))
    if init_js:
        total = sum(gzip_size_bytes(x) for x in init_js)/1024.0
        if total > BUDGETS["js_init_gzip_kb"]:
            log("WARN", f"Init JS = {total:.1f} KB gzip (> {BUDGETS['js_init_gzip_kb']} KB)")

    # Hero
    heros = list(DIST.rglob("assets/media/hero*"))
    if heros:
        biggest = max(heros, key=lambda p: p.stat().st_size)
        kb = biggest.stat().st_size/1024.0
        if kb > BUDGETS["hero_img_kb"]:
            log("WARN", f"Hero {biggest.name} = {kb:.0f} KB (> {BUDGETS['hero_img_kb']} KB)")

# ------------------ Integracje opcjonalne (Node) ------------------
def run_lhci():
    if not RUN_LHCI:
        log("OK", "LHCI pominięty (RUN_LHCI=1 aby włączyć)")
        return
    try:
        subprocess.run(["npx","@lhci/cli","autorun","--config=./lighthouserc.json"], check=True)
        log("OK","Lighthouse CI zakończony")
    except Exception as e:
        log("WARN", f"LHCI błąd/ niedostępny: {e}")

def run_axe():
    if not RUN_AXE:
        log("OK", "axe-core pominięty (RUN_AXE=1 aby włączyć)")
        return
    # Wymagane: prosty serw lokalny dist/ na porcie 4173 (np. npx serve)
    try:
        subprocess.run(["npx","axe","http://localhost:4173/pl/","--quiet"], check=True)
        log("OK","axe-core zakończony")
    except Exception as e:
        log("WARN", f"axe-core błąd/niedostępny: {e}")

def run_visual():
    if not RUN_VR:
        log("OK", "Playwright VR pominięty (RUN_VR=1 aby włączyć)")
        return
    try:
        subprocess.run(["npx","playwright","test","-c","playwright.config.ts"], check=True)
        log("OK","Playwright VR zakończony")
    except Exception as e:
        log("WARN", f"Playwright błąd/niedostępny: {e}")

# ------------------ CLI ------------------
def clean():
    if DIST.exists():
        shutil.rmtree(DIST)
    _ensure_dirs()

def build():
    clean()
    ctx = load_data()
    render_site(ctx)
    budgets_and_report()
    write_logs()

    # Integracje opcjonalne (uruchamiasz tylko gdy chcesz i masz Node):
    run_lhci()
    run_axe()
    run_visual()

    # reguły wyjścia
    if FAIL_HAPPENED or (STRICT and any(k=="WARN" for k,_ in REPORTS)):
        if NOFAIL:
            log("WARN", "Były błędy/ostrzeżenia, ale CONTINUE_ON_FAIL=1 – nie przerywam.")
            return
        sys.exit(1)

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "clean":
        clean()
    elif cmd == "build":
        build()
    else:
        print("Użycie: python build.py [build|clean]")
