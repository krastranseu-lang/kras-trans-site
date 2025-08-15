#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kras-Trans • MAX build.py
- Render Jinja2 z Arkusza (data/cms.json)
- AutoLinks (AutoLinks + Pages.secondary_keywords)
- Linty jakości (SEO/A11y/HTML), budżety, CLS guard
- Sitemap + hreflang, robots, 404, redirect / → /{DEFAULT_LANG}/
- Kopia assets, ZIP snapshot, debug ctx/lints per strona
"""

from __future__ import annotations
import os, sys, re, json, shutil, gzip, io, html, hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any, Tuple

# --- Próby importu „miękkich” zależności (fallbacki, by build nie padł) ---
try:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
except Exception as e:
    print("FATAL: jinja2 jest wymagane.", e, file=sys.stderr); sys.exit(1)

try:
    import markdown as mdlib
    MD_AVAILABLE = True
except Exception:
    MD_AVAILABLE = False

try:
    from bs4 import BeautifulSoup, NavigableString
    BS4_AVAILABLE = True
except Exception:
    BS4_AVAILABLE = False

# --- Ścieżki ---
ROOT     = Path(__file__).resolve().parents[1] if (Path(__file__).name == "build.py" and Path(__file__).parent.name == "tools") else Path(__file__).resolve().parent
DATA     = ROOT / "data" / "cms.json"
TPL_DIR  = ROOT / "templates"
DIST     = ROOT / "dist"
ASSETS   = ROOT / "assets"

# --- ENV / fallbacki ---
SITE_URL         = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG     = os.getenv("DEFAULT_LANG", "pl").lower()
BRAND            = os.getenv("BRAND", "Kras-Trans")
GA_ID            = os.getenv("GA_ID", "")
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "")
CNAME            = os.getenv("CNAME", "")

# --- Budżety / progi (możesz dopasować) ---
BUDGETS = {
    "html_gzip_max": 40_000,   # ~40 KB gzip/strona
    "css_total_max": 50_000,   # krytyczny CSS
    "js_init_max":   70_000,   # bundle inicjalizujący
    "hero_img_max":  200_000,  # WEBP/AVIF hero
}
SEO_LIMITS = {
    "h1_words_max": 12,
    "lead_chars_max": 200,
    "title_chars_max": (35, 65),
    "desc_chars_max":  (70, 160),
}

# --- Utils ---
def t(x: Any) -> str:
    return "" if x is None else str(x).strip()

def ensure_dir(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

def gz_size(b: bytes) -> int:
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode="wb", compresslevel=6) as gzf:
        gzf.write(b)
    return bio.getbuffer().nbytes

def slugify(s: str) -> str:
    s = t(s).lower()
    s = re.sub(r"[^\w\- ]+", "", s, flags=re.U)
    s = s.replace(" ", "-")
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")

def read_json(path: Path) -> dict:
    if not path.exists():
        print(f"FATAL: brak {path}", file=sys.stderr); sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def copy_tree(src: Path, dst: Path):
    if src.exists():
        for item in src.rglob("*"):
            rel = item.relative_to(src)
            out = dst / rel
            if item.is_dir():
                out.mkdir(parents=True, exist_ok=True)
            else:
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, out)

# --- Markdown → HTML (bezpieczeństwo: tylko podstawy) ---
def md_to_html(md_text: str) -> str:
    if not md_text:
        return ""
    if MD_AVAILABLE:
        return mdlib.markdown(md_text, extensions=["extra", "smarty", "sane_lists"])
    # fallback „lekki”:
    s = html.escape(md_text)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)
    s = s.replace("\n\n", "<br><br>")
    return f"<p>{s}</p>"

# --- Sanitizer (whitelist) ---
ALLOWED_TAGS = set("p h1 h2 h3 h4 h5 h6 a ul ol li strong em b i br hr blockquote img picture source figure figcaption code pre small sup sub table thead tbody tr th td span div".split())
ALLOWED_ATTR = {"a": {"href","title","rel","aria-label"},
                "img": {"src","alt","width","height","loading","decoding","fetchpriority"},
                "source": {"srcset","type","media"},
                "*": {"class","id","style","data-*"}}

def sanitize_html(html_in: str) -> str:
    if not html_in:
        return ""
    if not BS4_AVAILABLE:
        # fallback: usuń <script/style> i eventy
        s = re.sub(r"(?is)<script.*?>.*?</script>", "", html_in)
        s = re.sub(r"(?is)<style.*?>.*?</style>", "", s)
        s = re.sub(r"\son\w+\s*=\s*['\"].*?['\"]", "", s)   # onload=...
        return s
    soup = BeautifulSoup(html_in, "html.parser")
    for tag in list(soup.find_all()):
        if tag.name not in ALLOWED_TAGS:
            tag.decompose()
            continue
        # atrybuty
        attrs = dict(tag.attrs)
        for k in list(attrs.keys()):
            base = k.split("-")[0]
            if (tag.name in ALLOWED_ATTR and k in ALLOWED_ATTR[tag.name]) or (k in ALLOWED_ATTR.get("*", set())) or base in {"data"}:
                continue
            del tag.attrs[k]
    return str(soup)

# --- AutoLinks: z tabeli AutoLinks + secondary_keywords z Pages ---
def build_autolink_rules(CMS: dict, lang: str) -> List[Tuple[re.Pattern, str]]:
    rules: List[Tuple[re.Pattern, str]] = []

    # 1) Z zakładki AutoLinks (jeśli istnieje)
    AUTO = CMS.get("autolinks") or CMS.get("AutoLinks") or []
    for r in AUTO:
        r_lang = t(r.get("lang") or lang).lower()
        if r_lang != lang: continue
        kw = t(r.get("keyword") or r.get("anchor") or "")
        href = t(r.get("href") or r.get("url") or "")
        if kw and href:
            pat = re.compile(rf"(?<!</?a[^>]*>)(?i)\b({re.escape(kw)})\b")
            rules.append((pat, href))

    # 2) Z Pages.secondary_keywords (tylko opublikowane)
    for p in CMS.get("pages", []):
        if str(p.get("publish")).lower() != "true": continue
        if t(p.get("lang") or DEFAULT_LANG).lower() != lang: continue
        href = "/" + lang + "/" + (t(p.get("slug")) + "/" if t(p.get("slug")) else "")
        kws = p.get("secondary_keywords") or []
        if isinstance(kws, str):
            kws = [k.strip() for k in kws.split(",") if k.strip()]
        for kw in kws:
            if not kw: continue
            pat = re.compile(rf"(?<!</?a[^>]*>)(?i)\b({re.escape(kw)})\b")
            rules.append((pat, href))
    return rules

def autolink_html(html_in: str, rules: List[Tuple[re.Pattern, str]], max_links_per_section: int = 2) -> str:
    if not html_in or not rules:
        return html_in
    if not BS4_AVAILABLE:
        # prosty fallback: pierwszy match/sekcja
        s = html_in
        used = 0
        for pat, href in rules:
            if used >= max_links_per_section: break
            s2, n = pat.subn(rf'<a href="{href}">\1</a>', s, count=1)
            if n:
                used += 1; s = s2
        return s

    soup = BeautifulSoup(html_in, "html.parser")
    used = 0
    for node in soup.find_all(text=True):
        if used >= max_links_per_section: break
        if not isinstance(node, NavigableString): continue
        parent = node.parent
        if parent.name in ("a", "script", "style"): continue
        txt = str(node)
        orig = txt
        for pat, href in rules:
            if used >= max_links_per_section: break
            txt, n = pat.subn(rf'<a href="{href}">\1</a>', txt, count=1)
            if n:
                used += 1
        if txt != orig:
            frag = BeautifulSoup(txt, "html.parser")
            node.replace_with(frag)
    return str(soup)

# --- Strings (kolumny: key | pl | en ... albo key | value) ---
def build_strings(rows: List[dict], lang: str) -> Dict[str,str]:
    out: Dict[str,str] = {}
    for r in rows or []:
        key = t(r.get("key") or r.get("id") or r.get("slug") or "")
        if not key: continue
        val = r.get(lang) or r.get("value") or r.get("val") or ""
        out[key] = t(val)
    return out

# --- Linty / jakość ---
def lint_html_basic(html_code: str) -> List[str]:
    issues = []
    # H1 dokładnie 1
    h1s = re.findall(r"<h1[^>]*>", html_code, flags=re.I)
    if len(h1s) == 0: issues.append("Brak <h1> na stronie.")
    if len(h1s) > 1: issues.append("Więcej niż jeden <h1> (powinien być dokładnie jeden).")

    # meta description
    if not re.search(r'<meta\s+name=["\']description["\']\s+content=["\']', html_code, flags=re.I):
        issues.append("Brak meta description.")

    # IMG: alt + width/height lub aspect-ratio
    imgs = re.findall(r"<img\b[^>]*>", html_code, flags=re.I)
    for tag in imgs:
        if not re.search(r'\salt=["\']', tag, flags=re.I):
            issues.append("Obrazek bez alt.")
            break
        if not (re.search(r'\swidth=["\']\d+["\']', tag) and re.search(r'\sheight=["\']\d+["\']', tag)) and "aspect-ratio" not in tag:
            issues.append("Obrazek bez width/height lub aspect-ratio (możliwy CLS).")
            break
    return issues

def lint_seo_texts(page: dict, ctx: dict) -> List[str]:
    issues = []
    title = t(page.get("seo_title") or page.get("h1") or page.get("title") or "")
    desc  = t(page.get("meta_desc") or page.get("lead") or "")
    h1    = t(page.get("h1") or page.get("title") or "")
    lead  = t(page.get("lead") or "")

    if title:
        lo, hi = SEO_LIMITS["title_chars_max"]
        if not (lo <= len(title) <= hi):
            issues.append(f"seo_title: {len(title)} znaków (zalecane {lo}-{hi}).")
    else:
        issues.append("Brak seo_title (używana będzie h1).")

    if desc:
        lo, hi = SEO_LIMITS["desc_chars_max"]
        if not (lo <= len(desc) <= hi):
            issues.append(f"meta_desc: {len(desc)} znaków (zalecane {lo}-{hi}).")
    else:
        issues.append("Brak meta_desc (używana będzie lead).")

    if h1:
        words = len(re.findall(r"\w+", h1, flags=re.U))
        if words > SEO_LIMITS["h1_words_max"]:
            issues.append(f"H1 ma {words} słów (zalecane ≤ {SEO_LIMITS['h1_words_max']}).")
    else:
        issues.append("Brak H1.")
    if lead and len(lead) > SEO_LIMITS["lead_chars_max"]:
        issues.append(f"Lead ma {len(lead)} znaków (zalecane ≤ {SEO_LIMITS['lead_chars_max']}).")
    return issues

def budget_check(html_bytes: bytes, assets_sizes: Dict[str,int], hero_path: Path|None) -> List[str]:
    issues = []
    gz = gz_size(html_bytes)
    if gz > BUDGETS["html_gzip_max"]:
        issues.append(f"HTML gzip {gz} B > {BUDGETS['html_gzip_max']} B.")
    css_total = assets_sizes.get("css", 0)
    if css_total > BUDGETS["css_total_max"]:
        issues.append(f"CSS {css_total} B > {BUDGETS['css_total_max']} B.")
    js_init = assets_sizes.get("js", 0)
    if js_init > BUDGETS["js_init_max"]:
        issues.append(f"JS init {js_init} B > {BUDGETS['js_init_max']} B.")
    if hero_path and hero_path.exists():
        if hero_path.stat().st_size > BUDGETS["hero_img_max"]:
            issues.append(f"Hero image {hero_path.stat().st_size} B > {BUDGETS['hero_img_max']} B.")
    return issues

# --- Link checker wewnętrzny ---
def collect_internal_paths(base_dir: Path) -> set:
    files = set()
    for f in base_dir.rglob("index.html"):
        files.add("/" + str(f.relative_to(base_dir).parent).replace("\\","/") + "/")
    return files

def find_links(html_code: str) -> List[str]:
    return re.findall(r'href=["\'](\/[^"\']*)["\']', html_code)

# --- Render / strony ---
def main():
    print("==> START build")
    CMS = read_json(DATA)

    # Walidacja podstawowa
    required_tabs = ["pages","faq","company","nav","templates","strings","routes","blocks"]
    missing = [k for k in required_tabs if k not in CMS]
    if missing:
        print("UWAGA: Brak zakładek w CMS:", missing)

    PAGES    = CMS.get("pages", [])
    FAQ_ALL  = CMS.get("faq", [])
    MEDIA    = CMS.get("media", [])
    COMPANY  = CMS.get("company", [])
    NAV      = CMS.get("nav", [])
    TEMPL    = CMS.get("templates", [])
    STR_ROWS = CMS.get("strings", [])
    ROUTES   = CMS.get("routes", [])
    BLOCKS   = CMS.get("blocks", [])

    # Unikalność (slugKey + lang)
    seen = set()
    for p in PAGES:
        key = (t(p.get("slugKey") or p.get("slug") or "home").lower(), t(p.get("lang") or DEFAULT_LANG).lower())
        if key in seen:
            print("BŁĄD: duplikat (slugKey,lang):", key, file=sys.stderr)
        seen.add(key)

    # Dist refresh
    if DIST.exists(): shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)

    # Kopia assets
    copy_tree(ASSETS, DIST / "assets")

    # Przygotuj Jinja
    env = Environment(
        loader=FileSystemLoader(str(TPL_DIR)),
        autoescape=select_autoescape(['html','xml']),
        trim_blocks=True, lstrip_blocks=True
    )

    # Preload szablony (fallback do page.html)
    def pick_template(p: dict) -> str:
        name = t(p.get("template") or "")
        if name and (TPL_DIR / name).exists():
            return name
        typ = t(p.get("type") or "")
        mapping = {
            "blog_index": "blog_index.html",
            "blog_post" : "blog_post.html",
            "case_index": "case_index.html",
            "case_item" : "case_item.html",
            "reviews"   : "reviews.html",
            "location"  : "location.html",
            "jobs_index": "jobs_index.html",
            "job_item"  : "job_item.html",
        }
        if typ in mapping and (TPL_DIR / mapping[typ]).exists():
            return mapping[typ]
        return "page.html"

    # Budżet assets (prosty: suma .css, .js z /assets)
    assets_sizes = {"css":0, "js":0}
    for f in (DIST/"assets").rglob("*"):
        if f.suffix==".css": assets_sizes["css"] += f.stat().st_size
        if f.suffix==".js":  assets_sizes["js"]  += f.stat().st_size

    built_urls = []    # do sitemap
    lints_all  = []    # zbiorczo

    # Strony opublikowane
    published = [p for p in PAGES if str(p.get("publish")).lower()=="true"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Grupowanie hreflang po slugKey
    groups: Dict[str,List[dict]] = {}
    for p in published:
        key = t(p.get("slugKey") or p.get("slug") or "home").lower()
        groups.setdefault(key, []).append(p)

    # Render
    for p in published:
        lang = (p.get("lang") or DEFAULT_LANG).lower()
        slug = t(p.get("slug"))
        samekey = (t(p.get("slugKey")) or slug or "home").lower()

        # FAQ dla tej strony
        faq = [f for f in FAQ_ALL if t(f.get("lang") or lang).lower()==lang and t(f.get("page") or "").lower() in {samekey, "home"}]
        faq.sort(key=lambda x: int(x.get("order") or 0))

        # Strings
        strings = build_strings(STR_ROWS, lang)

        # Body (MD → HTML, sanitize + autolink)
        page_html = ""
        if t(p.get("body_md")):
            page_html = sanitize_html(md_to_html(p.get("body_md")))
        elif t(p.get("page_html")):
            page_html = sanitize_html(p.get("page_html"))

        # AutoLinks (tylko w treści body, 1–2 linki/sekcję)
        al_rules = build_autolink_rules(CMS, lang)
        page_html = autolink_html(page_html, al_rules, max_links_per_section=2)

        # hero path (do budżetu)
        hero_rel = t(p.get("hero_image"))
        hero_path = DIST / hero_rel.lstrip("/") if hero_rel else None

        # Kontekst
        ctx = {
            "SITE_URL": SITE_URL,
            "site_url": SITE_URL,           # dla starych szablonów
            "DEFAULT_LANG": DEFAULT_LANG,
            "BRAND": BRAND,
            "GA_ID": GA_ID,
            "GSC_VERIFICATION": GSC_VERIFICATION,
            "now": now_iso,

            "page": p,
            "page_html": page_html,
            "faq": faq,
            "pages": PAGES,        # ← pełna lista (dla menu/hreflang)
            "nav": NAV,
            "company": COMPANY,
            "routes": ROUTES,
            "blocks": BLOCKS,
            "strings": strings,
        }

        # Debug ctx
        dbg_dir = DIST / "_debug" / lang / (slug or "home")
        dbg_dir.mkdir(parents=True, exist_ok=True)
        with open(dbg_dir / "ctx.json", "w", encoding="utf-8") as df:
            json.dump(ctx, df, ensure_ascii=False, indent=2)

        # Render strony
        tpl_name = pick_template(p)
        try:
            tpl = env.get_template(tpl_name)
        except Exception as e:
            print(f"FATAL: brak szablonu {tpl_name} ({e})", file=sys.stderr); sys.exit(1)

        html_out = tpl.render(**ctx)
        # Linty
        lint_tech = lint_html_basic(html_out)
        lint_seo  = lint_seo_texts(p, ctx)

        # Budżety
        perf_issues = budget_check(html_out.encode("utf-8"), assets_sizes, hero_path)

        # Zapis strony
        out_dir = DIST / lang / (slug or "")
        out_file = out_dir / "index.html"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file.write_text(html_out, encoding="utf-8")

        # Zapis lints.json (per strona)
        lin = {
            "url": f"/{lang}/{slug+'/' if slug else ''}",
            "template": tpl_name,
            "lint_html": lint_tech,
            "lint_seo": lint_seo,
            "perf": perf_issues,
        }
        with open(dbg_dir / "lints.json", "w", encoding="utf-8") as lf:
            json.dump(lin, lf, ensure_ascii=False, indent=2)

        built_urls.append(lin["url"])
        lints_all.append(lin)

    # Root index → redirect na DEFAULT_LANG
    (DIST / "index.html").write_text(
        f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/{DEFAULT_LANG}/"><link rel="canonical" href="{SITE_URL}/{DEFAULT_LANG}/">', 
        encoding="utf-8"
    )

    # 404
    (DIST / "404.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>404</title><h1>404</h1><p>Strona nie istnieje.</p>",
        encoding="utf-8"
    )

    # CNAME (Pages)
    if CNAME:
        (DIST / "CNAME").write_text(CNAME.strip()+"\n", encoding="utf-8")

    # robots.txt
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n",
        encoding="utf-8"
    )

    # SITEMAP + hreflang
    urls_xml = []
    for key, variants in groups.items():
        # prefer published only
        variants = [v for v in variants if str(v.get("publish")).lower()=="true"]
        if not variants: continue
        # canonical = pierwszy wg DEFAULT_LANG → albo pierwszy dowolny
        canon = None
        for v in variants:
            if (v.get("lang") or DEFAULT_LANG).lower() == DEFAULT_LANG:
                canon = v; break
        if not canon:
            canon = variants[0]
        for v in variants:
            lang = (v.get("lang") or DEFAULT_LANG).lower()
            slug = t(v.get("slug"))
            loc = f"{SITE_URL}/{lang}/{(slug + '/' if slug else '')}"
            alts = []
            for a in variants:
                al = (a.get("lang") or DEFAULT_LANG).lower()
                aslug = t(a.get("slug"))
                href = f"{SITE_URL}/{al}/{(aslug + '/' if aslug else '')}"
                alts.append((al, href))
            urls_xml.append((loc, alts))
    # zapis
    sm = io.StringIO()
    sm.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    sm.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n')
    sm.write('        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n')
    for loc, alts in urls_xml:
        sm.write("  <url>\n")
        sm.write(f"    <loc>{loc}</loc>\n")
        for (hl, href) in alts:
            sm.write(f'    <xhtml:link rel="alternate" hreflang="{hl}" href="{href}" />\n')
        sm.write("  </url>\n")
    sm.write("</urlset>\n")
    (DIST / "sitemap.xml").write_text(sm.getvalue(), encoding="utf-8")

    # Link checker (wewnętrzne 404)
    internal_paths = collect_internal_paths(DIST)
    broken = []
    for f in DIST.rglob("index.html"):
        code = f.read_text(encoding="utf-8", errors="ignore")
        for href in find_links(code):
            # ignoruj zasoby, hashe, zewnętrzne
            if not href.startswith("/"): continue
            if any(href.endswith(ext) for ext in (".css",".js",".png",".webp",".jpg",".svg",".ico",".mp4",".json",".xml",".txt",".pdf",".woff",".woff2")):
                continue
            # normalizacja
            if not href.endswith("/"): href = href + "/"
            if href not in internal_paths:
                broken.append((str(f.relative_to(DIST)), href))
    # Zapis health
    health = {
        "built": len(built_urls),
        "broken_links": broken,
        "lints": lints_all,
        "assets_sizes": assets_sizes,
        "budgets": BUDGETS
    }
    (DIST / "_debug" / "health.json").write_text(json.dumps(health, ensure_ascii=False, indent=2), encoding="utf-8")

    # ZIP snapshot
    snap_dir = DIST / "download"
    snap_dir.mkdir(parents=True, exist_ok=True)
    zip_path = snap_dir / "site.zip"
    shutil.make_archive(str(zip_path.with_suffix("")), "zip", root_dir=DIST)

    # Podsumowanie w logu (skrócone)
    broken_n = len(broken)
    pages_n  = len(built_urls)
    print(f"==> OK build: {pages_n} stron, broken_links={broken_n}")
    if broken_n:
        for f, href in broken[:10]:
            print("  - broken:", f, "→", href)
        print("  (pełna lista w _debug/health.json)")

if __name__ == "__main__":
    main()
