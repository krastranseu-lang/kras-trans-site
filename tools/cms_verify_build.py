# -*- coding: utf-8 -*-
from pathlib import Path
import sys, json, yaml
sys.path.append("tools")
import cms_ingest

OK="✅ Verify:"; ERR="❌ Verify:"

def main():
    routes_file = Path("_routes.json")
    required = []

    if routes_file.exists():
        data = json.loads(routes_file.read_text("utf-8"))
        for r in data:
            out = Path(r.get("out",""))
            if out.suffix == ".html":
                required.append(out)
    else:
        site = yaml.safe_load((Path("data")/"site.yml").read_text("utf-8"))
        dlang = site.get("default_lang","pl")
        cms   = cms_ingest.load_all(Path("data")/"cms")
        rows  = cms.get("pages_rows") or []
        def truthy(v): return str(v or "").strip().lower() in {"1","true","tak","yes","on","prawda"}
        for r in rows:
            typ = (r.get("type") or "page").strip().lower()
            pub = truthy((r.get("meta") or {}).get("publish","true"))
            if not pub or typ not in {"page","home"}:
                continue
            L   = r.get("lang") or dlang
            rel = r.get("slug") or ""
            required.append(Path("dist")/L/(rel or "")/"index.html")

    missing = [str(p) for p in required if not p.exists()]
    if missing:
        print("Missing outputs:"); [print(" ", p) for p in missing[:200]]
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
