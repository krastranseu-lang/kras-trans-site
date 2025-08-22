import sys
from pathlib import Path

import openpyxl

# Ensure project root is on the Python path for imports
sys.path.append(str(Path(__file__).resolve().parents[1]))

from tools.cms_ingest import load_all


def test_slug_without_leading_slash(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "pages"
    ws.append(["lang", "publish", "slug", "template"])
    ws.append(["ua", "1", "ua/tsiny", "page.html"])
    src = tmp_path / "test.xlsx"
    wb.save(src)

    result = load_all(cms_root=tmp_path, explicit_src=src)
    assert result["pages_rows"][0]["slug"] == "tsiny"

