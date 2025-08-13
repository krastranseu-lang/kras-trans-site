#!/usr/bin/env python3
from bs4 import BeautifulSoup
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
REP = ROOT / "audit" / "report.md"
REP.parent.mkdir(parents=True, exist_ok=True)

def audit():
    rows = []
    for p in DIST.rglob("index.html"):
        rel = p.relative_to(DIST)
        s = BeautifulSoup(p.read_text("utf-8", errors="ignore"), "lxml")
        title = (s.title.string or "").strip() if s.title else ""
        desc = s.find("meta", attrs={"name":"description"})
        canon = s.find("link", attrs={"rel":["canonical","Canonical"]})
        h1 = s.find("h1")
        ld = s.find_all("script", attrs={"type":"application/ld+json"})
        hero = s.select_one(".hero img")
        ok = all([
            title, desc and desc.get("content"), canon and canon.get("href"),
            h1 and h1.text.strip(), len(ld) >= 1, hero and hero.get("src")
        ])
        rows.append(f"| /{rel} | {'✅' if ok else '❌'} | title:{bool(title)} meta:{bool(desc)} canonical:{bool(canon)} h1:{bool(h1)} jsonld:{len(ld)} hero:{bool(hero)} |")
    REP.write_text("# Audit\n\n| Plik | OK | Szczegóły |\n|---|---|---|\n" + "\n".join(rows), "utf-8")

if __name__ == "__main__":
    audit()
