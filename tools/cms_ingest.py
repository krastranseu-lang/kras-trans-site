"""Minimal CMS ingestion utilities for the site builder.

This module provides a ``load_all`` function expected by ``tools/build.py``.
It loads JSON data from a directory and returns it as a dictionary with a
``report`` entry describing the source that was used.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional, Iterable


def load_all(data_dir: Path, explicit_src: Optional[Path] = None) -> Dict[str, Any]:
    """Load CMS data from ``data_dir``.

    The loader aggregates all JSON files found in ``data_dir``. If
    ``explicit_src`` is provided and exists, only that file is loaded. Data from
    each JSON file is merged into a single dictionary. Non-dictionary payloads
    are stored under a key derived from the file name.

    Returns
    -------
    dict
        A dictionary containing the merged CMS data. A human readable
        ``report`` entry describes which files were processed.
    """

    files: Iterable[Path]
    if explicit_src and explicit_src.exists():
        files = [explicit_src]
    else:
        files = sorted(data_dir.glob("*.json"))

    data: Dict[str, Any] = {}
    loaded = []
    for path in files:
        try:
            with path.open("r", encoding="utf-8") as fh:
                content = json.load(fh)
            if isinstance(content, dict):
                data.update(content)
            else:
                data[path.stem] = content
            loaded.append(path.name)
        except Exception as exc:  # pragma: no cover - error path
            loaded.append(f"{path.name} (error: {exc})")

    report = "[cms] loaded " + ", ".join(loaded) if loaded else "[cms] no data files found"
    data.setdefault("report", report)
    return data
