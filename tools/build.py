#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans • Static build PRO
- Wejście: data/cms.json (Apps Script)
- Szablony: templates/*.html (Jinja2)
- Zasoby: /assets -> /dist/assets
- Postprocessing: preload fontów, IMG (wymiary/srcset/sizes), autolinki, sanity SEO, mini-minifikacja
- Wyjście: strony HTML, sitemap.xml, robots.txt, 404.html, CNAME (opcjonalnie), snapshot ZIP
- Budżety (gzip): HTML/CSS/JS
- Dodatki: ctx.json per strona (dist/_debug/<lang>/<slug>/ctx.json)
ENV: SITE_URL, DEFAULT_LANG, BRAND, CNAME, STRICT (1/0)
"""

from __future__ import annotations
import os, re, io, json, gzip, shutil, zipfile, html
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any, Tuple

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from bs4 import BeautifulSoup, NavigableString
from slugify import slugify

# Pillow jest opcjonalne — jeśli brak, pomijamy warianty WEBP
try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 80_000_000
except Exception:
    Image = None

# ──────────────────────────────────────────────────────────────────────────────
# ŚCIEŻKI / ENV
ROOT   = Path(__file__).resolve().parents[1]
DATA   = ROOT / "data" / "cms.json"
TPLS   = ROOT / "templates"
ASSETS = ROOT / "assets"
DIST   = ROOT / "dist"

SITE_URL     = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = (os.getenv("DEFAULT_LANG") or "pl").lower()
BRAND        = os.getenv("BRAND", "Kras-Trans")
CNAME_TARGET = os.getenv("CNAME", "").strip()
STRICT       = int(os.getenv("STRICT", "1"))

# Budżety gzip (sumarycznie)
BUDGET_HTML_GZ = 40 * 1024
BUDGET_CSS_GZ  = 120 * 1024
BUDGET_JS_GZ   = 150 * 1024

# Obrazy
RESP_WIDTHS  = [480, 768, 1024, 1440, 1920]
WEBP_QUALITY = 82

# Autolinki — miękkie ograniczenie
MAX_AUTOLINKS_PER_P_OR_LI = 2

# ──────────────────────────────────────────────────────────────────────────────
# Pomocnicze
def now_iso() -> str: return datetime.now(timezone.utc).isoformat()

def t(x: Any) -> str:
    if x is None: return ""
    if isinstance(x, (int, float)): return str(x)
    return str(x).strip()

def gz_size(b: bytes) -> int:
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode="wb") as gz:
        gz.write(b)
    return len(bio.getvalue())

def mkdirp(p: Path): p.parent.mkdir(parents=True, exist_ok=True)

ISSUES: List[Dict[str, str]] = []
def warn(path: str, msg: str): ISSUES.append({"level":"warn","path":path,"msg":msg})
def fail(path: str, msg: str): ISSUES.append({"level":"error","path":path,"msg":msg})

# ──────────────────────────────────────────────────────────────────────────────
# CMS JSON
if not DATA.exists():
    raise SystemExit("Brak data/cms.json (krok Fetch CMS JSON).")

CMS = json.loads(DATA.read_text(encoding="utf-8"))

PAGES      = CMS.get("pages", []) or []
FAQ        = CMS.get("faq", []) or []
MEDIA      = CMS.get("media", []) or []
COMPANY    = CMS.get("company", []) or []
REDIRECTS  = CMS.get("redirects", []) or []
BLOCKS     = CMS.get("blocks", []) or []
NAV        = CMS.get("nav", []) or []
TEMPLS_CMS = CMS.get("templates", []) or []
STR_ROWS   = CMS.get("strings", []) or []
ROUTES     = CMS.get("routes", []) or []
PLACES     = CMS.get("places", []) or []
BLOG       = CMS.get("blog", []) or []
REVIEWS    = CMS.get("reviews", []) or []
AUTHORS    = CMS.get("authors", []) or []
CATEGORIES = CMS.get("categories", []) or []
JOBS       = CMS.get("jobs", []) or []
AUTOLINKS  = CMS.get("autolinks", []) or []

# ──────────────────────────────────────────────────────────────────────────────
# STRINGS / Jinja
def build_strings(rows: List[dict], lang: str) -> Dict[str,str]:
    out: Dict[str,str] = {}
    for r in rows:
        key = t(r.get("key") or r.get("id") or r.get("slug"))
        if not key: continue
        val = r.get(lang) or r.get("value") or r.get("val") or ""
        out[key] = t(val)
    return out

_strings_cache: Dict[str, Dict[str,str]] = {}
def strings_for(lang: str) -> Dict[str,str]:
    lang = (lang or DEFAULT_LANG).lower()
    if lang not in _strings_cache:
        _strings_cache[lang] = build_strings(STR_ROWS, lang)
    return _strings_cache[lang]

def template_for(page: dict) -> str:
    name = t(page.get("template"))
    if name and (TPLS / name).exists(): return name
    ptype = t(page.get("type")).lower() or "page"
    for row in TEMPLS_CMS:
        if t(row.get("type")).lower() == ptype:
            f = t(row.get("file"))
            if f and (TPLS / f).exists():
                return f
    return "page.html"

env = Environment(
    loader=FileSystemLoader(TPLS),
    autoescape=False,
    trim_blocks=True,
    lstrip_blocks=True,
)
env.filters["slug"] = lambda s: slugify(t(s))
env.filters["json"] = lambda o: json.dumps(o, ensure_ascii=False)

# ──────────────────────────────────────────────────────────────────────────────
# SPRZĄTANIE I KOPIOWANIE
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir(parents=True, exist_ok=True)
if ASSETS.exists():
    shutil.copytree(ASSETS, DIST / "assets")

built_files: List[Path] = []
site_urls:   List[str]  = []
INTERNAL_HREFS: List[Dict[str, Any]] = []

# ──────────────────────────────────────────────────────────────────────────────
# IMG: wymiary + warianty WEBP + srcset/sizes
def image_dims(p: Path) -> Tuple[int,int] | None:
    if not Image: return None
    try:
        with Image.open(p) as im:
            return im.width, im.height
    except Exception:
        return None

def ensure_webp_variants(src_path: Path) -> List[Tuple[int, Path]]:
    """Zwraca [(width, path.webp), …]; tworzy tylko do realnej szerokości źródła."""
    out: List[Tuple[int, Path]] = []
    if not Image: return out
    try:
        with Image.open(src_path) as im:
            w0, h0 = im.width, im.height
            base = src_path.stem
            out_dir = DIST / "assets" / "media" / "responsive"
            out_dir.mkdir(parents=True, exist_ok=True)
            for w in RESP_WIDTHS:
                w_eff = min(w, w0)  # nie powiększamy
                h = int(h0 * (w_eff / w0))
                name = f"{base}-w{w_eff}.webp"
                p = out_dir / name
                if not p.exists():
                    im.resize((w_eff, h)).save(p, "WEBP", quality=WEBP_QUALITY, method=6)
                out.append((w_eff, p))
                if w_eff == w0: break
    except Exception as e:
        warn(str(src_path), f"WEBP gen fail: {e}")
    return out

def rewrite_img_srcset(tag, doc_lang: str):
    """Uzupełnia width/height, srcset/sizes, loading/decoding (oprócz hero)."""
    src = t(tag.get("src"))
    if not src.startswith("/assets/"): return
    abs_src = DIST / src.lstrip("/")
    if not abs_src.exists(): return

    dims = image_dims(abs_src)
    if dims:
        w, h = dims
        tag.setdefault("width",  str(w))
        tag.setdefault("height", str(h))

    classes = " ".join(tag.get("class", [])).lower()
    if "hero-media" not in classes:
        tag.setdefault("loading",  "lazy")
        tag.setdefault("decoding", "async")

    variants = ensure_webp_variants(abs_src)
    if variants:
        variants.sort(key=lambda x: x[0])
        tag["srcset"] = ", ".join(
            f"/assets/media/responsive/{p.name} {w}w" for (w, p) in variants
        )
        tag.setdefault("sizes", "100vw" if "hero-media" in classes else "(max-width: 900px) 92vw, 50vw")

# ──────────────────────────────────────────────────────────────────────────────
# AUTOLINKI (delikatne)
def build_autolink_rules(lang: str) -> List[Dict[str, Any]]:
    rules: List[Dict[str, Any]] = []
    for r in AUTOLINKS:
        if (t(r.get("lang")) or DEFAULT_LANG).lower() != (lang or DEFAULT_LANG).lower():
            continue
        anchor = t(r.get("anchor"))
        href   = t(r.get("href"))
        if not anchor or not href: continue
        rules.append({"anchor": anchor, "href": href, "limit": int(r.get("limit") or 1)})
    return rules

def apply_autolinks(soup: BeautifulSoup, lang: str):
    rules = build_autolink_rules(lang)
    if not rules: return
    for el in soup.find_all(["p", "li"]):
        done = 0
        for node in list(el.descendants):
            if done >= MAX_AUTOLINKS_PER_P_OR_LI: break
            if not isinstance(node, NavigableString): continue
            if node.parent.name in ("a", "script", "style"): continue
            txt = str(node)
            for r in rules:
                if r["limit"] <= 0: continue
                pat = re.compile(rf"\b({re.escape(r['anchor'])})\b", re.I)  # UWAGA: flaga w argumencie, nie (?i)
                if not pat.search(txt): continue
                new_html = pat.sub(rf'<a href="{html.escape(r["href"])}">\1</a>', txt, count=1)
                if new_html != txt:
                    frag = BeautifulSoup(new_html, "lxml").body
                    node.replace_with(frag.decode_contents())
                    r["limit"] -= 1
                    done += 1
                    txt = new_html

# ──────────────────────────────────────────────────────────────────────────────
# POSTPROCESS HTML
def postprocess_html(raw_html: str, lang: str, canon_url: str, out_path: Path) -> str:
    soup = BeautifulSoup(raw_html, "lxml")

    head = soup.find("head")
    if head:
        # pre-load fontów Inter (jeśli brak)
        if not soup.find("link", attrs={"rel":"preload","as":"font","href":"/assets/fonts/InterVariable.woff2"}):
            head.append(soup.new_tag("link", rel="preload", as_="font",
                                     href="/assets/fonts/InterVariable.woff2", crossorigin=True))
        if not soup.find("link", attrs={"rel":"preload","as":"font","href":"/assets/fonts/InterVariable-Italic.woff2"}):
            head.append(soup.new_tag("link", rel="preload", as_="font",
                                     href="/assets/fonts/InterVariable-Italic.woff2", crossorigin=True))
        # canonical (jeśli brak)
        if not soup.find("link", rel=lambda x: (x or "").lower()=="canonical"):
            head.append(soup.new_tag("link", rel="canonical", href=canon_url))

    # IMG
    for img in soup.find_all("img"):
        img.setdefault("alt", "")
        rewrite_img_srcset(img, lang)

    # noopener
    for a in soup.find_all("a"):
        if a.get("target") == "_blank":
            rel = set((a.get("rel") or []))
            rel.add("noopener")
            a["rel"] = " ".join(sorted(rel))

    # autolinki
    apply_autolinks(soup, lang)

    # JSON-LD sanity
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            json.loads(s.get_text() or "{}")
        except Exception as e:
            warn(str(out_path), f"JSON-LD parsing error: {e}")

    # mini-minifikacja + budżet HTML
    html_out = soup.decode()
    html_out = re.sub(r">\s+<", "><", html_out)
    html_out = re.sub(r"\s{2,}", " ", html_out)

    if gz_size(html_out.encode("utf-8")) > BUDGET_HTML_GZ:
        warn(str(out_path), f"HTML gzip > {BUDGET_HTML_GZ} B")

    # tytuł / opis / H1
    s2 = BeautifulSoup(html_out, "lxml")
    h1s = s2.find_all("h1")
    if len(h1s) != 1:
        warn(str(out_path), f"Nieprawidłowa liczba <h1>: {len(h1s)}")
    title = (s2.title.string if s2.title else "") or ""
    if len(title) < 25 or len(title) > 70:
        warn(str(out_path), f"TITLE {len(title)} znaków (zalec. 35–65)")
    md = s2.find("meta", attrs={"name":"description"})
    desc = (md["content"] if md and md.has_attr("content") else "")
    if len(desc) < 50 or len(desc) > 170:
        warn(str(out_path), f"Meta description {len(desc)} znaków (zalec. 80–160)")

    return html_out

# ──────────────────────────────────────────────────────────────────────────────
# RENDER STRON
def canon_for(lang: str, slug: str) -> str:
    path = f"/{lang}/" + (f"{slug}/" if slug else "")
    return SITE_URL + path

for page in PAGES:
    lang = (t(page.get("lang")) or DEFAULT_LANG).lower()
    slug = t(page.get("slug"))
    out_dir  = DIST / lang / slug if slug else DIST / lang
    out_path = out_dir / "index.html"
    mkdirp(out_path)

    tpl_name = template_for(page)
    samekey  = t(page.get("slugKey") or page.get("slug") or "home")

    related = [
        p for p in PAGES
        if (t(p.get("lang")) or DEFAULT_LANG).lower()==lang
        and t(p.get("parentSlug"))==t(page.get("parentSlug"))
        and t(p.get("slugKey") or p.get("slug")) != samekey
    ][:12]

    page_slug = t(page.get("slug"))
    page_faq = [
        f for f in FAQ
        if (t(f.get("lang")) or lang).lower()==lang
        and (t(f.get("page"))==page_slug or t(f.get("slug"))==page_slug)
    ]

    ctx = {
        "site_url": SITE_URL,
        "brand": BRAND,
        "updated": now_iso(),
        "company": COMPANY,
        "nav": NAV,
        "page": page,
        "pages": PAGES,  # <-- pełna lista stron (do przełącznika języków itp.)
        "page_html": t(page.get("page_html") or page.get("body_html") or page.get("body") or ""),
        "faq": page_faq,
        "related": related,
        "media": MEDIA,
        "head": {"canonical": canon_for(lang, slug), "site_url": SITE_URL, "brand": BRAND, "updated": now_iso()},
        "strings": strings_for(lang),
        "blog": BLOG,
        "authors": AUTHORS,
        "categories": CATEGORIES,
        "reviews": REVIEWS,
        "jobs": JOBS,
        "blocks": BLOCKS,
        "routes": ROUTES,
        "places": PLACES,
        "default_lang": DEFAULT_LANG,
    }

    # zapis debug kontekstu
    dbg_dir = DIST / "_debug" / (lang or DEFAULT_LANG) / (slug or "home")
    dbg_dir.mkdir(parents=True, exist_ok=True)
    with open(dbg_dir / "ctx.json", "w", encoding="utf-8") as df:
        json.dump(ctx, df, ensure_ascii=False, indent=2)

    try:
        tmpl = env.get_template(tpl_name)
    except TemplateNotFound:
        tmpl = env.get_template("page.html")

    raw   = tmpl.render(**ctx)
    final = postprocess_html(raw, lang, canon_for(lang, slug), out_path)
    out_path.write_text(final, encoding="utf-8")
    built_files.append(out_path)
    site_urls.append(canon_for(lang, slug))

    # zbiór wewnętrznych linków z pliku (do późniejszego checkera)
    soup = BeautifulSoup(final, "lxml")
    hrefs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/") and not href.startswith("//"):
            if "#" in href: href = href.split("#",1)[0]
            hrefs.append(href.rstrip("/"))
    INTERNAL_HREFS.append({"file": str(out_path), "hrefs": hrefs})

# ──────────────────────────────────────────────────────────────────────────────
# REDIRECTS
def write_redirect(src: str, dst: str):
    p = DIST / src.strip("/").rstrip("/") / "index.html"
    mkdirp(p)
    target = dst if dst.startswith("http") else (SITE_URL.rstrip("/") + "/" + dst.strip("/") + "/")
    p.write_text(
        f"""<!doctype html><html lang="{DEFAULT_LANG}"><head><meta charset="utf-8">
<meta name="robots" content="noindex,follow"><link rel="canonical" href="{target}">
</head><body><script>location.replace("{target}");</script>
<p>Redirecting to <a href="{target}">{target}</a></p></body></html>""",
        encoding="utf-8"
    )
    built_files.append(p)

for r in REDIRECTS:
    src = t(r.get("from") or r.get("src")); dst = t(r.get("to") or r.get("dst"))
    if src and dst: write_redirect(src, dst)

# ──────────────────────────────────────────────────────────────────────────────
# Indeksy bloga (jeśli są wpisy)
def write_blog_indexes():
    by_lang: Dict[str, List[dict]] = {}
    for post in BLOG:
        lang = (t(post.get("lang")) or DEFAULT_LANG).lower()
        by_lang.setdefault(lang, []).append(post)

    for lang, posts in by_lang.items():
        base = DIST / lang / "blog"
        base.mkdir(parents=True, exist_ok=True)

        # /{lang}/blog/
        idx = base / "index.html"
        posts_sorted = sorted(posts, key=lambda p: t(p.get("date") or ""), reverse=True)
        lis = "\n".join(
            f'<li><a href="/{lang}/{t(p.get("slug"))}/">{html.escape(t(p.get("title") or p.get("h1") or p.get("seo_title")))}'
            f'</a></li>' for p in posts_sorted
        )
        idx.write_text(
            f"<!doctype html><html lang='{lang}'><head><meta charset='utf-8'><title>Blog — {BRAND}</title>"
            f"<link rel='canonical' href='{SITE_URL}/{lang}/blog/'></head><body><h1>Blog</h1><ul>{lis}</ul></body></html>",
            encoding="utf-8"
        )
        built_files.append(idx); site_urls.append(f"{SITE_URL}/{lang}/blog/")

write_blog_indexes()

# ──────────────────────────────────────────────────────────────────────────────
# 404 / CNAME / sitemap / robots
def write_404():
    p = DIST / "404.html"
    p.write_text(
        f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><title>404 — {BRAND}</title>
<meta name="robots" content="noindex,follow"><link rel="canonical" href="{SITE_URL}/404.html"></head>
<body style="font:16px/1.6 system-ui,Segoe UI,Roboto,Arial;padding:3rem;background:#0b0f17;color:#e9eef4">
<h1>Nie znaleziono strony</h1><p><a href="{SITE_URL}/{DEFAULT_LANG}/" style="color:#ff8a1f">Wróć na stronę główną</a></p>
</body></html>""",
        encoding="utf-8"
    )
    built_files.append(p)

write_404()
if CNAME_TARGET:
    (DIST / "CNAME").write_text(CNAME_TARGET + "\n", encoding="utf-8")

def write_sitemap(urls: List[str]):
    today = datetime.utcnow().date().isoformat()
    body = ["<?xml version='1.0' encoding='UTF-8'?>",
            "<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"]
    for u in sorted(set(urls)):
        body.append(f"<url><loc>{html.escape(u)}</loc><lastmod>{today}</lastmod></url>")
    body.append("</urlset>")
    (DIST / "sitemap.xml").write_text("\n".join(body), encoding="utf-8")

write_sitemap(site_urls)
(DIST / "robots.txt").write_text(
    f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8"
)

# ──────────────────────────────────────────────────────────────────────────────
# LINK-CHECK
available: set[str] = set()
for f in built_files:
    rel = "/" + str(f.relative_to(DIST)).replace("\\", "/")
    if rel.endswith("/index.html"):
        available.add(rel[:-10]); available.add(rel)
    else:
        available.add(rel)

for item in INTERNAL_HREFS:
    src = item["file"]; hrefs = item["hrefs"]
    for href in hrefs:
        want1 = href.rstrip("/") + "/index.html"
        want2 = href.rstrip("/") + "/"
        if want1 not in available and want2 not in available:
            warn(src, f"Broken internal link: {href}")

# ──────────────────────────────────────────────────────────────────────────────
# SNAPSHOT ZIP
snap = DIST / "download" / "site.zip"
snap.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(snap, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for p in DIST.rglob("*"):
        if p.is_dir() or p == snap: continue
        zf.write(p, p.relative_to(DIST))

# ──────────────────────────────────────────────────────────────────────────────
# BUDŻETY CSS/JS (gzip)
def gz_sum_for(folder: Path, exts: Tuple[str,...]) -> int:
    total = 0
    if folder.exists():
        for p in folder.rglob("*"):
            if p.suffix.lower() in exts and p.is_file():
                total += gz_size(p.read_bytes())
    return total

css_gz = gz_sum_for(DIST / "assets" / "css", (".css",))
js_gz  = gz_sum_for(DIST / "assets" / "js",  (".js",))
if css_gz > BUDGET_CSS_GZ:
    warn("/assets/css", f"CSS gzip {css_gz}B > budżet {BUDGET_CSS_GZ}B")
if js_gz > BUDGET_JS_GZ:
    warn("/assets/js", f"JS gzip {js_gz}B > budżet {BUDGET_JS_GZ}B")

# ──────────────────────────────────────────────────────────────────────────────
# LOG / EXIT
if not ISSUES:
    (DIST / "build_ok.txt").write_text("OK " + now_iso(), encoding="utf-8")
else:
    lines = [f"[{x['level'].upper()}] {x['path']}: {x['msg']}" for x in ISSUES]
    (DIST / "issues.log").write_text("\n".join(lines), encoding="utf-8")
for x in ISSUES: print(f"[{x['level'].upper()}] {x['path']}: {x['msg']}")
if any(x["level"]=="error" for x in ISSUES) and STRICT:
    raise SystemExit(1)
print("Build finished:", len(built_files), "files ; CSS.gz=", css_gz, "JS.gz=", js_gz)
