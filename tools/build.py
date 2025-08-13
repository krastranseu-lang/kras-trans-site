#!/usr/bin/env python3
import json, os, shutil, time, pathlib, zipfile
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT   = pathlib.Path(__file__).resolve().parents[1]
DIST   = ROOT / "dist"
CMS    = ROOT / "data" / "cms.json"
TMPL   = ROOT / "templates"
SITE   = "https://kras-trans.com"  # do kanonikali, robots, sitemap

DEFAULT_LANG = "pl"  # domyślny język do przekierowań z / i bezjęzykowych URL

# ------------------------- helpers -------------------------

def clean():
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)

def env():
    return Environment(
        loader=FileSystemLoader(str(TMPL)),
        autoescape=select_autoescape(["html"])
    )

def write_file(path: pathlib.Path, html: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, "utf-8")

def meta_redirect_html(to_url: str, title="Redirecting…", body="Redirecting"):
    return f"""<!doctype html><html lang="pl"><head>
<meta charset="utf-8"><meta http-equiv="refresh" content="0;url={to_url}">
<link rel="canonical" href="{to_url}">
<title>{title}</title>
</head><body><p>{body} <a href="{to_url}">{to_url}</a></p></body></html>"""

def write_redirect(from_path: str, to_url: str):
    """
    from_path: ścieżka bez hosta, np. '/transport-do-niemiec/'
    Tworzy plik dist/transport-do-niemiec/index.html z meta-refresh.
    """
    # normalizacja
    from_path = from_path.strip("/")
    target = DIST / from_path / "index.html"
    html = meta_redirect_html(to_url)
    write_file(target, html)

def write_root_index(default_lang=DEFAULT_LANG):
    to = f"/{default_lang}/"
    write_file(DIST / "index.html", meta_redirect_html(to))

def write_404(default_lang=DEFAULT_LANG):
    html = f"""<!doctype html><html lang="pl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 – Nie znaleziono</title>
<style>body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;padding:2rem}}a{{color:#0b57d0}}</style>
<script>
(function(){{
  var p = location.pathname;
  // jeśli brak prefiksu języka, spróbuj dodać /{default_lang} i przejść ponownie
  var m = p.match(/^\\/([a-z]{{2}})(\\/|$)/);
  if(!m) {{
    var guess = "/{default_lang}" + (p.startsWith("/")? p : "/"+p);
    location.replace(guess + location.search + location.hash);
  }}
}})();
</script>
</head><body>
  <h1>404 – Nie znaleziono</h1>
  <p>Nie znaleziono strony. Jeśli zaraz nie nastąpi przekierowanie, przejdź do <a href="/{default_lang}/">strony głównej</a>.</p>
</body></html>"""
    write_file(DIST / "404.html", html)

def write_robots(base=SITE):
    write_file(DIST / "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")

def write_sitemap(base=SITE, pages=None):
    pages = pages or []
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    items = "\n".join(f"<url><loc>{base.rstrip('/')}{p}</loc><lastmod>{now}</lastmod></url>" for p in sorted(set(pages)))
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{items}
</urlset>
"""
    write_file(DIST / "sitemap.xml", xml)

def keep_cms_json():
    dst = DIST / "data"; dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CMS, dst / "cms.json")

def copy_static():
    skip = {".git", ".github", "data", "tools", "dist"}
    for p in ROOT.iterdir():
        if p.name in skip: 
            continue
        if p.is_dir():
            shutil.copytree(p, DIST / p.name, dirs_exist_ok=True)
        else:
            shutil.copy2(p, DIST / p.name)

def zip_site():
    zpath = DIST / "download" / "site.zip"
    zpath.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(DIST))

# ------------------------- build pages -------------------------

def build_pages():
    j = json.loads(CMS.read_text("utf-8"))
    e = env()
    tpl = e.get_template("page.html")

    pages = j.get("pages", [])
    company = j.get("company", [])

    urls_for_sitemap = set()

    for pg in pages:
        # wyznacz docelowy URL (z językiem)
        lang = (pg.get("lang") or DEFAULT_LANG).strip().lower()
        slug = (pg.get("slug") or "").strip("/")

        if pg.get("type") == "home":
            url_path = f"/{lang}/"
            out = DIST / lang / "index.html"
        else:
            url_path = f"/{lang}/{slug}/" if slug else f"/{lang}/"
            out = DIST / lang / slug / "index.html" if slug else DIST / lang / "index.html"

        # head (kanonikal, og itp.)
        head = {
            "title": pg.get("seo_title") or pg.get("title") or "",
            "description": pg.get("meta_description") or pg.get("lead") or "",
            "canonical": f"{SITE.rstrip('/')}{url_path}",
            "og_title": pg.get("og_title") or pg.get("seo_title") or pg.get("title") or "",
            "og_description": pg.get("og_description") or pg.get("meta_description") or pg.get("lead") or "",
            "og_image": f"{SITE.rstrip('/')}/static/img/placeholder-hero-desktop.webp",
            "jsonld": [],  # (opcjonalnie dokładasz tu Organization/Breadcrumbs)
        }

        html = tpl.render(page=pg, company=company, head=head, site_url=SITE.rstrip("/"))
        write_file(out, html)
        urls_for_sitemap.add(url_path)

        # === SHADOW REDIRECT (bez języka) ===
        if slug:
            shadow_from = f"/{slug}/"      # np. /transport-do-niemiec/
            shadow_to   = url_path         # np. /pl/transport-do-niemiec/
            write_redirect(shadow_from, shadow_to)

    return sorted(urls_for_sitemap)

# ------------------------- main -------------------------

def main():
    if not CMS.exists():
        raise SystemExit("cms.json not found (data/cms.json)")

    clean()
    copy_static()
    keep_cms_json()

    urls = build_pages()  # generuje html + shadow redirects
    write_root_index(DEFAULT_LANG)
    write_404(DEFAULT_LANG)
    write_robots(SITE)
    write_sitemap(SITE, urls)
    zip_site()

if __name__ == "__main__":
    main()
