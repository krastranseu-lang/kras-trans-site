#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Post-build verifier for CMS-driven pages and menus.

This script checks only CMS entries that should be published, i.e. those with
``publish = TRUE`` and ``type`` being either ``page`` or ``home``. For each of
these rows we expect a corresponding ``index.html`` in the ``dist`` tree. It
also verifies the presence of a menu bundle for the default language.
"""

from pathlib import Path
import sys
import yaml

# Ensure we can import helpers from ``tools`` when executed from repository root
sys.path.append("tools")
import cms_ingest


OK = "✅ Verify:"
ERR = "❌ Verify:"


def main() -> None:
    site = yaml.safe_load((Path("data") / "site.yml").read_text("utf-8"))
    dlang = site.get("default_lang", "pl")

    cms = cms_ingest.load_all(Path("data") / "cms")
    rows = cms.get("pages_rows") or []

    # Build list of required output files for published page/home rows
    required = []
    for r in rows:
        typ = (r.get("type") or "page").strip().lower()
        pub = str(r.get("meta", {}).get("publish") or "true").strip().lower()
        if pub in {"1", "true", "tak", "yes", "on", "prawda"} and typ in {"page", "home"}:
            lang = r.get("lang") or dlang
            slug = r.get("slug") or ""
            dst = Path("dist") / lang / (slug or "") / "index.html"
            required.append(dst)

    missing = [str(p) for p in required if not p.exists()]
    if missing:
        print("Missing outputs:")
        for p in missing[:200]:  # limit to 200 entries to avoid enormous logs
            print(" ", p)
        sys.exit(1)

    # menu bundle (new or legacy locations)
    has_bundle = (
        (Path("dist/assets/data/menu") / f"bundle_{dlang}.json").exists()
        or (Path("dist/assets/nav") / f"bundle_{dlang}.json").exists()
    )
    if not has_bundle:
        sys.exit(f"{ERR} no menu bundle for default language")

    print(f"{OK} pages & bundles OK")


if __name__ == "__main__":
    main()

