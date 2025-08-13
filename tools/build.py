#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, os, shutil, time, pathlib, zipfile
from urllib.parse import urljoin
from jinja2 import Environment, FileSystemLoader, select_autoescape
import markdown as md

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA = ROOT / "data" / "cms.json"
STATIC_IN = ROOT / "static"
ASSETS_IN = ROOT / "assets"

# ===== helpers =====

def log(*a): print("[build]", *a)

def clean_dist():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def copy_tree(src: pathlib.Path, dst: pathlib.Path):
    if src.exists():
        shutil.copytree(src, dst, dirs_exist_ok=True)

def site_url():
    # pozwala nadpisać w Actions: env SITE_URL, domyślnie docelowa domena
    return os.environ.get("SITE_URL", "https://kras-trans.com").rstrip("/")

def lang_path(lang: str, slug: str, typ: str):
    lang = (lang or "pl").strip("/")
    slug = (slug or "").strip("/")
    # home -> /{lang}/index.html
    if typ == "home":
        return f"/{lang}/index.html"
    # pozostałe -> /{lang}/{slug}/index.html (gdy slug pusty potraktuj jak home)
    if not slug:
        return f"/{lang}/index.html"
    return f"/{lang}/{slug}/index.html"

def url_from_path(path_html: str):
    # zamienia ścieżkę /pl/xyz/index.html -> https://.../pl/xyz/
    u = site_url() + path_html.replace("index.html","")
    return u

def ensure_parent(p: pathlib.Path):
    p.parent.mkdir(parents=True, exist_ok=True)

def render_markdown(txt: str) -> str:
    if not txt: return ""
    return md.markdown(txt, extensions=["extra","sane_lists","tables"])

# ===== main build =====

def load_cms():
    if not DATA.exists():
        raise SystemExit("data/cms.json not found")
    j = json.loads(DATA.read_text("utf-8"))
    if not j.get("ok"):
        raise SystemExit("cms.json ok=false")
    return j

def jinja_env():
    env = Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html"])
    )
    # filtr do absolutnych URL-i
    env.filters["abs"] = lambda rel: urljoin(site_url()+"/", rel.lstrip("/"))
    return env

def compute_hreflang(pages):
    # grupujemy po slugKey -> budujemy wzajemne alternatywy
    by_key = {}
    for p in pages:
        key = (p.get("slugKey") or "").strip()
        if not key: 
            continue
        by_key.setdefault(key, []).append(p)
    altmap = {}
    for key, group in by_key.items():
        for p in group:
            alts = []
            for q in group:
                href = url_from_path(lang_path(q.get("lang"), q.get("slug"), q.get("type")))
                alts.append({"lang": q.get("lang") or "pl", "url": href})
            altmap[p.get("id") or f"{p.get('lang')}::{p.get('slug')}"] = {
                "alts": alts,
                "x_default": url_from_path(lang_path(group[0].get("lang"), group[0].get("slug"), group[0].get("type")))
            }
    return altmap

def choose_related(pages, page, kmin=3, kmax=6):
    """Bardzo bezpieczne powiązania: rodzeństwo + parent/children po parentSlug."""
    same_parent = [p for p in pages 
                   if p is not page and (p.get("parentSlug") or "") == (page.get("parentSlug") or "")]
    # fallback: ten sam typ lub tagi
    if len(same_parent) < kmin:
        tags = set((page.get("tags") or []))
        more = [p for p in pages if p is not page and tags.intersection(set(p.get("tags") or []))]
        same_parent += [m for m in more if m not in same_parent]
    return same_parent[:kmax]

def build():
    clean_dist()
    j = load_cms()

    pages = j.get("pages", [])
    company = j.get("company", [])
    strings = j.get("strings", [])
    faq = j.get("faq", [])
    media = j.get("media", [])
    redirects = j.get("redirects", [])
    # kosmetyka: publikuj tylko publish==true lub brak pola (home mógł nie mieć)
    pages = [p for p in pages if p.get("publish") in (True, "TRUE", "true", "", None)]

    env = jinja_env()
    tpl = env.get_template("page.html")

    # hreflang
    hl = compute_hreflang(pages)

    # render
    rendered = 0
    for pg in pages:
        # HTML z Markdown
        body_html = render_markdown(pg.get("body_md", ""))
        pg_out = dict(pg)  # kopia
        pg_out["html"] = body_html
        # head
        canonical = url_from_path(lang_path(pg.get("lang"), pg.get("slug"), pg.get("type")))
        og_img = pg.get("og_image") or pg.get("hero_image") or "/static/img/placeholder-hero-desktop.webp"
        head = {
            "title": pg.get("seo_title") or pg.get("title") or pg.get("h1") or "Kras-Trans",
            "description": pg.get("meta_description") or (pg.get("lead") or ""),
            "canonical": canonical,
            "og_title": pg.get("seo_title") or pg.get("title") or "Kras-Trans",
            "og_description": pg.get("meta_description") or (pg.get("lead") or ""),
            "og_image": env.filters["abs"](og_img),
            "hreflangs": hl.get(pg.get("id") or f"{pg.get('lang')}::{pg.get('slug')}",
                                {"alts": [], "x_default": None})["alts"],
            "x_default": hl.get(pg.get("id") or f"{pg.get('lang')}::{pg.get('slug')}",
                                {"alts": [], "x_default": None})["x_default"],
            "jsonld": []  # JSON-LD wkładamy na etapie template (Breadcrumb/Organization/FAQ)
        }

        # related
        related = choose_related(pages, pg, kmin=int(pg.get("min_outlinks") or 3), 
                                 kmax=int(pg.get("max_outlinks") or 6))

        # dokąd pisać
        out_path = DIST / lang_path(pg.get("lang"), pg.get("slug"), pg.get("type")).lstrip("/")
        ensure_parent(out_path)
        html = tpl.render(page=pg_out, head=head, company=company, strings=strings, related=related, site_url=site_url())
        out_path.write_text(html, "utf-8")
        rendered += 1

    # assets & static
    copy_tree(STATIC_IN, DIST / "static")
    copy_tree(ASSETS_IN, DIST / "assets")

    # robots
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {site_url()}/sitemap.xml\n", "utf-8"
    )

    # sitemap
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    urls = []
    for pg in pages:
        loc = url_from_path(lang_path(pg.get("lang"), pg.get("slug"), pg.get("type")))
        urls.append(f"<url><loc>{loc}</loc><lastmod>{now}</lastmod></url>")
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n' \
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' \
         + "\n".join(urls) + "\n</urlset>\n"
    (DIST / "sitemap.xml").write_text(sm, "utf-8")

    # CNAME (dla GH Pages)
    (DIST / "CNAME").write_text("kras-trans.com\n", "utf-8")

    # ZIP w dist/download/site.zip
    dl_dir = DIST / "download"
    dl_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dl_dir / "site.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        # pakujemy całą zawartość dist – bez samego ZIP-a
        for p in DIST.rglob("*"):
            if p.resolve() == zip_path.resolve():
                continue
            if p.is_file():
                z.write(p, p.relative_to(DIST))

    log(f"Rendered pages: {rendered}")
    log(f"ZIP: {zip_path} ({zip_path.stat().st_size} bytes)")
    log("Build OK")

if __name__ == "__main__":
    build()
