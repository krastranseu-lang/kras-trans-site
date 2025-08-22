
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict
import json

def load_all(data_dir: Path, explicit_src: Path | None = None) -> Dict[str, Any]:
    """Minimal stub loader for CMS data.

    Attempts to read a ``cms.json`` file from ``data_dir``. If not present or
    parsing fails, returns a minimal structure so that build scripts can run
    without the original cms_ingest dependency.
    """
    try:
        json_path = data_dir / "cms.json"
        if json_path.exists():
            with json_path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
    except Exception:
        pass
    return {
        "pages": [],
        "blocks": {},
        "strings": {},
        "faq": [],
        "hreflang": {},
        "report": "[cms_ingest stub] no data",
    }