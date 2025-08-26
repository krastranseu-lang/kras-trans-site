from pathlib import Path


def test_home_has_content():
    p = Path('dist/pl/index.html').read_text('utf-8')
    assert '<h1' in p
    assert 'id="hero-lead"' in p or 'class="hero__lead"' in p
    assert 'class="section block' in p  # przynajmniej 1 blok z arkusza
