import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

@pytest.fixture(scope="session", autouse=True)
def build_site(tmp_path_factory):
    """Build the site using CMS data fetched via ``CMS_SOURCE``."""
    src = Path("data/cms/menu.xlsx")
    tmp_src = tmp_path_factory.mktemp("cms") / "menu.xlsx"
    if src.exists():
        shutil.copy2(src, tmp_src)
        src.unlink()
    os.environ["CMS_SOURCE"] = str(tmp_src)
    subprocess.run([sys.executable, "tools/build.py"], check=True)
