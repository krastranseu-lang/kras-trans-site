"""Minimal CMS ingestion utilities for the site builder.

This module provides a ``load_all`` function expected by ``tools/build.py``.
It loads JSON data from a directory and returns it as a dictionary with a
``report`` entry describing the source that was used.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional


def load_all(data_dir: Path, explicit_src: Optional[Path] = None) -> Dict[str, Any]:
    """Load CMS data from ``data_dir``.

    Parameters
    ----------
    data_dir:
        Directory that contains CMS data files. The function currently looks
        for ``menu.json`` inside this directory.
    explicit_src:
        Optional path to a data file. If provided and exists, it will override
        the default JSON source.

    Returns
    -------
    dict
        A dictionary with the parsed CMS data. A human readable ``report``
        string is always included to aid debugging.
    """

    src = explicit_src if explicit_src and explicit_src.exists() else data_dir / "menu.json"

    result: Dict[str, Any]
    try:
        with src.open("r", encoding="utf-8") as fh:
            result = json.load(fh)
        report = f"[cms] loaded {src}"
    except Exception as e:  # pragma: no cover - error path
        result = {}
        report = f"[cms] failed to load {src}: {e}"

    result.setdefault("report", report)
    return result
