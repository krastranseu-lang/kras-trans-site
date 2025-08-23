#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from typing import Dict, List
import sys


def truthy(val) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    if isinstance(val, (int, float)):
        return val != 0
    return str(val).strip().lower() in {"1", "true", "yes", "y", "t"}


def validate(schema_path: Path, xlsx_path: Path) -> None:
    import json, openpyxl, yaml

    _ = yaml.safe_load(schema_path.read_text(encoding="utf-8")) if schema_path.exists() else None
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)

    def norm(s) -> str:
        return (str(s or "")).strip().lower()

    report: Dict[str, List[Dict[str, List[str]]]] = {"sheets": []}
    errors = 0
    content_like: List[Dict[str, str]] = []

    for ws in wb.worksheets:
        first_row = next(ws.iter_rows(values_only=True))
        hdr = [str(c or "").strip() for c in first_row]
        hdr_lc = [norm(h) for h in hdr]
        report["sheets"].append({"name": ws.title, "headers": hdr})

        header_index = {h: i for i, h in enumerate(hdr_lc)}

        is_pages = (
            "lang" in hdr_lc
            and "publish" in hdr_lc
            and "template" in hdr_lc
            and (("slug" in hdr_lc) or ("slugkey" in hdr_lc))
        )
        is_menu = (
            "lang" in hdr_lc
            and "enabled" in hdr_lc
            and "label" in hdr_lc
            and "href" in hdr_lc
        )
        is_meta = "lang" in hdr_lc and "key" in hdr_lc
        is_blocks = ("lang" in hdr_lc) and (("html" in hdr_lc) or ("body" in hdr_lc))
        # NOWE:
        is_collection = (
            "lang" in hdr_lc
            and "publish" in hdr_lc
            and not (is_pages or is_menu or is_meta or is_blocks)
        )

        klass = (
            "pages"
            if is_pages
            else "menu"
            if is_menu
            else "meta"
            if is_meta
            else "blocks"
            if is_blocks
            else "collection"
            if is_collection
            else "other"
        )

        if "lang" in hdr_lc and "publish" in hdr_lc:
            content_like.append({"name": ws.title, "class": klass})

        lang_idx = header_index.get("lang")
        publish_idx = header_index.get("publish")
        enabled_idx = header_index.get("enabled")
        slug_idx = header_index.get("slug")
        slugkey_idx = header_index.get("slugkey")
        template_idx = header_index.get("template")
        label_idx = header_index.get("label")
        href_idx = header_index.get("href")

        rows_per_lang: Dict[str, int] = {}
        published_per_lang: Dict[str, int] = {}
        pub_col = enabled_idx if klass == "menu" else publish_idx

        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            vals = list(row)
            lang_val = norm(vals[lang_idx]) if lang_idx is not None and lang_idx < len(vals) else ""
            if lang_val:
                rows_per_lang[lang_val] = rows_per_lang.get(lang_val, 0) + 1

            is_published = False
            if pub_col is not None and pub_col < len(vals):
                is_published = truthy(vals[pub_col])
            if is_published and lang_val:
                published_per_lang[lang_val] = published_per_lang.get(lang_val, 0) + 1

            if klass == "pages" and publish_idx is not None and truthy(
                vals[publish_idx] if publish_idx < len(vals) else None
            ):
                missing: List[str] = []
                if not lang_val:
                    missing.append("lang")
                slug_val = norm(vals[slug_idx]) if slug_idx is not None and slug_idx < len(vals) else ""
                slugkey_val = norm(vals[slugkey_idx]) if slugkey_idx is not None and slugkey_idx < len(vals) else ""
                if not slug_val and not slugkey_val:
                    missing.append("slug/slugkey")
                if not (template_idx is not None and template_idx < len(vals) and norm(vals[template_idx])):
                    missing.append("template")
                if missing:
                    print(f"[cms_guard] ❌ pages row {row_idx}: missing {', '.join(missing)}")
                    errors += 1
            elif klass == "menu" and enabled_idx is not None and truthy(
                vals[enabled_idx] if enabled_idx < len(vals) else None
            ):
                missing: List[str] = []
                if not (label_idx is not None and label_idx < len(vals) and norm(vals[label_idx])):
                    missing.append("label")
                if not (href_idx is not None and href_idx < len(vals) and norm(vals[href_idx])):
                    missing.append("href")
                if missing:
                    print(f"[cms_guard] ❌ menu row {row_idx}: missing {', '.join(missing)}")
                    errors += 1

        print(f"[cms_guard] sheet '{ws.title}' class={klass} rows_per_lang={rows_per_lang} published_per_lang={published_per_lang}")

    Path("sheet_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    unrecognized = [
        s
        for s in content_like
        if s["class"] not in ("pages", "menu", "meta", "blocks", "collection")
    ]
    if unrecognized:
        print(
            "[cms_guard] ❌ unrecognized content-like sheets: "
            + ", ".join(s["name"] for s in unrecognized)
        )
        sys.exit(1)

    if errors:
        print(f"[cms_guard] total errors: {errors}")
        sys.exit(1)


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: cms_guard.py <schema.yml> <xlsx>")
        return 1
    schema = Path(sys.argv[1])
    xlsx = Path(sys.argv[2])
    validate(schema, xlsx)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
