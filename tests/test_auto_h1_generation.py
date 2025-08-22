import os
import importlib
import sys
from pathlib import Path

import openpyxl


def test_auto_h1_generation(tmp_path):
    (tmp_path / "templates").mkdir()
    cms_dir = tmp_path / "data" / "cms"
    cms_dir.mkdir(parents=True)

    # minimal template rendering h1
    (tmp_path / "templates" / "page.html").write_text("<h1>{{ h1 }}</h1>", encoding="utf-8")

    # CMS workbook with only basic columns
    wb = openpyxl.Workbook()
    ws_pages = wb.active
    ws_pages.title = "pages"
    ws_pages.append(["lang", "publish", "slug", "template"])
    ws_pages.append(["pl", "1", "", "page.html"])  # home page
    ws_pages.append(["pl", "1", "about", "page.html"])  # simple page

    ws_menu = wb.create_sheet(title="menu")
    ws_menu.append(["lang", "label", "href", "enabled"])
    ws_menu.append(["pl", "Home", "/pl/", "1"])
    wb.save(cms_dir / "menu.xlsx")

    pages_yml = (
        "languages: [pl]\n"
        "site: { defaultLang: pl, locales: { pl: {} } }\n"
        "paths: { src: { templates: 'templates' }, out: 'dist' }\n"
        "templates: { page: 'page.html' }\n"
    )
    (tmp_path / "pages.yml").write_text(pages_yml, encoding="utf-8")

    # Import build module using temp project as CWD
    repo_tools = Path(__file__).resolve().parents[1] / "tools"
    sys.path.append(str(repo_tools))
    cwd = os.getcwd()
    os.chdir(tmp_path)
    try:
        build = importlib.import_module("build")
        pages = build.base_pages()
        about = next(p for p in pages if p.get("slug") == "about")
        html = build.env.get_template(about["template"]).render(h1=about["h1"], page=about)
    finally:
        os.chdir(cwd)
        sys.modules.pop("build", None)

    assert "<h1>about</h1>" in html
