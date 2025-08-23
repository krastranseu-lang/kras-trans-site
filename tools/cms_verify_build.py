# -*- coding: utf-8 -*-
from pathlib import Path
import sys, yaml
sys.path.append("tools")
import cms_ingest

OK = "✅ Verify:"; ERR = "❌ Verify:"

def main():
    cms = cms_ingest.load_all(Path("data")/"cms")
    routes = cms.get("page_routes") or {}
    required = []
    for key, per_lang in routes.items():
        for lang, rel in per_lang.items():
            required.append(Path("dist")/lang/(rel or "")/"index.html")

    missing = [str(p) for p in required if not p.exists()]
    if missing:
        print("Missing outputs:"); [print(" ", p) for p in missing[:200]]
        sys.exit(1)

    total_routes = sum(len(v) for v in routes.values())
    existing = len(required) - len(missing)
    if existing < total_routes:
        print("Missing outputs:")
        sys.exit(1)

    site = yaml.safe_load((Path("data")/"site.yml").read_text("utf-8"))
    dlang = site.get("default_lang","pl")
    has_bundle = (Path("dist/assets/data/menu")/f"bundle_{dlang}.json").exists() \
                 or (Path("dist/assets/nav")/f"bundle_{dlang}.json").exists()
    if not has_bundle:
        sys.exit(f"{ERR} no menu bundle for default language")

    print(f"{OK} pages & bundles OK")

if __name__=="__main__":
    main()
