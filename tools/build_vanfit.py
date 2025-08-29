#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prosty build dla VanFit (standalone):
- Kopiuje pliki z apps/vanfit/public/ do dist/vanfit/
- Nie wymaga CMS, nie dotyka reszty serwisu.

Użycie:
  python tools/build_vanfit.py
"""
from pathlib import Path
import shutil, sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'apps' / 'vanfit' / 'public'
OUT = ROOT / 'dist' / 'vanfit'

def copytree(src: Path, dst: Path):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)

def main():
    if not SRC.exists():
        print(f"❌ Brak źródeł VanFit: {SRC}", file=sys.stderr)
        sys.exit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    copytree(SRC, OUT)
    # Twardy dowód na sukces
    idx = OUT / 'index.html'
    if not idx.exists():
        print("❌ Nie znaleziono index.html po kopiowaniu", file=sys.stderr)
        sys.exit(2)
    print(f"✅ VanFit skopiowany do: {OUT}")

if __name__ == '__main__':
    main()

