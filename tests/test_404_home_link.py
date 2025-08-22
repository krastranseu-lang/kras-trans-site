import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))
sys.path.append(str(ROOT / "tools"))

from tools.build import write_404_page

def test_404_uses_default_lang(tmp_path):
    write_404_page(tmp_path, "en")
    content = (tmp_path / "404.html").read_text("utf-8")
    assert "href='/en/'" in content
