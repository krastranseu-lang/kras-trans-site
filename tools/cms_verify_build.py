# -*- coding: utf-8 -*-
from pathlib import Path
import sys, yaml
sys.path.append("tools")
import cms_ingest

def main():
    site = yaml.safe_load((Path("data")/"site.yml").read_text("utf-8"))
    dlang = site.get("default_lang","pl")
    cms = cms_ingest.load_all(Path("data")/"cms")
    routes = cms.get("page_routes") or {}

    missing = []
    for key, per_lang in routes.items():
        for L, rel in per_lang.items():
            p = Path("dist") / L / (rel or "") / "index.html"
            if not p.exists():
                missing.append(str(p))

    if missing:
        print("Missing outputs:")
        for p in missing: print(" ", p)
        sys.exit(1)

    # szybki check bundla menu
    ok = any((Path("dist/assets/data/menu")/f"bundle_{dlang}.json").exists(),
             ) or (Path("dist/assets/nav")/f"bundle_{dlang}.json").exists()
    if not ok:
        sys.exit("No menu bundle for default language")

    print("✅ Verify: pages & bundles OK")

if __name__ == "__main__":
    main()
