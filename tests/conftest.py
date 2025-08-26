import subprocess
import sys
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def build_site():
    src = Path("data/cms/menu.xlsx")
    assert src.exists()
    subprocess.run([sys.executable, "tools/build.py"], check=True)
