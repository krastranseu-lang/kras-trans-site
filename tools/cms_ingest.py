# tools/cms_ingest.py
from __future__ import annotations
from pathlib import Path
from typing import Dict, Any, List, Optional

SYN = {
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

def load_all(cms_root: Path, explicit_src: Optional[Path]=None) -> Dict[str,Any]:
    report=[]
    # źródło
    src = explicit_src if explicit_src and explicit_src.exists() else \
          (cms_root/"menu.xlsx" if (cms_root/"menu.xlsx").exists() else None)
    if not src:
        return {"menu_rows":[], "page_meta":{}, "blocks":{}, "report":"[cms] no source"}
    report.append(f"[cms_ingest] source: {src}")
    sheets = _read_xlsx(src)

    menu_rows: List[Dict[str,Any]] = []
    page_meta: Dict[str,Dict[str,Any]] = {}
    blocks: Dict[str,Dict[str,Any]] = {}

    sm = _find_sheet(sheets, "menu")
    if sm:
        report.append(f"[menu] sheet: {sm}")
        for headers,row in _rows(sheets[sm]):
            m = _map_headers(headers, SYN["menu"])
            if not all(k in m for k in ("lang","label","href")): continue
            g = lambda k: (row[m[k]] if k in m and m[k] < len(row) else "").strip()
            lang=_lower(g("lang"))
            menu_rows.append({
              "lang": lang,
              "label": g("label"),
              "href":  g("href"),
              "parent": g("parent"),
              "order": int(float(g("order") or "999")),
              "col":   int(float(g("col") or "1")),
              "enabled": _lower(g("enabled")) in {"1","true","prawda","tak","yes","on"}
            })
        menu_rows = [r for r in menu_rows if r["enabled"]]

    smeta = _find_sheet(sheets, "meta")
    if smeta:
        report.append(f"[meta] sheet: {smeta}")
        for headers,row in _rows(sheets[smeta]):
            m = _map_headers(headers, SYN["meta"])
            if not all(k in m for k in ("lang","key")): continue
            g = lambda k: (row[m[k]] if k in m and m[k] < len(row) else "").strip()
            lang=_lower(g("lang")); key=_lower(g("key"))
            d = page_meta.setdefault(lang, {}).setdefault(key, {})
            if g("title"): d["title"]=g("title")
            if g("description"): d["description"]=g("description")
            if g("og_image"): d["og_image"]=g("og_image")

    sbl = _find_sheet(sheets, "blocks")
    if sbl:
        report.append(f"[blocks] sheet: {sbl}")
        for headers,row in _rows(sheets[sbl]):
            m = _map_headers(headers, SYN["blocks"])
            if "lang" not in m: continue
            g = lambda k: (row[m[k]] if k in m and m[k] < len(row) else "").strip()
            lang=_lower(g("lang"))
            path = g("path")
            if not path:
                key=_lower(g("key")); sec=_lower(g("section"))
                if key and sec: path=f"pages/{key}/{sec}"
            if not path: continue
            b = blocks.setdefault(lang, {}).setdefault(path.lstrip("/"), {})
            for fld in ("html","title","body","cta_label","cta_href"):
                val=g(fld)
                if val: b[fld]=val

    report.append(f"[result] menu_rows={len(menu_rows)}, meta_langs={len(page_meta)}, blocks_langs={len(blocks)}")
    return {"menu_rows":menu_rows, "page_meta":page_meta, "blocks":blocks, "report":"\n".join(report)}

