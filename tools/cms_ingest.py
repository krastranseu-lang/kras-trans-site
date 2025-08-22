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

def load_all(cms_root: Path, explicit_src: Optional[Path]=None) -> Dict[str,Any]:
    """
    Skanuje KAŻDY arkusz XLSX i klasyfikuje go po nagłówkach:
    - pages-like:  lang + publish + (slug|slugkey) + template  -> pages_rows + page_routes + page_meta
    - menu-like :  lang + label + href + enabled               -> menu_rows
    - meta-like :  lang + key                                  -> page_meta (uzupełnienie)
    - blocks-like: lang + (html|body)                          -> blocks
    Dane z wielu arkuszy sumują się (union).
    """
    report = []
    # 1) wybór źródła
    src = explicit_src if explicit_src and explicit_src.exists() else \
          (cms_root / "menu.xlsx" if (cms_root / "menu.xlsx").exists() else None)
    if not src:  # CSV/JSON fallback
        return {"menu_rows": [], "page_meta": {}, "blocks": {}, "page_routes": {}, "pages_rows": [], "report": "[cms] no source"}

    report.append(f"[cms_ingest] source: {src}")

    import openpyxl
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

    def norm(s): return (s or "").strip().lower()
    def headers(ws):
        it = ws.iter_rows(values_only=True)
        row = next(it)
        return [str(x or "").strip() for x in row]

    # akumulatory
    menu_rows: List[Dict[str,Any]] = []
    page_meta: Dict[str,Dict[str,Any]] = {}
    blocks: Dict[str,Dict[str,Any]] = {}
    pages_rows: List[Dict[str,Any]] = []
    routes: Dict[str, Dict[str, str]] = {}
    strings: List[Dict[str,Any]] = []
    faq_rows: List[Dict[str,Any]] = []
    props_rows: List[Dict[str,Any]] = []

    def truthy(v:str) -> bool:
        return norm(v) in {"1","true","tak","yes","on","prawda"}

    # przejrzyj wszystkie arkusze
    for ws in wb.worksheets:
        hdr = headers(ws); hdr_lc = [norm(h) for h in hdr]
        r = f"[sheet] {ws.title}: {hdr}"
        report.append(r)

        # pomocnicy dopasowań
        def has(*cols): return all(c in hdr_lc for c in cols)
        def idx(name:str) -> int:
            try: return hdr_lc.index(name)
            except ValueError: return -1
        def cell(row, name):
            i = idx(name)
            return (str(row[i]).strip() if i >= 0 and i < len(row) and row[i] is not None else "")

        # klasyfikacja
        body_aliases = [norm(a) for a in SYN["blocks"]["body"]]
        html_aliases = [norm(a) for a in SYN["blocks"]["html"]]
        is_pages = has("lang","publish","template") and (("slug" in hdr_lc) or ("slugkey" in hdr_lc))
        is_menu  = has("lang","label","href","enabled")
        is_meta  = has("lang","key")
        is_blocks= ("lang" in hdr_lc) and (any(a in hdr_lc for a in body_aliases) or any(a in hdr_lc for a in html_aliases))
        is_faq   = has("lang","q","a")
        is_props = has("lang","key","value")
        lang_cols = [h for h in hdr if len(norm(h))==2]
        lang_set = {norm(h) for h in lang_cols}
        is_strings = norm(hdr[0])=="key" and len(lang_cols)>=1
        is_routes  = norm(hdr[0]) in ("slugkey","key") and len(lang_cols)>=1 and ("lang" not in hdr_lc)

        it = ws.iter_rows(values_only=True); next(it, None)

        if is_pages:
            report.append(f"[detect] pages-like: {ws.title}")
            for row in it:
                raw = {hdr[i]: ("" if i>=len(row) or row[i] is None else str(row[i]).strip()) for i in range(len(hdr))}
                L   = norm(raw.get("lang") or "pl")
                pub = truthy(raw.get("publish") or "true")
                if not pub:
                    continue
                raw_slug = raw.get("slug", "")
                key = norm(raw.get("slugKey") or raw.get("slugkey") or "")
                tpl = raw.get("template") or "page.html"
                par = raw.get("parentSlug") or raw.get("parent") or ""
                order = raw.get("order") or "999"
                rel = raw_slug.strip().lstrip("/")
                if rel.startswith(f"{L}/"):
                    rel = rel[len(f"{L}/"):]
                rel = rel.strip("/")
                if not key: key = (rel or "home") if rel else "home"
                page = dict(raw)
                page.update({
                    "lang": L,
                    "slug": rel,
                    "slugKey": key,
                    "parentSlug": par,
                    "template": tpl,
                    "order": int(float(order or "999")),
                    "publish": True
                })
                pages_rows.append(page)
                routes.setdefault(key, {})[L] = rel
                pm = page_meta.setdefault(L, {}).setdefault(key, {})
                for k,v in (("seo_title","seo_title"),("title","title"),("meta_desc","description"),("og_image","og_image"),("canonical","canonical")):
                    val = page.get(k)
                    if val and (pm.get(v) in (None,"")):
                        pm[v] = val

        if is_menu:
            report.append(f"[detect] menu-like: {ws.title}")
            for row in it:
                L = norm(cell(row,"lang") or "pl")
                lab = cell(row,"label"); href = cell(row,"href")
                if not lab or not href: 
                    continue
                par = cell(row,"parent"); order = cell(row,"order") or "999"
                col = cell(row,"col") or "1"; en = truthy(cell(row,"enabled") or "true")
                if not en: 
                    continue
                menu_rows.append({
                    "lang": L, "label": lab, "href": href,
                    "parent": par, "order": int(float(order)), "col": int(float(col)), "enabled": True
                })

        if is_meta:
            report.append(f"[detect] meta-like: {ws.title}")
            for row in it:
                L = norm(cell(row,"lang") or "pl")
                key = norm(cell(row,"key") or "")
                if not key: 
                    continue
                pm = page_meta.setdefault(L, {}).setdefault(key, {})
                t = cell(row,"title") or cell(row,"seo_title")
                d = cell(row,"description") or cell(row,"meta_desc")
                og= cell(row,"og_image"); can = cell(row,"canonical")
                if t: pm["title"]=t
                if d: pm["description"]=d
                if og: pm["og_image"]=og
                if can: pm["canonical"]=can

        if is_blocks:
            report.append(f"[detect] blocks-like: {ws.title}")
            for row in it:
                L = norm(cell(row,"lang") or "pl")
                path = cell(row,"path")
                if not path:
                    key = norm(cell(row,"key") or "")
                    sec = norm(cell(row,"section") or "")
                    if key and sec: path = f"pages/{key}/{sec}"
                if not path:
                    continue
                b = blocks.setdefault(L, {}).setdefault(path.lstrip("/"), {})
                htm = cell(row,"html"); body= cell(row,"body")
                if htm: b["html"]=htm
                if body and not htm: b["body"]=body
                for extra in ("title","cta_label","cta_href"):
                    v = cell(row,extra)
                    if v: b[extra]=v

        if is_faq:
            report.append(f"[detect] faq-like: {ws.title}")
            for row in it:
                L = norm(cell(row,"lang") or "pl")
                q = cell(row,"q"); a = cell(row,"a")
                if not q or not a:
                    continue
                pg = cell(row,"page_slug") or cell(row,"slugkey") or cell(row,"page") or "home"
                order = cell(row,"order") or "999"
                en = truthy(cell(row,"enabled") or "true")
                if not en:
                    continue
                faq_rows.append({"lang": L, "q": q, "a": a, "page_slug": pg, "order": int(float(order))})

        if is_props:
            report.append(f"[detect] props-like: {ws.title}")
            for row in it:
                key = cell(row,"key")
                val = cell(row,"value")
                L = norm(cell(row,"lang") or "pl")
                if key and val:
                    props_rows.append({"key": key, "lang": L, "value": val})

        if is_strings:
            report.append(f"[detect] strings-like: {ws.title}")
            # languages columns
            for row in it:
                if not row:
                    continue
                key = (row[0] or "").strip()
                if not key:
                    continue
                d = {"key": key}
                for i,h in enumerate(hdr):
                    if norm(h) in lang_set:
                        d[norm(h)] = ("" if i>=len(row) or row[i] is None else str(row[i]).strip())
                strings.append(d)

        if is_routes:
            report.append(f"[detect] routes-like: {ws.title}")
            for row in it:
                if not row:
                    continue
                key = norm((row[0] or ""))
                if not key:
                    continue
                for i,h in enumerate(hdr):
                    L = norm(h)
                    if L in lang_set:
                        val = ("" if i>=len(row) or row[i] is None else str(row[i]).strip())
                        if val:
                            routes.setdefault(key, {})[L] = val
    report.append(f"[result] pages_rows={len(pages_rows)}, menu_rows={len(menu_rows)}, meta_langs={len(page_meta)}, blocks_langs={len(blocks)}")
    return {
        "menu_rows": menu_rows,
        "page_meta": page_meta,
        "blocks": blocks,
        "page_routes": routes,
        "pages_rows": pages_rows,
        "strings": strings,
        "faq_rows": faq_rows,
        "props_rows": props_rows,
        "report": "\n".join(report)
    }

