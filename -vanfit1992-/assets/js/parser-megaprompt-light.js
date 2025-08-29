          // ===================== MEGA‑PROMPT LIGHT PARSER (non-intrusive) =====================
          // Standalone, minimal parser helpers. Does not modify existing parser functions.
          function normalizeUnits(raw) {
            // Reuse existing preNormalize where possible, then apply small cleanups.
            let s = preNormalize(String(raw || ""));
            s = s
              .replace(/×/g, "x")
              .replace(/\*/g, "x")
              .replace(/·/g, "x")
              .replace(/\s{2,}/g, " ")
              .trim();
            return s;
          }

          function detectType(tok){
            const t = String(tok || "").toLowerCase();
            if (/(europal|epal|eur|euro|pallet|palet|palette|plt|поддон|палет|піддон)/.test(t)) return "pallet";
            if (/(box|carton|ctn|case|karton|krab|caja|scatola|doos)/.test(t)) return "box";
            if (/(roll|rolka|рулон|rulle|ruolon|tekercs)/.test(t)) return "roll";
            if (/(drum|barrel|beczka|бочка)/.test(t)) return "drum";
            if (/(bag|worek|мешок|sac|saco|bolsa)/.test(t)) return "bag";
            if (/\bibc\b|eurocube|еврокуб|єврокуб/.test(t)) return "ibc";
            return "other";
          }

          function mapPalletSubtype(label, L, W){
            const s = String(label || "").toLowerCase();
            // preferuj po nazwie; w razie braku – po rozmiarze
            if (/eur1|euro\s*120\s*[x×*]\s*80|chep.*1200.*800/.test(s) || (L===120 && W===80)) return "EUR1";
            if (/eur2|120\s*[x×*]\s*100|chep.*1200.*1000/.test(s) || (L===120 && W===100)) return "EUR2";
            if (/eur3|100\s*[x×*]\s*120/.test(s) || (L===120 && W===100)) return "EUR3";
            if (/eur6|80\s*[x×*]\s*60/.test(s) || (L===80  && W===60))  return "EUR6";
            if (/qeur|60\s*[x×*]\s*40/.test(s) || (L===60  && W===40))  return "QEUR";
            if (/us.*48\s*[x×*]\s*40|121\.9.*101\.6/.test(s))           return "US-48x40";
            if (/iso.*1100\s*[x×*]\s*1100|110\s*[x×*]\s*110/.test(s))   return "ISO-1100x1100";
            return "unknown";
          }

          function parseLWH(raw){
            // obsługa LxWxH oraz etykiet L/W/H; zwraca {L,W,H, byLabel}
            const s = normalizeUnits(raw);
            const byLabel = {};
            // etykiety
            const labRe = /\b(L(en|ength|änge)?|Dł|Dl|Длина)\s*[:=]?\s*(\d+(\.\d+)?)\s*(mm|cm|m|")?\b.*?\b(W(idth|eite)?|Szer|Ширина)\s*[:=]?\s*(\d+(\.\d+)?)\s*(mm|cm|m|")?\b.*?\b(H(eight|öhe)?|Wys|Высота)\s*[:=]?\s*(\d+(\.\d+)?)\s*(mm|cm|m|")?\b/i;
            const mLab = s.match(labRe);
            if (mLab){
              byLabel.L = {v:+mLab[3], u:(mLab[5]||"cm")};
              byLabel.W = {v:+mLab[9], u:(mLab[11]||"cm")};
              byLabel.H = {v:+mLab[15],u:(mLab[17]||"cm")};
            }
            // trójka/podwójka
            const m = s.match(/(\d+(?:[.,]\d+)?)\s*[x×*\/]\s*(\d+(?:[.,]\d+)?)\s*(?:[x×*\/]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m|")?/i);
            if (!m && !mLab) return null;

            const unit = (m?.[4] || byLabel.L?.u || "cm").toLowerCase();
            const toCm = v => {
              const n = parseFloat(String(v).replace(",","."));
              if (unit==="mm") return Math.round(n/10);
              if (unit==='m')  return Math.round(n*100);
              if (unit==='"')  return Math.round(n*2.54);
              return Math.round(n); // cm
            };
            let L = m ? toCm(m[1]) : toCm(byLabel.L.v);
            let W = m ? toCm(m[2]) : toCm(byLabel.W.v);
            let H = m ? (m[3]? toCm(m[3]) : 0) : toCm(byLabel.H.v);
            if (L < W) [L,W] = [W,L]; // normalizacja
            if (Math.min(L,W) < 3 || Math.max(L,W,H) > 500) return null;
            return { L,W,H, byLabel: !!mLab };
          }

          function parseDiameter(raw){
            const s = normalizeUnits(raw);
            const dm = s.match(/(ø|⌀|phi|diam(?:eter)?|Durchmesser|diámetro|diametro)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|")?/i);
            if (!dm) return null;
            const u = (dm[3]||"cm").toLowerCase();
            const toCm = v => u==="mm"?Math.round(v/10):u==="m"?Math.round(v*100):u==='"'?Math.round(v*2.54):Math.round(v);
            return toCm(parseFloat(String(dm[2]).replace(",", ".")));
          }

          function parseWeights(raw){
            const s = normalizeUnits(raw).toLowerCase();
            const unit = /(\d+(?:[.,]\d+)?)\s*(t|kg)\b/gi;
            let total=null, per=null, note="";
            // per szt/pal
            const perM = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|t)\s*(?:\/|na|per|pro|je|\/\s*(?:szt|pcs|pal|plt))/i);
            if (perM) { const v=parseFloat(perM[1].replace(",", ".")); per = perM[2]==="t"? v*1000 : v; }
            // total
            let m=null; while ((m = unit.exec(s))) { const v=parseFloat(m[1].replace(",", ".")); const kg = m[2]==="t"? v*1000:v; total = (total||0)+kg; }
            if (/brutto|gross/.test(s)) note="brutto"; if (/netto/.test(s)) note=(note?note+";":"")+"netto";
            return { total_weight_kg: total||null, unit_weight_kg: per||null, note };
          }

          function aggregateItems(items){
            const key = it => [it.type,it.subtype,it.length_cm,it.width_cm,it.height_cm].join("|");
            const map = new Map();
            for (const it of items){
              const k = key(it);
              if (!map.has(k)) map.set(k,{...it});
              else{
                const acc = map.get(k);
                acc.qty += it.qty||1;
                if (acc.total_weight_kg!=null || it.total_weight_kg!=null) {
                  acc.total_weight_kg = (acc.total_weight_kg||0) + (it.total_weight_kg||0);
                }
                if (acc.unit_weight_kg!=null && it.unit_weight_kg!=null && acc.unit_weight_kg!==it.unit_weight_kg){
                  acc.needs_review = 1;
                }
                acc.confidence = Math.min(acc.confidence||0.95, it.confidence||0.95);
              }
            }
            return Array.from(map.values());
          }

          function parseRawText(text){
            // minimalny parser: skanuje liniami, wykrywa typ/ilość/wymiary/średnicę i wagę
            const lines = normalizeUnits(text).split(/\n|;/);
            const out = [];
            for (const ln of lines){
              const l = ln.trim(); if (!l) continue;
              const qtyM = l.match(/\b(\d{1,4})\s*(pcs|szt|шт|ks|db|ud|uds|ctn|box|pallet|pal|plt|ibc)?\b/i);
              const qty = qtyM ? Math.max(1, parseInt(qtyM[1],10)) : 1;
              const type = detectType(l);
              const dims = parseLWH(l);
              if (!dims && !/ø|⌀|phi|diam/i.test(l)) continue;

              let {L,W,H} = dims || {L:0,W:0,H:0};
              const diam = parseDiameter(l);
              if (diam) { W = diam; }

              let subtype = type==="pallet" ? mapPalletSubtype(l, L, W) : "unknown";
              if (type==="pallet" && H===0) H = 160; // domyślna H dla palet
              if (type!=="pallet" && H===0) { /* zostaw 0 i oznacz review */ }

              const { unit_weight_kg, total_weight_kg, note } = parseWeights(l);
              out.push({
                type, subtype, qty,
                length_cm:L, width_cm:W, height_cm:H, diameter_cm: diam||null,
                unit_weight_kg: unit_weight_kg||null, total_weight_kg: total_weight_kg||null,
                stackable: /stapelbar|stackable|stohovat|piętr/.test(l) ? true : /non-?stack|nicht stapel|nie ?piętr|не штаб/i.test(l) ? false : null,
                notes: note||"",
                lang: "auto",
                confidence: dims?.byLabel ? 0.9 : 0.75,
                needs_review: (H===0||!dims) ? 1 : 0
              });
            }
            return aggregateItems(out);
          }
          // ===================== /MEGA‑PROMPT LIGHT PARSER =====================
