import re
import sys
import zipfile
import openpyxl
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from tools.cms_guard import validate


def test_unsized_sheet(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "pages"
    ws.append(["lang", "publish", "slug", "template"])
    base = tmp_path / "base.xlsx"
    wb.save(base)

    unsized = tmp_path / "unsized.xlsx"
    with zipfile.ZipFile(base, "r") as zin, zipfile.ZipFile(unsized, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                data = re.sub(br"<dimension ref=\"[^\"]*\"/>", b"", data)
            zout.writestr(item, data)

    schema = tmp_path / "schema.yml"
    schema.write_text("{}", encoding="utf-8")

    validate(schema, unsized)
