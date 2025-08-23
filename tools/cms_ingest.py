# tools/cms_ingest.py
from __future__ import annotations
from pathlib import Path
from typing import Dict, Any, List, Optional

SYN = {
  # kolumny dla arkuszy z definicjami stron
  "pages": {
    "lang": ["lang", "język", "jezyk"],
    "publish": ["publish", "enabled", "widoczne", "visible", "aktywny", "active"],
    "slug": ["slug", "url", "path"],
    "key": ["slugkey", "slug_key", "key", "page", "route"],
    "parent": ["parent", "parent_key", "parentslug", "parent_slug", "parentkey"],
    "template": ["template", "tpl", "szablon"],
    "order": ["order", "kolej", "sort", "kolejność", "kolejnosc", "poz"],
    "title": ["title", "meta_title", "tytuł", "tytul"],
    "seo_title": ["seo_title", "title", "meta_title"],
    "description": ["description", "meta_desc", "opis", "desc"],
    "og_image": ["og_image", "og", "image", "obraz", "grafika"],
    "canonical": ["canonical", "kanoniczny", "canonical_url"],
  },
  # menu nawigacyjne
  "menu": {
    "lang":["lang","język","jezyk"],
    "label":["label","nazwa","etykieta","tekst"],
    "href":["href","url","link"],
    "parent":["parent","rodzic","grupa"],
    "order":["order","kolej","sort","kolejność","kolejnosc","poz"],
    "col":["col","kol","kolumna","column"],
    "enabled":["enabled","visible","widoczne","on","aktywny","active"]
  },
  "meta": {
    "lang":["lang","język","jezyk"],
    "key":["key","slugkey","page","slug","strona","zakladka","route"],
    "title":["title","meta_title","tytuł","tytul"],
    "description":["description","meta_desc","opis","desc"],
    "og_image":["og_image","og","image","obraz","grafika"]
  },
  "blocks": {
    "lang":["lang","język","jezyk"],
    "key":["key","slugkey","page","slug","strona","zakladka","route"],
    "section":["section","sekcja","blok","area","part"],
    "path":["path","ścieżka","sciezka"],
    "html":["html","content_html"],
    "title":["title","naglowek","header","h1","h2","h3"],
    "body":["body","tekst","content","markdown","md","body_md","body_html"],
    "cta_label":["cta_label","cta","button","przycisk","label"],
    "cta_href":["cta_href","cta_link","button_link","href","link"]
  },
  "faq": {
    "lang":["lang","język","jezyk"],
    "q":["q","question","pytanie"],
    "a":["a","answer","odp","odpowiedz","odpowiedź"],
    "page_slug":["page_slug","slugkey","slug","page","strona"],
    "order":["order","kolej","sort"],
    "enabled":["enabled","visible","widoczne","on","active","aktywny"]
  },
  "props": {
    "key":["key","prop","nazwa"],
    "lang":["lang","język","jezyk"],
    "value":["value","wartosc","wartość","val","content"]
  }
}

def _lower(s:str) -> str: return (s or "").strip().lower()
def _map_headers(headers: List[str], syn: Dict[str,List[str]]) -> Dict[str,int]:
    hl=[_lower(h) for h in headers]; out={}
    for want, aliases in syn.items():
        for a in aliases:
            if _lower(a) in hl: out[want]=hl.index(_lower(a)); break
    return out

def _read_xlsx(path: Path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    return {ws.title: ws for ws in wb.worksheets}

def _rows(ws):
    it = ws.iter_rows(values_only=True)
    headers = [str(x or "").strip() for x in next(it)]
    for row in it:
        yield headers, [("" if v is None else str(v).strip()) for v in row]

def _find_sheet(sheets, group):
    best = None; best_score=-1
    for name, ws in sheets.items():
        try:
            it = ws.iter_rows(values_only=True)
            headers = [str(x or "").strip() for x in next(it)]
            m = _map_headers(headers, SYN[group])
            score = len(m)
            if score > best_score:
                best = name; best_score = score
        except Exception: 
            pass
    return best if best_score >= 3 else None

def load_all(cms_root: Path, explicit_src: Optional[Path] = None) -> Dict[str, Any]:
    """Wczytuje wszystkie arkusze XLSX i klasyfikuje je podobnie jak ``cms_guard``.

    Wynik łączy dane z wielu arkuszy (union) i zwraca słownik zawierający
    klucze wymagane przez zadanie.
    """

    report: List[str] = []

    # wybór źródła
    src = (
        explicit_src
        if explicit_src and explicit_src.exists()
        else (cms_root / "menu.xlsx" if (cms_root / "menu.xlsx").exists() else None)
    )
    if not src:
        return {
            "pages_rows": [],
            "page_routes": {},
            "menu_rows": [],
            "page_meta": {},
            "blocks": {},
            "report": "[cms] no source",
        }

    report.append(f"[cms_ingest] source: {src}")

    import openpyxl

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

    def norm(s: Optional[str]) -> str:
        return (s or "").strip().lower()

    def truthy(v: str) -> bool:
        return norm(v) in {"1", "true", "tak", "yes", "on", "prawda"}

    # akumulatory
    menu_rows: List[Dict[str, Any]] = []
    page_meta: Dict[str, Dict[str, Dict[str, Any]]] = {}
    blocks: Dict[str, Dict[str, Dict[str, Any]]] = {}
    pages_rows: List[Dict[str, Any]] = []
    routes: Dict[str, Dict[str, str]] = {}

    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        hdr = [str(x or "").strip() for x in rows[0]]
        hdr_lc = [norm(h) for h in hdr]
        report.append(f"[sheet] {ws.title}: {hdr}")

        m_pages = _map_headers(hdr, SYN.get("pages", {}))
        m_menu = _map_headers(hdr, SYN["menu"])
        m_meta = _map_headers(hdr, SYN["meta"])
        m_blocks = _map_headers(hdr, SYN["blocks"])

        data_rows = rows[1:]

        is_pages = (
            "lang" in m_pages
            and "publish" in m_pages
            and "template" in m_pages
            and ("slug" in m_pages or "key" in m_pages)
        )
        is_menu = all(k in m_menu for k in ("lang", "label", "href", "enabled"))
        is_meta = all(k in m_meta for k in ("lang", "key"))
        is_blocks = ("lang" in m_blocks) and ("html" in m_blocks or "body" in m_blocks)

        if is_pages:
            report.append(f"[detect] pages-like: {ws.title}")
            for row in data_rows:
                vals = ["" if v is None else str(v).strip() for v in row]
                L = norm(vals[m_pages.get("lang", -1)]) or "pl"
                pub_val = vals[m_pages.get("publish", -1)] if "publish" in m_pages else "1"
                if not truthy(pub_val):
                    continue
                slug_raw = vals[m_pages.get("slug", -1)] if "slug" in m_pages else ""
                key = norm(vals[m_pages.get("key", -1)]) if "key" in m_pages else ""
                template = vals[m_pages.get("template", -1)] if "template" in m_pages else ""
                parent_raw = vals[m_pages.get("parent", -1)] if "parent" in m_pages else ""
                order_val = vals[m_pages.get("order", -1)] if "order" in m_pages else ""

                def rel(lang: str, s: str) -> str:
                    s = (s or "").strip()
                    if s.startswith(f"/{lang}/"):
                        s = s[len(f"/{lang}/"):]
                    return s.strip("/")

                slug_rel = rel(L, slug_raw)
                if not key:
                    key = slug_rel or "home"
                parent_key = rel(L, parent_raw)

                meta_fields: Dict[str, Any] = {}
                for fld in ("title", "seo_title", "description", "og_image", "canonical"):
                    idx = m_pages.get(fld)
                    if idx is not None and idx < len(vals):
                        val = vals[idx]
                        if val:
                            meta_fields[fld] = val

                known_idx = set(m_pages.values())
                extras: Dict[str, Any] = {}
                for i, h in enumerate(hdr):
                    if i in known_idx:
                        continue
                    if i < len(vals):
                        v = vals[i]
                        if v:
                            extras[h] = v

                pages_rows.append(
                    {
                        "lang": L,
                        "key": key,
                        "slug": slug_rel,
                        "parent_key": parent_key,
                        "template": template,
                        "order": int(float(order_val or "999")),
                        "meta": {**meta_fields, "extras": extras},
                    }
                )
                routes.setdefault(key, {})[L] = slug_rel
                pm = page_meta.setdefault(L, {}).setdefault(key, {})
                pm.update(meta_fields)
                pm.update(extras)

        if is_menu:
            report.append(f"[detect] menu-like: {ws.title}")
            for row in data_rows:
                vals = ["" if v is None else str(v).strip() for v in row]
                L = norm(vals[m_menu.get("lang", -1)]) or "pl"
                label = vals[m_menu.get("label", -1)] if "label" in m_menu else ""
                href = vals[m_menu.get("href", -1)] if "href" in m_menu else ""
                if not label or not href:
                    continue
                parent = vals[m_menu.get("parent", -1)] if "parent" in m_menu else ""
                order_v = vals[m_menu.get("order", -1)] if "order" in m_menu else "999"
                col_v = vals[m_menu.get("col", -1)] if "col" in m_menu else "1"
                en_v = vals[m_menu.get("enabled", -1)] if "enabled" in m_menu else "1"
                if not truthy(en_v):
                    continue
                menu_rows.append(
                    {
                        "lang": L,
                        "label": label,
                        "href": href,
                        "parent": parent,
                        "order": int(float(order_v or "999")),
                        "col": int(float(col_v or "1")),
                        "enabled": True,
                    }
                )

        if is_meta:
            report.append(f"[detect] meta-like: {ws.title}")
            for row in data_rows:
                vals = ["" if v is None else str(v).strip() for v in row]
                L = norm(vals[m_meta.get("lang", -1)]) or "pl"
                key = norm(vals[m_meta.get("key", -1)]) if "key" in m_meta else ""
                if not key:
                    continue
                pm = page_meta.setdefault(L, {}).setdefault(key, {})
                for fld in ("title", "seo_title", "description", "og_image", "canonical"):
                    idx = m_meta.get(fld)
                    if idx is not None and idx < len(vals):
                        val = vals[idx]
                        if val:
                            pm[fld] = val
                known_idx = set(m_meta.values())
                for i, h in enumerate(hdr):
                    if i in known_idx:
                        continue
                    if i < len(vals):
                        v = vals[i]
                        if v:
                            pm[h] = v

        if is_blocks:
            report.append(f"[detect] blocks-like: {ws.title}")
            for row in data_rows:
                vals = ["" if v is None else str(v).strip() for v in row]
                L = norm(vals[m_blocks.get("lang", -1)]) or "pl"
                path = vals[m_blocks.get("path", -1)] if "path" in m_blocks else ""
                if not path:
                    key = norm(vals[m_blocks.get("key", -1)]) if "key" in m_blocks else ""
                    section = norm(vals[m_blocks.get("section", -1)]) if "section" in m_blocks else ""
                    if key and section:
                        path = f"pages/{key}/{section}"
                if not path:
                    continue
                b = blocks.setdefault(L, {}).setdefault(path.lstrip("/"), {})
                if "html" in m_blocks:
                    html = vals[m_blocks.get("html", -1)]
                    if html:
                        b["html"] = html
                if "body" in m_blocks and "html" not in b:
                    body = vals[m_blocks.get("body", -1)]
                    if body:
                        b["body"] = body
                for fld in ("title", "cta_label", "cta_href"):
                    idx = m_blocks.get(fld)
                    if idx is not None and idx < len(vals):
                        val = vals[idx]
                        if val:
                            b[fld] = val

    report.append(
        f"[result] pages_rows={len(pages_rows)}, menu_rows={len(menu_rows)}, meta_langs={len(page_meta)}, blocks_langs={len(blocks)}"
    )

    return {
        "pages_rows": pages_rows,
        "page_routes": routes,
        "menu_rows": menu_rows,
        "page_meta": page_meta,
        "blocks": blocks,
        "report": "\n".join(report),
    }

