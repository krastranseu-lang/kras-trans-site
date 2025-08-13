#!/usr/bin/env python3
# Prosty audyt: sprawdza, czy w dist/ istnieją linkowane zasoby, liczy strony i rozmiar.
import os, pathlib, re

DIST = pathlib.Path("dist")
REPORT = pathlib.Path("audit/report.md")
REPORT.parent.mkdir(parents=True, exist_ok=True)

def list_html():
    return [p for p in DIST.rglob("index.html")]

def extract_assets(html_text):
    # surowe wyłuskanie ścieżek – proste, wystarczy na sanity check
    import re
    srcs = re.findall(r'src="([^"]+)"', html_text)
    hrefs = re.findall(r'href="([^"]+)"', html_text)
    return set(srcs + hrefs)

def main():
    missing = []
    pages = list_html()
    for p in pages:
        txt = p.read_text("utf-8", errors="ignore")
        for url in extract_assets(txt):
            if url.startswith("http"): 
                continue
            path = url.lstrip("/")
            file_path = DIST / path
            if not file_path.exists():
                missing.append((str(p.relative_to(DIST)), url))

    size_mb = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())/ (1024*1024)
    REPORT.write_text("# Audit report\n\n"
                      f"- pages: {len(pages)}\n"
                      f"- size: {size_mb:.2f} MB\n"
                      f"- missing assets: {len(missing)}\n\n" +
                      "\n".join(f"- {pg} -> {url}" for pg, url in missing), "utf-8")
    print("Audit done")

if __name__ == "__main__":
    main()
