import subprocess
import sys
from pathlib import Path

import openpyxl


def test_build_fails_without_home(tmp_path):
    # Prepare minimal project structure in a temp directory
    (tmp_path / "templates").mkdir()
    cms_dir = tmp_path / "data" / "cms"
    cms_dir.mkdir(parents=True)
    # Provide CMS data only for Polish home page
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "pages"
    ws.append(["lang", "publish", "slug", "template"])
    ws.append(["pl", "1", "", "page.html"])
    wb.save(cms_dir / "menu.xlsx")

    pages_yml = (
        "languages: [pl, en]\n"
        "site: { defaultLang: pl, locales: { pl: {}, en: {} } }\n"
        "paths: { src: { templates: 'templates' }, out: 'dist' }\n"
    )
    (tmp_path / "pages.yml").write_text(pages_yml, encoding="utf-8")

    build_script = Path(__file__).resolve().parents[1] / "tools" / "build.py"
    result = subprocess.run(
        [sys.executable, str(build_script)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "[build] No home page for language 'en'" in (result.stderr + result.stdout)
