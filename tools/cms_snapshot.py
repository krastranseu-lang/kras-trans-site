#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, List

import openpyxl


def norm_header(val: str | None) -> str:
    return (val or "").strip().lower()


LANG_HEADERS = {"lang", "język", "jezyk"}
PUBLISH_HEADERS = {"publish", "published"}


def snapshot(xlsx_path: Path) -> Dict:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)

    sheets: List[Dict[str, object]] = []
    rows_per_lang: Dict[str, int] = {}
    published_per_lang: Dict[str, int] = {}

    for ws in wb.worksheets:
        headers = [str(c or "") for c in next(ws.iter_rows(values_only=True))]
        print(f"[sheet] {ws.title}: {headers}")
        sheets.append({"name": ws.title, "headers": headers})

        header_norm = [norm_header(h) for h in headers]
        lang_idx = next((i for i, h in enumerate(header_norm) if h in LANG_HEADERS), None)
        publish_idx = next((i for i, h in enumerate(header_norm) if h in PUBLISH_HEADERS), None)

        for row in ws.iter_rows(min_row=2, values_only=True):
            if all(cell is None for cell in row):
                continue
            lang = "unknown"
            if lang_idx is not None:
                val = row[lang_idx]
                if isinstance(val, str) and val.strip():
                    lang = val.strip()
            rows_per_lang[lang] = rows_per_lang.get(lang, 0) + 1

            is_pub = False
            if publish_idx is not None:
                val = row[publish_idx]
                if isinstance(val, bool):
                    is_pub = val
                elif val is not None:
                    val_str = str(val).strip().lower()
                    if val_str in {"true", "1", "yes", "tak", "on"}:
                        is_pub = True
            if is_pub:
                published_per_lang[lang] = published_per_lang.get(lang, 0) + 1

    return {
        "sheets": sheets,
        "rows_per_lang": rows_per_lang,
        "published_per_lang": published_per_lang,
    }


def main() -> int:
    path_arg = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CMS_SOURCE")
    if not path_arg:
        print("Usage: cms_snapshot.py <xlsx>")
        return 1
    xlsx_path = Path(path_arg)
    if not xlsx_path.exists():
        print(f"XLSX not found: {xlsx_path}")
        return 1
    report = snapshot(xlsx_path)
    Path("sheet_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
