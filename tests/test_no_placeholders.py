from pathlib import Path

FORBIDDEN = [
    "Jan Kowalski",
    "Wskaźnik",
    "Ubezp.",
    "Lorem",
    "ipsum",
    "[TODO]",
    "Placeholder",
    "Acme",
    "Nazwa firmy",
]


def test_no_custom_placeholders():
    dist = Path("dist")
    assert dist.exists(), "dist directory missing"
    for path in dist.rglob("*.html"):
        text = path.read_text(encoding="utf-8")
        for phrase in FORBIDDEN:
            assert phrase not in text, f"{path}: {phrase}"
