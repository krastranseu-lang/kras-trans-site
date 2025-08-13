#!/usr/bin/env python3
# tools/build.py
# Kompletny builder dla kras-trans.com
# Wymagane: Jinja2, markdown (instalujesz w workflow: pip install Jinja2 markdown)

from __future__ import annotations
import os, re, json, time, shutil, pathlib, zipfile, hashlib
from typing import Dict, List, Any, Tuple, Optional
from jinja2 import Environment, FileSystemLoader, select_autoescape

# ────────────────────────────────────────────────────────────────────────────────
# ŚCIEŻKI I KONFIG
# ────────────────────────────────────────────────────────────────────────────────
ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA = ROOT / "data" / "cms.json"
TPL_DIR = ROOT / "templates"
STATIC_DIR = ROOT / "static"
ASSETS_DIR = ROOT / "assets"

# Możesz nadpisać przez ENV w pages.yml
SITE_URL     = os.getenv("SITE_URL", "https://kras-trans.com").rstrip("/")
DEFAULT_LANG = os.getenv("DEFAULT_LANG", "pl").strip("/") or "pl"
BRAND        = os.getenv("BRAND", "Kras-Trans")

# Google
GA_ID           = os.getenv("GA_ID", "")  # np. G-5FYE42J3BE
GSC_VERIFICATION = os.getenv("GSC_VERIFICATION", "")  # np. Q3XgXOegwnvV6sBj31MbGlldhfD2uzmHBnR6kvLFj7Y

# CNAME (GitHub Pages)
CNAME_VALUE = os.getenv("CNAME", "kras-trans.com")

# ────────────────────────────────────────────────────────────────────────────────
# UTYLITY
# ────────────────────────────────────────────────────────────────────────────────
def clean_dist():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def copy_dir(src: pathlib.Path, dst: pathlib.Path):
    if src.exists():
        shutil.copytree(src, dst, dirs_exist_ok=True)

def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-/_]", "", s)
    s = s.strip("/")
    return s

def ensure_dir(p: pathlib.Path):
    p.parent.mkdir(parents=True, exist_ok=True)

def write(path: pathlib.Path, content: str):
    ensure_dir(path)
    path.write_text(content, "utf-8")

def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def minify_html(html: str) -> str:
    # Bezpieczna, „lekka” minifikacja (nie zjada <pre>, ale upraszcza whitespace)
    html = re.sub(r">\s+<", "><", html)        # spacje między tagami
    html = re.sub(r"\s{2,}", " ", html)       # ciągi spacji
    html = re.sub(r"<!--[^>]*-->", "", html)  # komentarze
    return html.strip()

def join_url(*parts: str) -> str:
    return "/".join(x.strip("/") for x in parts if x is not None)

# ────────────────────────────────────────────────────────────────────────────────
# JINJA
# ────────────────────────────────────────────────────────────────────────────────
def jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TPL_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    # Filtry pomocnicze
    env.filters["tojson"] = lambda obj: json.dumps(obj, ensure_ascii=False)
    return env

# ────────────────────────────────────────────────────────────────────────────────
# DANE (CMS JSON)
# ────────────────────────────────────────────────────────────────────────────────
def load_cms() -> Dict[str, Any]:
    if not DATA.exists():
        raise SystemExit(f"ERROR: {DATA} not found (fetch step should create it)")
    j = json.loads(DATA.read_text("utf-8"))
    if not j.get("ok"):
        raise SystemExit("ERROR: cms.json ok=false")
    return j

# ────────────────────────────────────────────────────────────────────────────────
# HEAD / SEO
# ────────────────────────────────────────────────────────────────────────────────
def build_canonical(lang: str, slug: str) -> str:
    lang = (lang or DEFAULT_LANG).strip("/")
    slug = (slug or "").strip("/")
    if not slug or slug in ("", "home"):
        return f"{SITE_URL}/{lang}/"
    return f"{SITE_URL}/{lang}/{slug}/"

def build_jsonld_org(company: Dict[str, Any]) -> Dict[str, Any]:
    # LocalBusiness/Organization (minimalny, bezpieczny)
    name = company.get("name") or company.get("legal_name") or BRAND
    tel  = company.get("telephone", "")
    same_as = []
    for k in ("facebook", "instagram", "linkedin", "twitter", "youtube"):
        url = (company.get(k) or "").strip()
        if url:
            same_as.append(url)
    ld = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": name,
        "url": SITE_URL,
    }
    if tel:
        ld["telephone"] = tel
    if same_as:
        ld["sameAs"] = same_as
    # tag weryfikacji GSC – jako meta robimy w <head>, nie w LD
    return ld

def build_head(page: Dict[str, Any], company: Dict[str, Any]) -> Dict[str, Any]:
    title = page.get("seo_title") or page.get("title") or page.get("h1") or BRAND
    desc  = page.get("meta_description") or page.get("lead") or ""
    if not desc:
        desc = "Ekspresowy transport 24/7 — busy 3.5 t, ADR na życzenie. Europa (PL, DE, FR, IT, ES)."
    canonical = build_canonical(page.get("lang"), page.get("slug"))

    og_img = page.get("og_image") or f"{SITE_URL}/static/img/placeholder-hero-desktop.webp"

    # hreflangi (proste: jeżeli są inne warianty lang dla tej samej 'slugKey' lub 'slug')
    hreflangs = []
    x_default = None
    # ścieżka: zrobimy to później, kiedy mamy listę wszystkich stron (tu: placeholder)
    head = {
        "title": title,
        "description": desc[:300],
        "canonical": canonical,
        "og_title": title,
        "og_description": desc[:300],
        "og_image": og_img,
        "jsonld": [build_jsonld_org(company)],
        "hreflangs": hreflangs,
        "x_default": x_default,
        "ga_id": GA_ID,
        "gsc_meta": GSC_VERIFICATION,
    }
    return head

# ────────────────────────────────────────────────────────────────────────────────
# RELATED / PROSTA LOGIKA
# ────────────────────────────────────────────────────────────────────────────────
def pick_related(pages: List[Dict[str, Any]], cur: Dict[str, Any], limit=5) -> List[Dict[str, Any]]:
    cur_tags = set(cur.get("tags") or [])
    cur_lang = cur.get("lang") or DEFAULT_LANG
    # ten sam język, wspólne tagi
    out = []
    for p in pages:
        if p is cur:
            continue
        if (p.get("lang") or DEFAULT_LANG) != cur_lang:
            continue
        score = len(cur_tags.intersection(set(p.get("tags") or [])))
        if score > 0:
            out.append((score, p))
    out.sort(key=lambda x: (-x[0], (x[1].get("weight") or 0)))
    return [p for _, p in out[:limit]]

# ────────────────────────────────────────────────────────────────────────────────
# PISANIE PLIKÓW GLOBALNYCH
# ────────────────────────────────────────────────────────────────────────────────
def write_robots():
    content = f"""User-agent: *
Allow: /
Sitemap: {SITE_URL}/sitemap.xml
"""
    write(DIST / "robots.txt", content)

def write_cname():
    write(DIST / "CNAME", f"{CNAME_VALUE}\n")

def write_root_redirect(default_lang=DEFAULT_LANG):
    target = f"/{default_lang.strip('/')}/"
    html = f"""<!doctype html><html lang="en">
<head>
  <meta charset="utf-8">
  <title>{BRAND}</title>
  <meta http-equiv="refresh" content="0; url={target}">
  <link rel="canonical" href="{SITE_URL}{target}">
  <meta name="robots" content="noindex,follow">
</head>
<body>
  <p>Przenoszę do <a href="{target}">{target}</a>…</p>
  <script>location.replace("{target}")</script>
</body></html>"""
    write(DIST / "index.html", html)

def write_404(lang="pl"):
    # prosty 404 w danym języku
    msg = "Nie znaleziono" if lang == "pl" else "Not found"
    html = f"""<!doctype html><html lang="{lang}">
<head>
  <meta charset="utf-8">
  <title>404 — {msg}</title>
  <meta name="robots" content="noindex,follow">
  <link rel="stylesheet" href="/static/css/site.css">
</head>
<body>
  <main style="padding:2rem;max-width:720px;margin:auto">
    <h1>404 — {msg}</h1>
    <p>Ups! Tej strony nie ma. Wróć do <a href="/{lang}/">strony głównej</a>.</p>
  </main>
</body></html>"""
    write(DIST / "404.html", html) if lang == "pl" else None
    # również 404 pod /{lang}/
    write(DIST / lang / "404.html", html)

def write_sitemap(pages: List[Dict[str, Any]]):
    now = now_iso()
    urls = []
    # unikalne canonicale
    seen = set()
    for p in pages:
        loc = build_canonical(p.get("lang"), p.get("slug"))
        if loc in seen:
            continue
        seen.add(loc)
        urls.append(f"<url><loc>{loc}</loc><lastmod>{now}</lastmod></url>")
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n' \
          f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' \
          + "\n".join(urls) + "\n</urlset>\n"
    write(DIST / "sitemap.xml", xml)

# ────────────────────────────────────────────────────────────────────────────────
# RENDEROWANIE STRON
# ────────────────────────────────────────────────────────────────────────────────
def compute_hreflangs(all_pages: List[Dict[str, Any]]) -> Dict[Tuple[str, str], List[Tuple[str, str]]]:
    """
    Zwraca mapę (slugKey, slug?) → listę (lang, url) wariantów językowych.
    Priorytet: jeśli w danych masz 'slugKey' to grupujemy po nim;
    w przeciwnym razie grupujemy po (slug, type).
    """
    groups = {}
    for p in all_pages:
        key = p.get("slugKey") or f"{p.get('slug','')}-{p.get('type','')}"
        key = (key, p.get("type",""))
        lang = (p.get("lang") or DEFAULT_LANG).strip("/")
        url  = build_canonical(lang, p.get("slug"))
        groups.setdefault(key, []).append((lang, url))
    return groups

def render_pages(env: Environment, cms: Dict[str, Any]):
    pages_raw: List[Dict[str, Any]] = cms.get("pages") or []
    company = (cms.get("company") or [{}])[0]

    # Normalizacja podstawowa
    norm = []
    for r in pages_raw:
        p = {k: r.get(k) for k in r.keys()}
        p["lang"] = (p.get("lang") or DEFAULT_LANG).strip("/")
        p["slug"] = slugify(p.get("slug") or ("home" if p.get("type")=="home" else ""))
        p["tags"] = p.get("tags") or p.get("mdtags") or []
        norm.append(p)

    # Hreflangi – pre-komputacja
    hreflang_map = compute_hreflangs(norm)

    tpl = env.get_template("page.html")

    rendered = []
    for p in norm:
        # ścieżka do pliku
        lang = p["lang"]
        is_home = (p.get("type") == "home") or (p.get("slug") in ("", "home"))
        out_dir = DIST / lang
        if not is_home:
            out_dir = out_dir / p["slug"]
        out_path = out_dir / "index.html"

        # head
        head = build_head(p, company)
        # uzupełnij hreflangi
        key = p.get("slugKey") or f"{p.get('slug','')}-{p.get('type','')}"
        key = (key, p.get("type",""))
        hreflangs = [
            {"lang": L, "url": U} for (L, U) in sorted(hreflang_map.get(key, []), key=lambda x: x[0])
        ]
        head["hreflangs"] = hreflangs
        # x-default → język domyślny
        for h in hreflangs:
            if h["lang"] == DEFAULT_LANG:
                head["x_default"] = h["url"]
                break

        # related
        related = pick_related(norm, p, limit=int(p.get("max_outlinks") or 6))

        # wstrzykuj GA i GSC przez head (template je wykorzysta)
        # head["ga_id"] = GA_ID  (już ustawione)
        # head["gsc_meta"] = GSC_VERIFICATION

        html = tpl.render(
            page=p,
            head=head,
            company=cms.get("company") or [],
            related=related,
            site_url=SITE_URL,
            brand=BRAND,
        )
        html = minify_html(html)
        write(out_path, html)
        rendered.append(p)

    return rendered

# ────────────────────────────────────────────────────────────────────────────────
# ZIP (opcjonalnie)
# ────────────────────────────────────────────────────────────────────────────────
def write_snapshot_zip(enable=True):
    if not enable:
        return
    zpath = ROOT / "site-snapshot.zip"
    if zpath.exists():
        zpath.unlink()
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(DIST))

# ────────────────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────────────────
def main():
    print("== Build start ==")
    clean_dist()
    copy_dir(STATIC_DIR, DIST / "static")
    copy_dir(ASSETS_DIR, DIST / "assets")

    cms = load_cms()
    env = jinja_env()

    # 1) Redirect z ROOT → /pl/
    write_root_redirect(DEFAULT_LANG)

    # 2) Render stron
    rendered = render_pages(env, cms)

    # 3) Globalne pliki
    write_robots()
    write_sitemap(rendered)
    write_cname()

    # 4) 404 (global + per-lang obecnych)
    langs = sorted({(p.get("lang") or DEFAULT_LANG) for p in rendered} | {DEFAULT_LANG})
    for lg in langs:
        write_404(lg)

    # 5) Snapshot (żebyś mógł pobrać ZIP artefaktu w Actions)
    write_snapshot_zip(enable=True)

    print(f"== Done. Pages: {len(rendered)}, Langs: {', '.join(langs)} ==")

if __name__ == "__main__":
    main()
