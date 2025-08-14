#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kras-Trans • Static build PRO (lekki, bez headless)
- Wejście: data/cms.json (Apps Script)
- Szablony: templates/*.html (Jinja2)
- Zasoby: /assets -> /dist/assets
- Postprocessing: HTML min, autolinki, lazy/decoding, link-check
- Obrazy: WEBP + srcset + width/height (Pillow)
- SEO sanity: title/desc/H1/canonical/hreflang/JSON-LD
- Budżety: HTML/CSS/JS (gzip)
- Wyjście: sitemap.xml, robots.txt, 404, CNAME, snapshot ZIP
- Indeksy: /{lang}/blog/, /{lang}/blog/kategoria/{cat}/, /{lang}/autor/{slug}/ (jeśli są dane)

ENV (opcjonalne):
  SITE_URL, DEFAULT_LANG, BRAND, CNAME, STRICT (1/0)
"""

from __future__ import annotations
import os, re, io, json, gzip, shutil, zipfile, html, base64, hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any, Tuple
from urllib.parse import urljoin

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from bs4 import BeautifulSoup, NavigableString
from slugify import slugify

# Pillow (obrazy)
try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 80_000_000  # safety
except Exception:
    Image = None

# ──────────────────────────────────────────────────────────────────────────────
# ŚCIEŻKI / ENV
ROOT   = Path(__file__).resolve().parents[1]
DATA   = ROOT / "data" / "cms.json"
TPLS   = ROOT / "templates"
ASSETS = ROOT / "assets"
DIST   = ROOT / "dist"

SITE_URL      = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG  = (os.getenv("DEFAULT_LANG") or "pl").lower()
BRAND         = os.getenv("BRAND", "Kras-Trans")
CNAME_TARGET  = os.getenv("CNAME", "").strip()
STRICT        = int(os.getenv("STRICT", "1"))

# Budżety (gzip)
BUDGET_HTML_GZ = 40 * 1024  # 40KB
BUDGET_CSS_GZ  = 120 * 1024 # 120KB  (całość CSS)
BUDGET_JS_GZ   = 150 * 1024 # 150KB  (całość JS)

# Obrazy
RESP_WIDTHS = [480, 768, 1024, 1440, 1920]  # generujemy warianty do srcset
WEBP_QUALITY = 82

MAX_AUTOLINKS_PER_P_OR_LI = 2

# ──────────────────────────────────────────────────────────────────────────────
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def t(x: Any) -> str:
    if x is None: return ""
    if isinstance(x, (int, float)): return str(x)
    return str(x).strip()

def gz_size(b: bytes) -> int:
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode="wb") as gz:
        gz.write(b)
    return len(bio.getvalue())

def mkdirp(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)

ISSUES: List[Dict[str, str]] = []
def warn(path: str, msg: str):
    ISSUES.append({"level":"warn","path":path,"msg":msg})
def fail(path: str, msg: str):
    ISSUES.append({"level":"error","path":path,"msg":msg})

# ──────────────────────────────────────────────────────────────────────────────
# CMS JSON
if not DATA.exists():
    raise SystemExit("Brak data/cms.json (sprawdź krok 'Fetch CMS JSON').")

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
# STRINGS
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

# ──────────────────────────────────────────────────────────────────────────────
# TEMPLATE DOBÓR
def template_for(page: dict) -> str:
    name = t(page.get("template"))
    if name and (TPLS / name).exists():
        return name
    ptype = t(page.get("type")).lower() or "page"
    for row in TEMPLS_CMS:
        if t(row.get("type")).lower() == ptype:
            f = t(row.get("file"))
            if f and (TPLS / f).exists(): return f
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
built_urls:  List[str] = []
INTERNAL_HREFS: Dict[str, List[str]] = []

# ──────────────────────────────────────────────────────────────────────────────
# OBRAZY: warianty WEBP + wymiary

def image_dims(p: Path) -> Tuple[int,int] | None:
    if not Image: return None
    try:
        with Image.open(p) as im:
            return im.width, im.height
    except Exception:
        return None

def ensure_webp_variants(src_path: Path) -> List[Tuple[int, Path]]:
    """
    Zwraca listę (width, path) WEBP dla danego obrazu.
    Tworzy tylko do maksymalnej szerokości źródła.
    """
    out: List[Tuple[int, Path]] = []
    if not Image: return out
    try:
        with Image.open(src_path) as im:
            w0, h0 = im.width, im.height
            base = src_path.stem
            out_dir = (DIST / "assets" / "media" / "responsive")
            out_dir.mkdir(parents=True, exist_ok=True)
            for w in RESP_WIDTHS:
                if w >= w0:  # nie powiększamy
                    w = w0
                h = int(h0 * (w / w0))
                out_name = f"{base}-w{w}.webp"
                out_path = out_dir / out_name
                if not out_path.exists():
                    rim = im.resize((w, h), Image.LANCZOS)
                    rim.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
                out.append((w, out_path))
                if w == w0: break
    except Exception as e:
        warn(str(src_path), f"WEBP gen fail: {e}")
    return out

def rewrite_img_srcset(tag, doc_lang: str):
    """
    Uzupełnia width/height, srcset + sizes, lazy/decoding.
    Działa dla obrazów w /assets/(media|img)/.
    """
    src = t(tag.get("src"))
    if not src.startswith("/assets/"): return
    abs_src = DIST / src.lstrip("/")
    if not abs_src.exists():
        # gdyby w szablonie był relatywny ../ – spróbujmy doczepić od DIST
        return

    # wymiary
    dims = image_dims(abs_src)
    if dims:
        w, h = dims
        if not tag.get("width"):  tag["width"]  = str(w)
        if not tag.get("height"): tag["height"] = str(h)

    # hero – nie ruszamy fetchpriority
    classes = " ".join(tag.get("class", [])).lower()
    if "hero-media" not in classes:
        tag["loading"]  = tag.get("loading", "lazy")
        tag["decoding"] = tag.get("decoding", "async")

    # srcset WEBP
    variants = ensure_webp_variants(abs_src)
    if variants:
        # posortuj rosnąco po szerokości
        variants.sort(key=lambda x: x[0])
        srcset = ", ".join([
            f"/assets/media/responsive/{v[1].name} {w}w" for (w, v) in variants
        ])
        tag["srcset"] = srcset
        # sizes heurystyka
        if "hero-media" in classes:
            sizes = "100vw"
        else:
            sizes = "(max-width: 900px) 92vw, 50vw"
        tag["sizes"] = tag.get("sizes", sizes)

# ──────────────────────────────────────────────────────────────────────────────
# AUTOLINKI (whitelist)
def build_autolink_rules(lang: str):
    rules = []
    for r in AUTOLINKS:
        if (t(r.get("enabled")) or "TRUE").upper() != "TRUE": continue
        if (t(r.get("lang")) or DEFAULT_LANG).lower() != (lang or DEFAULT_LANG).lower(): continue
        anchor = t(r.get("anchor") or r.get("kw"))
        href   = t(r.get("href") or r.get("url"))
        limit  = int(r.get("limit") or MAX_AUTOLINKS_PER_P_OR_LI)
        if anchor and href:
            rules.append({"anchor":anchor, "href":href, "limit":limit})
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
                pat = re.compile(rf"(?i)\b({re.escape(r['anchor'])})\b")
                if not pat.search(txt): continue
                new_html = pat.sub(rf'<a href="{html.escape(r["href"])}">\1</a>', txt, count=1)
                if new_html != txt:
                    frag = BeautifulSoup(new_html, "lxml").body
                    node.replace_with(frag.decode_contents())
                    r["limit"] -= 1
                    done += 1
                    txt = new_html  # kontynuacja po podmianie

# ──────────────────────────────────────────────────────────────────────────────
# POSTPROCESS
def postprocess_html(raw_html: str, lang: str, canon_url: str, out_path: Path) -> str:
    soup = BeautifulSoup(raw_html, "lxml")

    # 0) preload hero & fonty (jeśli są i brak w <head>)
    head = soup.find("head")
    if head:
        # fonty Inter
        if not soup.find("link", attrs={"rel":"preload","as":"font","href":"/assets/fonts/InterVariable.woff2"}):
            l1 = soup.new_tag("link", rel="preload", as_="font", href="/assets/fonts/InterVariable.woff2", crossorigin=True)
            head.append(l1)
        if not soup.find("link", attrs={"rel":"preload","as":"font","href":"/assets/fonts/InterVariable-Italic.woff2"}):
            l2 = soup.new_tag("link", rel="preload", as_="font", href="/assets/fonts/InterVariable-Italic.woff2", crossorigin=True)
            head.append(l2)
        # canonical (jeśli brak)
        if not soup.find("link", rel=lambda x: (x or "").lower()=="canonical"):
            head.append(soup.new_tag("link", rel="canonical", href=canon_url))

    # 1) IMG: lazy/decoding + width/height + srcset/sizes
    for img in soup.find_all("img"):
        if not img.get("alt"): img["alt"] = ""
        rewrite_img_srcset(img, lang)

    # 2) target=_blank -> noopener
    for a in soup.find_all("a"):
        if a.get("target") == "_blank":
            rel = set((a.get("rel") or []))
            rel.add("noopener")
            a["rel"] = " ".join(sorted(rel))

    # 3) autolinki (delikatne)
    apply_autolinks(soup, lang)

    # 4) JSON-LD sanity (parsowalność)
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            json.loads(s.get_text() or "{}")
        except Exception as e:
            warn(str(out_path), f"JSON-LD parsing error: {e}")

    # 5) lekka minifikacja
    html_out = soup.decode()
    html_out = re.sub(r">\s+<", "><", html_out)
    html_out = re.sub(r"\s{2,}", " ", html_out)

    # 6) budżet HTML gzip
    if gz_size(html_out.encode("utf-8")) > BUDGET_HTML_GZ:
        warn(str(out_path), f"HTML gzip > {BUDGET_HTML_GZ} B")

    # 7) H1 i meta description/title
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
# RENDER
site_urls: List[str] = []
def canon_for(lang: str, slug: str) -> str:
    path = f"/{lang}/" + (f"{slug}/" if slug else "")
    return SITE_URL + path

for page in PAGES:
    lang = (t(page.get("lang")) or DEFAULT_LANG).lower()
    slug = t(page.get("slug"))
    out_dir = DIST / lang / slug if slug else DIST / lang
    out_path = out_dir / "index.html"
    mkdirp(out_path)

    tpl_name = template_for(page)
    samekey = t(page.get("slugKey") or page.get("slug") or "home")

    related = [p for p in PAGES
               if (t(p.get("lang")) or DEFAULT_LANG).lower()==lang
               and t(p.get("parentSlug"))==t(page.get("parentSlug"))
               and t(p.get("slugKey") or p.get("slug")) != samekey][:12]

    page_slug = t(page.get("slug"))
    page_faq = [f for f in FAQ
                if (t(f.get("lang")) or lang).lower()==lang
                and (t(f.get("page"))==page_slug or t(f.get("slug"))==page_slug)]

    ctx = {
        "site_url": SITE_URL,
        "brand": BRAND,
        "updated": now_iso(),
        "company": COMPANY,
        "nav": NAV,
        "page": page,
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

    try:
        tmpl = env.get_template(tpl_name)
    except TemplateNotFound:
        tmpl = env.get_template("page.html")

    raw = tmpl.render(**ctx)
    final = postprocess_html(raw, lang, canon_for(lang, slug), out_path)
    out_path.write_text(final, encoding="utf-8")
    built_files.append(out_path)
    site_urls.append(canon_for(lang, slug))

    # zbiór wewnętrznych linków
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
    htmlx = f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><meta name="robots" content="noindex,follow">
<link rel="canonical" href="{target}"></head>
<body><script>location.replace("{target}");</script>
<p>Redirecting to <a href="{target}">{target}</a></p></body></html>"""
    p.write_text(htmlx, encoding="utf-8"); built_files.append(p)

for r in REDIRECTS:
    src = t(r.get("from") or r.get("src")); dst = t(r.get("to") or r.get("dst"))
    if src and dst: write_redirect(src, dst)

# ──────────────────────────────────────────────────────────────────────────────
# INDEKSY: BLOG / KATEGORIE / AUTORZY (prosty HTML, jeśli nie ma template)
def write_blog_indexes():
    by_lang: Dict[str, List[dict]] = {}
    for post in BLOG:
        lang = (t(post.get("lang")) or DEFAULT_LANG).lower()
        by_lang.setdefault(lang, []).append(post)

    for lang, posts in by_lang.items():
        base = DIST / lang / "blog"
        (base).mkdir(parents=True, exist_ok=True)
        # index
        idx = base / "index.html"
        posts_sorted = sorted(posts, key=lambda p: t(p.get("date") or ""), reverse=True)
        items = "\n".join([f'<li><a href="/{lang}/{t(p.get("slug"))}/">{html.escape(t(p.get("title") or p.get("h1") or p.get("seo_title")))}'
                           f'</a></li>' for p in posts_sorted])
        idx.write_text(f"""<!doctype html><html lang="{lang}"><head>
<meta charset="utf-8"><title>Blog — {BRAND}</title>
<link rel="canonical" href="{SITE_URL}/{lang}/blog/"></head>
<body><h1>Blog</h1><ul>{items}</ul></body></html>""", encoding="utf-8")
        built_files.append(idx); site_urls.append(f"{SITE_URL}/{lang}/blog/")

        # kategorie
        by_cat: Dict[str, List[dict]] = {}
        for p in posts:
            cats = t(p.get("category") or p.get("categories") or "")
            for c in [x.strip() for x in cats.split(",") if x.strip()]:
                by_cat.setdefault(c, []).append(p)
        for cat, plist in by_cat.items():
            d = base / "kategoria" / slugify(cat)
            d.mkdir(parents=True, exist_ok=True)
            cat_url = f"{SITE_URL}/{lang}/blog/kategoria/{slugify(cat)}/"
            li = "\n".join([f'<li><a href="/{lang}/{t(p.get("slug"))}/">{html.escape(t(p.get("title") or p.get("h1") or p.get("seo_title")))}'
                            f'</a></li>' for p in plist])
            (d / "index.html").write_text(
                f"<!doctype html><html lang='{lang}'><head><meta charset='utf-8'><title>Blog: {html.escape(cat)} — {BRAND}</title>"
                f"<link rel='canonical' href='{cat_url}'></head><body><h1>Kategoria: {html.escape(cat)}</h1><ul>{li}</ul></body></html>",
                encoding="utf-8"
            )
            built_files.append(d / "index.html"); site_urls.append(cat_url)

        # autorzy
        auth_map = {t(a.get("slug")): a for a in AUTHORS}
        by_auth: Dict[str, List[dict]] = {}
        for p in posts:
            a = t(p.get("author") or p.get("author_slug"))
            if a: by_auth.setdefault(a, []).append(p)
        for a_slug, plist in by_auth.items():
            a = auth_map.get(a_slug) or {}
            d = DIST / lang / "autor" / a_slug
            d.mkdir(parents=True, exist_ok=True)
            a_url = f"{SITE_URL}/{lang}/autor/{a_slug}/"
            li = "\n".join([f'<li><a href="/{lang}/{t(p.get("slug"))}/">{html.escape(t(p.get("title") or p.get("h1") or p.get("seo_title")))}'
                            f'</a></li>' for p in plist])
            (d / "index.html").write_text(
                f"<!doctype html><html lang='{lang}'><head><meta charset='utf-8'><title>Autor: {html.escape(t(a.get('name') or a_slug))} — {BRAND}</title>"
                f"<link rel='canonical' href='{a_url}'></head><body><h1>Autor: {html.escape(t(a.get('name') or a_slug))}</h1><ul>{li}</ul></body></html>",
                encoding="utf-8"
            )
            built_files.append(d / "index.html"); site_urls.append(a_url)

write_blog_indexes()

# ──────────────────────────────────────────────────────────────────────────────
# 404 / CNAME / sitemap / robots
def write_404():
    p = DIST / "404.html"
    p.write_text(f"""<!doctype html><html lang="{DEFAULT_LANG}">
<head><meta charset="utf-8"><title>404 — {BRAND}</title>
<meta name="robots" content="noindex,follow"><link rel="canonical" href="{SITE_URL}/404.html"></head>
<body style="font:16px/1.6 system-ui,Segoe UI,Roboto,Arial;padding:3rem;background:#0b0f17;color:#e9eef4">
<h1>Nie znaleziono strony</h1><p><a href="{SITE_URL}/{DEFAULT_LANG}/" style="color:#ff8a1f">Wróć na stronę główną</a></p></body></html>""", encoding="utf-8")
    built_files.append(p)
write_404()

if CNAME_TARGET:
    (DIST / "CNAME").write_text(CNAME_TARGET + "\n", encoding="utf-8")

def write_sitemap(urls: List[str]):
    now = datetime.utcnow().date().isoformat()
    body = ["<?xml version='1.0' encoding='UTF-8'?>",
            "<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"]
    for u in sorted(set(urls)):
        body.append(f"<url><loc>{html.escape(u)}</loc><lastmod>{now}</lastmod></url>")
    body.append("</urlset>")
    (DIST / "sitemap.xml").write_text("\n".join(body), encoding="utf-8")
write_sitemap(site_urls)

(DIST / "robots.txt").write_text(
    f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n",
    encoding="utf-8"
)

# ──────────────────────────────────────────────────────────────────────────────
# LINK CHECK (wewnętrzne)
available: set[str] = set()
for f in built_files:
    rel = "/" + str(f.relative_to(DIST)).replace("\\", "/")
    if rel.endswith("/index.html"):
        available.add(rel[:-10])  # katalog
        available.add(rel)        # plik
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
        if p.is_dir(): continue
        if p == snap: continue
        zf.write(p, p.relative_to(DIST))

# ──────────────────────────────────────────────────────────────────────────────
# BUDŻETY CSS/JS (gzip sumaryczne)
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
    warn("/assets/css", f"CSS gzip {css_gz}B > budżet {BUDGET_CSS_GZ}B (rozważ PurgeCSS/krytyczny CSS)")
if js_gz > BUDGET_JS_GZ:
    warn("/assets/js", f"JS gzip {js_gz}B > budżet {BUDGET_JS_GZ}B (odłóż niekrytyczne skrypty na 'defer/load')")

# ──────────────────────────────────────────────────────────────────────────────
# LOG / EXIT
def write_issues():
    if not ISSUES:
        (DIST / "build_ok.txt").write_text("OK " + now_iso(), encoding="utf-8"); return
    lines = [f"[{x['level'].upper()}] {x['path']}: {x['msg']}" for x in ISSUES]
    (DIST / "issues.log").write_text("\n".join(lines), encoding="utf-8")
write_issues()

errors = [x for x in ISSUES if x["level"]=="error"]
for x in ISSUES: print(f"[{x['level'].upper()}] {x['path']}: {x['msg']}")
if errors and STRICT:
    raise SystemExit(1)
print("Build finished:", len(built_files), "files ; CSS.gz=", css_gz, "JS.gz=", js_gz)
