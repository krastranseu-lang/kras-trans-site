# -*- coding: utf-8 -*-
from pathlib import Path
import json, yaml, sys
sys.path.append("tools")
import cms_ingest


def main():
    site = yaml.safe_load((Path("data")/"site.yml").read_text("utf-8"))
    dlang = site.get("default_lang","pl")
    cms   = cms_ingest.load_all(Path("data")/"cms")
    routes = cms.get("page_routes") or {}
    rows   = cms.get("pages_rows") or []

    # required paths tylko dla type in {page, home} i publish=TRUE
    def truthy(v): return str(v or "").strip().lower() in {"1","true","tak","yes","on","prawda"}
    required = []
    for r in rows:
        typ = (r.get("type") or "page").strip().lower()
        pub = truthy((r.get("meta") or {}).get("publish","true"))
        if not pub or typ not in {"page","home"}: 
            continue
        L   = r.get("lang") or dlang
        rel = r.get("slug") or ""
        p = Path("dist")/L/(rel or "")/"index.html"
        required.append(str(p))

    # co faktycznie istnieje
    built = [str(p) for p in Path("dist").rglob("index.html")]

    report = {
        "langs_from_cms": sorted({r.get("lang","pl") for r in rows}),
        "routes_keys": sorted(routes.keys()),
        "required_count": len(required),
        "missing": sorted([p for p in required if p not in built])[:500],  # max 500 dla logu
        "built_count": len(built),
    }
    Path("_diag_cms.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
