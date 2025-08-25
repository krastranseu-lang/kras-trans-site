from pathlib import Path
from bs4 import BeautifulSoup
from build import DIST, _truthy as truthy
import openpyxl


def load_sheet(name: str):
    path = Path('data/cms/menu.xlsx')
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    return wb[name]


def main() -> None:
    ws = load_sheet('Pages')
    rows = list(ws.iter_rows(values_only=True))
    header = [str(h or '').strip().lower() for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    def cell(row, key):
        i = idx.get(key)
        return row[i] if i is not None and i < len(row) else None

    for r in rows[1:]:
        if not r:
            continue
        lang = (cell(r, 'lang') or '').strip().lower()
        slug = (cell(r, 'slug') or '').strip('/')
        publish = truthy(cell(r, 'publish')) if 'publish' in idx else True
        if not publish:
            continue
        path = DIST / lang / (slug or '') / 'index.html'
        if not path.exists():
            continue
        soup = BeautifulSoup(path.read_text(encoding='utf-8'), 'lxml')
        title_expected = (cell(r, 'seo_title') or cell(r, 'title') or '').strip()
        h1_expected = (cell(r, 'h1') or '').strip()
        lead_expected = (cell(r, 'lead') or '').strip()
        cta_expected = (cell(r, 'cta_label') or '').strip()
        title_actual = soup.title.string.strip() if soup.title and soup.title.string else ''
        h1_node = soup.find('h1')
        h1_actual = h1_node.get_text(strip=True) if h1_node else ''
        lead_node = soup.select_one('#hero-lead')
        lead_actual = lead_node.get_text(strip=True) if lead_node else ''
        cta_node = soup.select_one('#cta')
        cta_actual = cta_node.get_text(strip=True) if cta_node else ''
        miss = []
        if title_actual != title_expected:
            miss.append(f"title: {title_actual!r} != {title_expected!r}")
        if h1_actual != h1_expected:
            miss.append(f"h1: {h1_actual!r} != {h1_expected!r}")
        if lead_expected and lead_actual != lead_expected:
            miss.append(f"lead: {lead_actual!r} != {lead_expected!r}")
        if cta_expected and cta_actual != cta_expected:
            miss.append(f"cta: {cta_actual!r} != {cta_expected!r}")
        if miss:
            print(f"[{lang}/{slug or 'home'}] " + ' | '.join(miss))


if __name__ == '__main__':
    main()
