from pathlib import Path

PLACEHOLDERS = [
    "Mocne hasło",
    "Krótki opis",
    "Tytuł usługi",
]


def test_no_placeholders_in_dist():
    dist = Path("dist")
    assert dist.exists(), "dist directory missing"
    offenders = []
    for path in dist.rglob("*"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue  # skip binary files
        for phrase in PLACEHOLDERS:
            if phrase in text:
                offenders.append(f"{path}: {phrase}")
    assert not offenders, "Placeholder strings found:\n" + "\n".join(offenders)
