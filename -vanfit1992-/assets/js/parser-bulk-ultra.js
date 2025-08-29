          // ===================== BULK PARSER — ULTRA v8 (dims+qty+kg, table+inline mix, RU/UA) =====================
          // Wspiera: pal/plt/pallet/palette/euro/epal/eur/ep oraz skrót **p** (kontekstowo).
          // Tryb tabelowy + wiersze inline: "1 400x150x150 862kg" oraz "1p 120x21x33" w tym samym polu.
          // Usuwa nadmiarowe spacje/entery wizualnie (nie psuje treści).

          // ——— USTAWIENIA ———
          const H_POLICY_DEFAULT = "hybrid"; // 'strict'|'zero'|'default'|'by_type'|'infer_layers'|'hybrid'
          const H_DEFAULT_CM = 160;
          const PALLET_ADD_HEIGHT_CM = 14.4;
          const MIN_DIM_MM = 30,
            MAX_DIM_MM = 5000;
          const CONF_LOW = 0.7;

          // ——— POMOCE ———
          function normDec(s) {
            return parseFloat(String(s).replace(/\s+/g, "").replace(",", "."));
          }
          function toCm(v, u) {
            if (!u) return v;
            const x = u.toLowerCase();
            if (x === "cm") return v;
            if (x === "mm") return v / 10;
            if (x === "m") return v * 100;
            if (x === "in" || x === '"' || x === "″") return v * 2.54;
            if (
              x === "ft" ||
              x === "'" ||
              x === "′" ||
              x === "фт" ||
              x === "фут"
            )
              return v * 30.48;
            return v;
          }
          function clampMm(vmm) {
            return vmm < MIN_DIM_MM || vmm > MAX_DIM_MM ? null : vmm;
          }
          function mmFromCm(cm) {
            return Math.round(cm * 10);
          }
          function within(v, min, max) {
            return v >= min && v <= max;
          }
          function isEURDims(L, W) {
            const a = [L, W].sort((x, y) => y - x);
            return within(a[0], 119, 121) && within(a[1], 79, 81);
          }

          // ——— PRE‑NORMALIZACJA ———
          function preNormalize(text) {
            let s = String(text || "");
            s = s
              .replace(/[хХ]/g, "x")
              .replace(/\bмм\b/gi, "mm")
              .replace(/\bсм\b/gi, "cm")
              .replace(/\bм\b/gi, "m");
            s = s.replace(/(\d)\s*(?:na|на|by|per|auf)\s*(\d)/gi, "$1x$2"); // 50na30
            s = s.replace(/(\d)(mm|cm|m|in|("|″)|ft|('|′))/gi, "$1 $2"); // 80cm → 80 cm
            s = s.replace(/(\d)(?=[A-Za-z\u00C0-\u024F\u0400-\u04FF])/g, "$1 "); // 4ep→4 ep, 10p→10 p
            s = s.replace(/(\d)\s+(?=\d{3}\b)/g, "$1"); // 12 000 → 12000
            return s;
          }
          function tidyWhitespaceVisual(v) {
            return String(v)
              .replace(/[ \t]{2,}/g, " ")
              .replace(/(\r?\n){2,}/g, "\n");
          }
          function sanitizeForLogistics(text) {
            return preNormalize(text)
              .replace(
                /\b\d[\d\s.,]*\s*(?:zł|pln|eur|€|\$|usd|uah|₴|rub|₽)\b/gi,
                " "
              )
              .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, " ")
              .replace(/\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/g, " ")
              .replace(/\b\d{1,2}:\d{2}\b/g, " ")
              .replace(/\b(?:\+?\d[\d\-.\s()]{6,})\b/g, " ")
              .replace(/(?:#|nr\.?\s*)\d[\d/.-]*/gi, " ");
          }

          // ——— SŁOWNIKI ———
          const UNIT_ANY = "(?:mm|cm|m|in|\"|″|ft|'|′)";
          const XSEP = "(?:x|×|\\*|·|/)";
          const NUM = "\\d+(?:[.,]\\d+)?";
          const HEIGHT_KEYS =
            "(?:h|ht|hgt|wys\\.?|выс\\.?|вис\\.?|высота|висота|вис)";

          const TYPE_TOKEN = {
            pallet:
              /\b(?:pal(?:et|ety|eta)?|plt|pallet|palette|euro|epal|eur|ep|поддон|палет|палета|паллета|піддон|європалета|європіддон|европоддон)\b/i,
            box: /\b(?:box|karton|ctn|case|colli|короб|коробка|ящик|ящ\.)\b/i,
            roll: /\b(?:roll|rolka|rolki|рулон)\b/i,
            bag: /\b(?:bag|worek|мешок|мішок)\b/i,
            drum: /\b(?:drum|beczka|barrel|бочка)\b/i,
            ibc: /\b(?:ibc|paletopojemnik|еврокуб|єврокуб)\b/i,
          };
          // „p” rozpoznajemy kontekstowo (blisko liczby i wymiarów) w typeNear().

          // ——— BAZY PALET ———
          function palletBaseFromSeg(seg) {
            const s = seg.toLowerCase();
            const half =
              /(pół|pol|half|полу|пів|1\/2|eur6|d[üu]sseldorf|dus)\b/i.test(s);
            const quart = /(ćwier|quarter|четверть|1\/4|чверть)\b/i.test(s);
            if (half) return { code: "EUR6", Lcm: 80, Wcm: 60 };
            if (quart) return { code: "QEUR", Lcm: 60, Wcm: 40 };
            if (/\b(eur2|przem|industrial|uk|fin)\b/i.test(s))
              return { code: "EUR2", Lcm: 120, Wcm: 100 };
            if (/\b(eur|epal|euro|ep)\b/i.test(s))
              return { code: "EUR1", Lcm: 120, Wcm: 80 };
            if (/\b(chep)\b/i.test(s) && /\buk\b/i.test(s))
              return { code: "CHEP-1200x1000", Lcm: 120, Wcm: 100 };
            if (/\b(chep)\b/i.test(s))
              return { code: "CHEP-1200x800", Lcm: 120, Wcm: 80 };
            if (/\b(48\s*x\s*40|40\s*x\s*48|gma|usa|сша)\b/i.test(s))
              return { code: "US-48x40", Lcm: 121.9, Wcm: 101.6 };
            if (/\b(iso|1100\s*x\s*1100|asia|азиат)\b/i.test(s))
              return { code: "ISO-1100x1100", Lcm: 110, Wcm: 110 };
            return { code: "", Lcm: null, Wcm: null };
          }
          function palletDimsByCode(code) {
            switch ((code || "").toUpperCase()) {
              case "EUR1":
                return { Lcm: 120, Wcm: 80 };
              case "EUR2":
                return { Lcm: 120, Wcm: 100 };
              case "EUR3":
                return { Lcm: 120, Wcm: 100 };
              case "EUR6":
                return { Lcm: 80, Wcm: 60 };
              case "QEUR":
                return { Lcm: 60, Wcm: 40 };
              case "CHEP-1200X800":
                return { Lcm: 120, Wcm: 80 };
              case "CHEP-1200X1000":
                return { Lcm: 120, Wcm: 100 };
              case "US-48X40":
                return { Lcm: 121.9, Wcm: 101.6 };
              case "ISO-1100X1100":
                return { Lcm: 110, Wcm: 110 };
              case "FIN":
                return { Lcm: 120, Wcm: 100 };
              default:
                return { Lcm: null, Wcm: null };
            }
          }
          function defaultHByType(code) {
            if (code === "EUR6") return 90;
            if (code === "QEUR") return 60;
            return 160;
          }

          // ——— WYMIARY (globalne z indeksami) ———
          const TRIPLE_ANY_G = new RegExp(
            String.raw`(?<a>${NUM})\s*(?<ua>${UNIT_ANY})?\s*${XSEP}\s*(?<b>${NUM})\s*(?<ub>${UNIT_ANY})?\s*${XSEP}\s*(?<c>${NUM})\s*(?<uc>${UNIT_ANY})?`,
            "ig"
          );
          const SPACE_TRIPLE_G = new RegExp(
            String.raw`(?<a>${NUM})\s+(?<b>${NUM})\s+(?<c>${NUM})(?:\s*(?<u>${UNIT_ANY}))?`,
            "ig"
          );
          const LABELED_G = new RegExp(
            String.raw`(?:l|len|dł|dl|д|довжина)\s*[:=]?\s*(?<a>${NUM})\s*(?<ua>${UNIT_ANY})?.{0,12}(?:w|szer|b|breite|ш|ширина)\s*[:=]?\s*(?<b>${NUM})\s*(?<ub>${UNIT_ANY})?.{0,12}(?:h|wys|höhe|в|высота|висота)\s*[:=]?\s*(?<c>${NUM})\s*(?<uc>${UNIT_ANY})?`,
            "ig"
          );
          const DOUBLE_ANY_G = new RegExp(
            String.raw`(?<a>${NUM})\s*(?<ua>${UNIT_ANY})?\s*${XSEP}\s*(?<b>${NUM})\s*(?<ub>${UNIT_ANY})?`,
            "ig"
          );
          const DIAM_G = new RegExp(
            String.raw`(?:ø|⌀|phi|diam(?:eter)?|диаметр|діаметр)\s*(?<d>${NUM})\s*(?<ud>${UNIT_ANY})?\s*(?:${XSEP}|x)\s*(?<l>${NUM})\s*(?<ul>${UNIT_ANY})?`,
            "ig"
          );
          const HEIGHT_ONLY = new RegExp(
            String.raw`(?:^|[^\w])(?:${HEIGHT_KEYS})\s*[:=]?\s*(?<h>${NUM})\s*(?<uh>${UNIT_ANY})?(?:\b|$)`,
            "i"
          );

          // ——— ILOŚĆ ———
          function qtyNear(seg, idxStart) {
            const L = Math.max(0, idxStart - 60);
            const ctx = seg.slice(L, idxStart + 1);
            let m = ctx.match(
              /\b(\d+)\s*(?:warstw|warstwy|сло[йя]|уровн\w+|шар(?:и)?|рівн\w+)\b.*?\bpo\s*(\d+)\b/i
            );
            if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
            m = ctx.match(
              /\b(\d+)\s*x\s*(?:pal(?:et|ety|eta)?|plt|pallet|palette|euro|epal|eur|ep|p|szt|pcs|шт|ctn|box)\b/i
            );
            if (m) return parseInt(m[1], 10);
            m = ctx.match(
              /\b(\d+)\s*(?:pal(?:et|ety|eta)?|plt|pallet|palette|euro|epal|eur|ep|p|szt|pcs|шт|ctn|box)\b/i
            );
            if (m) return parseInt(m[1], 10);
            return 1;
          }

          // ——— TYP (z 'p' kontekstowo) ———
          function typeNear(seg, idxStart) {
            const L = Math.max(0, idxStart - 60);
            const ctx = seg.slice(L, idxStart + 1);
            let unit_type = null;
            for (const [kind, rx] of Object.entries(TYPE_TOKEN)) {
              if (rx.test(ctx)) {
                unit_type = kind;
                break;
              }
            }
            if (!unit_type && /\b\d+\s*p\b/i.test(ctx)) unit_type = "pallet";
            let code = "";
            if (unit_type === "pallet") code = palletBaseFromSeg(ctx).code;
            return { unit_type, code };
          }

          // ——— WYSOKOŚĆ ———
          function parseHeightAround(seg, idxStart) {
            const R = Math.min(seg.length, idxStart + 60);
            const right = seg.slice(idxStart, R);
            let m = right.match(HEIGHT_ONLY);
            if (!m) {
              const L = Math.max(0, idxStart - 60);
              const left = seg.slice(L, idxStart);
              m = left.match(HEIGHT_ONLY);
            }
            if (!m) return null;
            const h = toCm(normDec(m.groups.h), m.groups.uh || null);
            return clampMm(mmFromCm(h)) == null ? null : h;
          }

          // ——— WAGA ———
          function weightNear(seg, idxStart, qty) {
            const L = Math.max(0, idxStart - 60);
            const R = Math.min(seg.length, idxStart + 80);
            const ctx = seg.slice(L, R);
            let m = ctx.match(
              new RegExp(
                String.raw`(?:po|per|na)\s*(${NUM})\s*(?:kg|кг)\b`,
                "i"
              )
            );
            if (m) return { unit_w: normDec(m[1]), total_w: null };
            m = ctx.match(new RegExp(String.raw`(${NUM})\s*(?:kg|кг)\b`, "i"));
            if (m) {
              const v = normDec(m[1]);
              return qty <= 1
                ? { unit_w: v, total_w: null }
                : { unit_w: null, total_w: v };
            }
            m = ctx.match(new RegExp(String.raw`(?:kg|кг)\s*(${NUM})\b`, "i"));
            if (m) {
              const v = normDec(m[1]);
              return qty <= 1
                ? { unit_w: v, total_w: null }
                : { unit_w: null, total_w: v };
            }
            m = ctx.match(
              new RegExp(
                String.raw`(${NUM})\s*(?:kg|кг)\s*/\s*(?:pal(?:et|ety|eta)?|plt|pallet|pcs?|szt|шт|p)\b`,
                "i"
              )
            );
            if (m) return { unit_w: normDec(m[1]), total_w: null };
            m = ctx.match(
              new RegExp(
                String.raw`(?:total|gross|brutto|netto)\s*(${NUM})\s*(?:kg|кг|t)\b`,
                "i"
              )
            );
            if (m) {
              let v = normDec(m[1]);
              if (/t\b/i.test(m[0])) v *= 1000;
              return { unit_w: null, total_w: v };
            }
            return { unit_w: null, total_w: null };
          }

          // ——— WYMIARY: znajdź wszystkie wystąpienia ———
          function findAllDims(seg) {
            const found = [];
            function pushTriple(m, idx) {
              let a = normDec(m.groups.a),
                b = normDec(m.groups.b),
                c = normDec(m.groups.c);
              const ua = m.groups.ua,
                ub = m.groups.ub,
                uc = m.groups.uc;
              let L = toCm(a, ua || uc || null),
                W = toCm(b, ub || uc || null),
                H = toCm(c, uc || null);
              if (!ua && !ub && !uc && [L, W, H].every((v) => v >= 300))
                [L, W, H] = [L / 10, W / 10, H / 10];
              if ([L, W, H].every((v) => clampMm(mmFromCm(v)) != null))
                found.push({
                  start: idx,
                  end: idx + m[0].length,
                  L: Math.max(L, W),
                  W: Math.min(L, W),
                  H,
                  conf: 0.9,
                });
            }
            function pushSpaceTriple(m, idx) {
              let a = normDec(m.groups.a),
                b = normDec(m.groups.b),
                c = normDec(m.groups.c);
              const u = m.groups.u || null;
              if (u) {
                a = toCm(a, u);
                b = toCm(b, u);
                c = toCm(c, u);
              } else if ([a, b, c].every((v) => v >= 300)) {
                a /= 10;
                b /= 10;
                c /= 10;
              }
              if ([a, b, c].every((v) => clampMm(mmFromCm(v)) != null))
                found.push({
                  start: idx,
                  end: idx + m[0].length,
                  L: Math.max(a, b),
                  W: Math.min(a, b),
                  H: c,
                  conf: 0.8,
                });
            }
            function pushDouble(m, idx) {
              let a = normDec(m.groups.a),
                b = normDec(m.groups.b);
              const ua = m.groups.ua,
                ub = m.groups.ub;
              let L = toCm(a, ua || ub || null),
                W = toCm(b, ub || ua || null);
              if ([L, W].every((v) => clampMm(mmFromCm(v)) != null))
                found.push({
                  start: idx,
                  end: idx + m[0].length,
                  L: Math.max(L, W),
                  W: Math.min(L, W),
                  H: null,
                  conf: 0.65,
                });
            }
            function pushLabeled(m, idx) {
              const a = toCm(normDec(m.groups.a), m.groups.ua),
                b = toCm(normDec(m.groups.b), m.groups.ub),
                c = toCm(normDec(m.groups.c), m.groups.uc);
              if ([a, b, c].every((v) => clampMm(mmFromCm(v)) != null))
                found.push({
                  start: idx,
                  end: idx + m[0].length,
                  L: Math.max(a, b),
                  W: Math.min(a, b),
                  H: c,
                  conf: 0.95,
                });
            }
            function pushDiam(m, idx) {
              const d = toCm(normDec(m.groups.d), m.groups.ud),
                l = toCm(normDec(m.groups.l), m.groups.ul);
              if ([d, l].every((v) => clampMm(mmFromCm(v)) != null))
                found.push({
                  start: idx,
                  end: idx + m[0].length,
                  L: Math.max(d, l),
                  W: Math.min(d, l),
                  H: null,
                  dia: d,
                  conf: 0.8,
                });
            }
            for (const m of seg.matchAll(TRIPLE_ANY_G)) pushTriple(m, m.index);
            for (const m of seg.matchAll(LABELED_G)) pushLabeled(m, m.index);
            for (const m of seg.matchAll(DIAM_G)) pushDiam(m, m.index);
            for (const m of seg.matchAll(SPACE_TRIPLE_G))
              pushSpaceTriple(m, m.index);
            for (const m of seg.matchAll(DOUBLE_ANY_G)) pushDouble(m, m.index);

            found.sort((a, b) => a.start - b.start || b.conf - a.conf);
            const dedup = [];
            for (const f of found) {
              if (dedup.some((d) => !(f.end <= d.start || f.start >= d.end)))
                continue;
              dedup.push(f);
            }
            return dedup;
          }

          // ——— TRYB TABELA (również inline) ———
          const TABLE_HDR_RX =
            /\b(pallets?|palety|поддоны|піддони)\b|\b(length|width|height|weight|waga|длина|ширина|высота|довжина|висота|höhe|breite|länge)\b/i;
          function guessTableUnit(raw) {
            if (/\bmm\)/i.test(raw) || /\bmm\b/i.test(raw)) return "mm";
            if (/\bcm\)/i.test(raw) || /\bcm\b/i.test(raw)) return "cm";
            if (
              /\bm\)/i.test(raw) &&
              !/\bmm\b/i.test(raw) &&
              !/\bcm\b/i.test(raw)
            )
              return "m";
            return "cm";
          }
          function headerSuggestsUnitWeight(raw) {
            return /\b(per\s*(?:pallet|piece|pcs?)|kg\/(?:pal|plt|pcs?|szt)|waga\s*szt|weight\s*per)\b/i.test(
              raw
            );
          }
          function extractTableSegments(raw) {
            if (!TABLE_HDR_RX.test(raw)) return [];
            const unit = guessTableUnit(raw);
            const unitIsPer = headerSuggestsUnitWeight(raw);
            const used = [];
            const segs = [];
            const NUMR = `${NUM}`;
            function isFree(i, len) {
              return !used.some((r) => !(i + len <= r[0] || i >= r[1]));
            }
            function mark(i, len) {
              used.push([i, i + len]);
            }

            // qty + L + W + H (+ kg) — pionowo lub spacjami
            const RE_Q_LWH = new RegExp(
              String.raw`\b(?<qty>\d{1,4})\s*[\r\n\t ]+\s*(?<L>${NUMR})\s*[\r\n\t ]+\s*(?<W>${NUMR})\s*[\r\n\t ]+\s*(?<H>${NUMR})(?:\s*[\r\n\t ]+(?<kg>(?:${NUMR})))?`,
              "g"
            );
            for (const m of raw.matchAll(RE_Q_LWH)) {
              const idx = m.index,
                len = m[0].length;
              if (!isFree(idx, len)) continue;
              let q = parseInt(m.groups.qty, 10);
              let L = toCm(normDec(m.groups.L), unit),
                W = toCm(normDec(m.groups.W), unit),
                H = toCm(normDec(m.groups.H), unit);
              if ([L, W, H].some((v) => clampMm(mmFromCm(v)) == null)) continue;
              const kg = m.groups.kg ? Math.round(normDec(m.groups.kg)) : null;
              const kgStr = kg != null ? ` kg ${kg}` : "";
              segs.push(
                `${q} p ${Math.round(L)}x${Math.round(W)}x${Math.round(
                  H
                )} ${unit}${kgStr}${unitIsPer ? " /p" : ""}`
              );
              mark(idx, len);
            }

            // L + W + H (+ kg) → domyślnie qty=1
            const RE_LWH = new RegExp(
              String.raw`\b(?<L>${NUMR})\s*[\r\n\t ]+\s*(?<W>${NUMR})\s*[\r\n\t ]+\s*(?<H>${NUMR})(?:\s*[\r\n\t ]+(?<kg>(?:${NUMR})))?`,
              "g"
            );
            for (const m of raw.matchAll(RE_LWH)) {
              const idx = m.index,
                len = m[0].length;
              if (!isFree(idx, len)) continue;
              let L = toCm(normDec(m.groups.L), unit),
                W = toCm(normDec(m.groups.W), unit),
                H = toCm(normDec(m.groups.H), unit);
              if ([L, W, H].some((v) => clampMm(mmFromCm(v)) == null)) continue;
              const kg = m.groups.kg ? Math.round(normDec(m.groups.kg)) : null;
              const kgStr = kg != null ? ` kg ${kg}` : "";
              segs.push(
                `1 p ${Math.round(L)}x${Math.round(W)}x${Math.round(
                  H
                )} ${unit}${kgStr}${unitIsPer ? " /p" : ""}`
              );
              mark(idx, len);
            }

            // **NOWE**: wiersz inline "1 400x150x150 862kg" lub "1 400x150x150 kg 862"
            const RE_INLINE = new RegExp(
              String.raw`\b(?<qty>\d{1,4})\s+(?<L>${NUMR})\s*(?:x|×|\*|\/)\s*(?<W>${NUMR})\s*(?:x|×|\*|\/)\s*(?<H>${NUMR})(?:\s*(?:kg|кг)\s*(?<kg1>${NUMR})|\s*(?<kg2>${NUMR})\s*(?:kg|кг))?`,
              "gi"
            );
            for (const m of raw.matchAll(RE_INLINE)) {
              const idx = m.index,
                len = m[0].length;
              if (!isFree(idx, len)) continue;
              const q = parseInt(m.groups.qty, 10);
              let L = toCm(normDec(m.groups.L), unit),
                W = toCm(normDec(m.groups.W), unit),
                H = toCm(normDec(m.groups.H), unit);
              if ([L, W, H].some((v) => clampMm(mmFromCm(v)) == null)) continue;
              const kg = m.groups.kg1
                ? Math.round(normDec(m.groups.kg1))
                : m.groups.kg2
                ? Math.round(normDec(m.groups.kg2))
                : null;
              const kgStr = kg != null ? ` kg ${kg}` : "";
              segs.push(
                `${q} p ${Math.round(L)}x${Math.round(W)}x${Math.round(
                  H
                )} ${unit}${kgStr}${unitIsPer ? " /p" : ""}`
              );
              mark(idx, len);
            }

            return segs;
          }

          // ——— FLAGI ———
          const STACK_POS =
            /\b(?:piętrow|pietrow|stack(?:able)?|stack all|stacking allowed|штабел|stackuj)\b/i;
          const STACK_NEG =
            /\b(?:nie\s*piętrow|nie\s*pietrow|non-?stack|no stack|не\s*штаб)\b/i;
          function detectStackFlags(seg) {
            return { pos: STACK_POS.test(seg), neg: STACK_NEG.test(seg) };
          }
          function hasNoPallet(seg) {
            return /\b(?:bez palety|bez\s*poddona|без\s*поддона|без\s*палеты|без\s*палети|без\s*піддона)\b/i.test(
              seg
            );
          }

          // ——— GŁÓWNA FUNKCJA ———
          function extractLogistics(raw) {
            const original = String(raw || "");
            const text = sanitizeForLogistics(original);
            const low = text.toLowerCase();

            // segmenty klasyczne + pseudo‑segmenty z tabel (także inline)
            const segA = low
              .split(/[\n;•]+|(?<!\d)[,.](?!\d)/g)
              .map((s) => s.trim())
              .filter(Boolean);
            const tableSegs = extractTableSegments(original);
            const segments = segA.concat(tableSegs);

            const items = [];
            const orderKeys = [];

            for (const seg of segments) {
              const dimsList = findAllDims(seg);
              if (!dimsList.length) continue;

              const stack = detectStackFlags(seg);
              const addPal = hasNoPallet(seg);

              for (const d of dimsList) {
                let { unit_type: ut, code } = typeNear(seg, d.start);
                // jeśli mamy nagłówki tabeli w całym tekście i brak typu → załóż paletę
                if (!ut && tableSegs.length) {
                  ut = "pallet";
                  code = code || palletBaseFromSeg(seg).code;
                }

                if (
                  !ut &&
                  !/(?:wymiary|rozmiar|dimension|größe|размер|розмір)/i.test(
                    seg
                  )
                )
                  continue;

                const qty = qtyNear(seg, d.start);
                let L = d.L,
                  W = d.W,
                  H = d.H;
                const diameter = d.dia || null;

                const w = weightNear(seg, d.start, qty);

                // paleta → baza
                let pallet_code = code;
                if (ut === "pallet" && (L == null || W == null)) {
                  const b = palletBaseFromSeg(seg);
                  pallet_code = b.code || code;
                  if (b.Lcm && b.Wcm) {
                    L = b.Lcm;
                    W = b.Wcm;
                  }
                }

                // H polityka
                if (H == null) {
                  if (ut === "pallet") {
                    if (H_POLICY_DEFAULT === "by_type")
                      H = defaultHByType(pallet_code);
                    else if (H_POLICY_DEFAULT === "default") H = H_DEFAULT_CM;
                    else if (H_POLICY_DEFAULT === "hybrid")
                      H = defaultHByType(pallet_code) ?? H_DEFAULT_CM;
                    else if (H_POLICY_DEFAULT === "zero") H = 0;
                    else {
                      const hLocal = parseHeightAround(seg, d.start);
                      if (hLocal != null) H = hLocal;
                    }
                  } else {
                    const hLocal = parseHeightAround(seg, d.start);
                    H =
                      hLocal != null
                        ? hLocal
                        : H_POLICY_DEFAULT === "zero"
                        ? 0
                        : null;
                  }
                }

                if (addPal && H != null) H += PALLET_ADD_HEIGHT_CM;

                const plausible =
                  (L == null || clampMm(mmFromCm(L)) != null) &&
                  (W == null || clampMm(mmFromCm(W)) != null) &&
                  (H == null || clampMm(mmFromCm(H)) != null);
                const conf = d.conf || 0.7;
                const needs_review = !plausible || conf < CONF_LOW ? 1 : 0;

                const item = {
                  idx: d.start,
                  type: ut || "other",
                  subtype:
                    ut === "pallet" ? pallet_code || "unknown" : "unknown",
                  qty,
                  length_cm: L != null ? Math.round(L) : null,
                  width_cm:
                    W != null
                      ? Math.round(W)
                      : diameter != null
                      ? Math.round(diameter)
                      : null,
                  height_cm: H != null ? Math.round(H) : null,
                  diameter_cm: diameter != null ? Math.round(diameter) : null,
                  unit_weight_kg:
                    w.unit_w != null ? Math.round(w.unit_w) : null,
                  total_weight_kg:
                    w.total_w != null ? Math.round(w.total_w) : null,
                  stackable: stack.neg ? false : stack.pos ? true : null,
                  notes: addPal ? "bez palety +14.4 cm" : "",
                  lang: /[а-яёіїєґ]/i.test(seg) ? "ru/uk" : "pl/en/de",
                  confidence: Math.max(0, Math.min(1, conf)),
                  needs_review,
                };

                items.push(item);
                orderKeys.push({
                  key: `${item.type}|${item.subtype}|${item.length_cm}|${
                    item.width_cm
                  }|${item.height_cm || 0}`,
                  idx: item.idx,
                });
              }
            }

            // AGREGACJA z zachowaniem kolejności
            const order = [];
            const seen = new Set();
            for (const g of orderKeys) {
              if (!seen.has(g.key)) {
                seen.add(g.key);
                order.push(g.key);
              }
            }
            const grouped = new Map();
            for (const it of items) {
              const k = `${it.type}|${it.subtype}|${it.length_cm}|${
                it.width_cm
              }|${it.height_cm || 0}`;
              if (grouped.has(k)) {
                const x = grouped.get(k);
                x.qty += it.qty;
                x.needs_review |= it.needs_review;
                x.confidence = Math.min(x.confidence, it.confidence);
                if (
                  x.unit_weight_kg != null &&
                  it.unit_weight_kg != null &&
                  x.unit_weight_kg !== it.unit_weight_kg
                )
                  x.needs_review = 1;
                if (it.total_weight_kg != null)
                  x.total_weight_kg =
                    (x.total_weight_kg || 0) + it.total_weight_kg;
              } else grouped.set(k, { ...it });
            }
            const aggregated = order
              .map((k) => {
                for (const [gk, val] of grouped.entries()) {
                  if (gk.endsWith(k.split("|").slice(2).join("|"))) return val;
                }
                return null;
              })
              .filter(Boolean);

            return { items: aggregated, warnings: [] };
          }

          // ——— PODGLĄD ———
          function prettyExtractPreview(res) {
            if (!res.items.length) return t('no_items');
            return res.items
              .map((it) => {
                const qty = it.qty || 1;
                const dims = it.diameter_cm
                  ? `${it.diameter_cm}Ø×${it.length_cm || 0}`
                  : `${it.length_cm || 0}x${it.width_cm || 0}x${
                      it.height_cm || 0
                    }`;
                const kind = (function(){
                  if (it.type !== 'pallet') return it.type;
                  if (it.subtype === 'EUR6') return t('pallet_half');
                  if (it.subtype === 'QEUR') return t('pallet_quarter');
                  return t('pallet');
                })();
                const w =
                  it.unit_weight_kg != null
                    ? ` • ${it.unit_weight_kg} ${t('kg_per_pc')}`
                    : it.total_weight_kg != null
                    ? ` • ${it.total_weight_kg} kg ${t('total_note')}`
                    : "";
                const flag = it.needs_review ? ` • △ ${t('check_flag')}` : "";
                return `${qty} ${kind} ${dims}${w}${flag}`;
              })
              .join("\n");
          }


          function applyExtractedItems(items) {
            if (!items || !items.length) return false;
            pushHistory();
            for (const it of items) {
              const qty = Math.max(1, it.qty || 1);

              let L = it.length_cm,
                W = it.width_cm,
                H = it.height_cm;
              if ((L == null || W == null) && it.type === "pallet") {
                const base = palletDimsByCode(it.subtype || "");
                if (!L && base.Lcm != null) L = base.Lcm;
                if (!W && base.Wcm != null) W = base.Wcm;
              }
              if (H == null) {
                if (it.type === "pallet")
                  H =
                    defaultHByType((it.subtype || "").toString()) ??
                    H_DEFAULT_CM;
                else H = 0;
              }

              const perKg =
                it.unit_weight_kg != null
                  ? it.unit_weight_kg
                  : it.total_weight_kg != null && qty > 0
                  ? Math.round(it.total_weight_kg / qty)
                  : 0;

              let nodeType = "custom";
              if (
                it.type === "pallet" &&
                (/eur|epal|ep/i.test(it.subtype || "") || isEURDims(L, W))
              )
                nodeType = "eur_pallet";

              L = Math.round(L ?? 120);
              W = Math.round(W ?? (it.diameter_cm || 80));
              H = Math.round(H ?? (it.diameter_cm || 80));

              for (let i = 0; i < qty; i++) {
                const node = {
                  id: uid(),
                  type: nodeType,
                  L,
                  W,
                  H,
                  weight: Math.round(perKg || 0),
                  stackable: it.stackable == null ? true : !!it.stackable,
                  stackCount: 1,
                  x: 0,
                  y: 0,
                  rot: 0,
                  flags: (it.stackable === false) ? { noStack: true } : {}
                };
                placeNewItem(node);
                state.items.push(node);
              }
            }
            // Auto‑pack immediately after bulk add
            autopackUltra(0, true);
            return true;
          }

          // ——— SPINANIE Z UI ———
          bulkText.addEventListener("input", () => {
            const txt = bulkText.value || "";
            const res = extractLogistics(txt);
            if (res.items && res.items.length) {
              bulkOut.textContent = prettyExtractPreview(res);
            } else {
              // Fallback to MEGA‑PROMPT lightweight parser preview
              try {
                const fallbackItems = parseRawText(txt) || [];
                bulkOut.textContent = prettyExtractPreview({ items: fallbackItems });
              } catch {
                bulkOut.textContent = prettyExtractPreview({ items: [] });
              }
            }
          });
          bulkText.addEventListener("paste", () =>
            setTimeout(() => {
              bulkText.value = tidyWhitespaceVisual(bulkText.value);
            }, 0)
          );
          bulkText.addEventListener("blur", () => {
            bulkText.value = tidyWhitespaceVisual(bulkText.value);
          });

          bulkAdd.addEventListener("click", () => {
            const txt = bulkText.value || "";
            const res = extractLogistics(txt);
            let items = (res && res.items) ? res.items : [];
            if (!items.length) {
              // Fallback to MEGA‑PROMPT lightweight parser application
              try {
                const fallbackItems = parseRawText(txt) || [];
                if (fallbackItems.length) {
                  items = fallbackItems;
                }
              } catch {}
            }
            if (!items.length) {
              showError("Nie wykryto żadnych pozycji");
              return;
            }
            applyExtractedItems(items);
            try { addAnalyzed(items.length); } catch(_) {}
          });

          // View toggle 2D/3D
          // Init aria-pressed state for 2D/3D toggle
  try { if (view3DBtn) view3DBtn.setAttribute('aria-pressed', String(state.viewMode === '3d')); } catch(_) {}
  try { if (view3DBtn) view3DBtn.textContent = (state.viewMode === '3d') ? '2D' : '3D'; } catch(_) {}
  view3DBtn?.addEventListener("click", () => {
            const to3d = state.viewMode !== "3d";
            state.viewMode = to3d ? "3d" : "2d";
            view3DBtn.textContent = to3d ? '2D' : '3D';
            try { view3DBtn.setAttribute('aria-pressed', String(to3d)); } catch(_) {}
            renderAll();
            try { overlayLabels.updateAll(); } catch(_){}
            // Focus management: move focus to active viewport
            try {
              if (to3d) {
                view3d?.setAttribute('tabindex','0');
                view3d?.focus();
              } else {
                board?.focus();
              }
            } catch(_) {}
  });
  // Sketch/Illustration mode toggle
  const sketchBtn = mount.querySelector('#sketch3D');
  try { sketchBtn?.setAttribute('aria-pressed', String(!!(threeCtx && threeCtx.state && threeCtx.state.sketch))); } catch(_) {}
  sketchBtn?.addEventListener('click', () => {
    try { threeInit(); } catch(_) {}
    try {
      const on = !threeCtx.state.sketch;
      threeSetSketch(on);
      sketchBtn.setAttribute('aria-pressed', String(on));
    } catch(_) {}
  });
          // Mobile: bottom sheet toggle
          toggleSheetBtn?.addEventListener('click', () => {
            if (mount.getAttribute('data-device') !== 'mobile') return;
            const side = mount.querySelector('.side');
            if (!side) return;
            side.classList.toggle('open');
          });
          // Mobile PDF export -> print
          pdfBtn?.addEventListener('click', () => {
            try { window.print(); } catch(_) {}
          });
          window.addEventListener("resize", () => {
            applyDevice();
            if (state.viewMode === "3d") render3D();
            // Re-render items to recalc compact labels on zoom/resize
            renderItems();
            renderSection();
            try { overlayLabels.updateAll(); } catch(_) {}
            try { render(); } catch(_) {}
          });
          // Grid toggle wiring (button -> hidden checkbox)
          try {
            const gridBtn = mount.querySelector('#toggleGrid');
            const gridCb  = mount.querySelector('#gridToggle');
            gridBtn?.addEventListener('click', () => {
              if (!gridCb) return;
              gridCb.checked = !gridCb.checked;
              try { render(); } catch(_) {}
              updateStatus();
            });
          } catch(_) {}
          // Wire expanders (nowoczesne rozwijanie)
          try {
            function wireExpander(box){
              if (!box) return;
              const head = box.querySelector('.expander-head');
              const body = box.querySelector('.expander-body');
              // Przyciski akcji w nagłówku nie mogą rozwijać/zamykać
              try {
                box.querySelectorAll('.expander-head .head-actions button')
                  .forEach(b => b.addEventListener('click', (e)=> e.stopPropagation()));
              } catch(_) {}
              const setOpen = (on)=>{
                box.setAttribute('data-open', on ? 'true':'false');
                head?.setAttribute('aria-expanded', String(!!on));
                if (!body) return;
                // płynna animacja max-height
                if (on){
                  body.style.maxHeight = body.scrollHeight + 'px';
                } else {
                  body.style.maxHeight = '0px';
                }
              };
              head?.addEventListener('click', ()=> setOpen(box.getAttribute('data-open')!== 'true'));
              head?.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); head.click(); } });
              // start zamknięty
              setOpen(box.getAttribute('data-open')==='true');
              // po zmianie zawartości skoryguj wysokość
              const ro = new ResizeObserver(()=>{ if (box.getAttribute('data-open')==='true' && body) body.style.maxHeight = body.scrollHeight+'px'; });
              body && ro.observe(body);
            }
            wireExpander(mount.querySelector('#vehExpander'));
            // Dropdown dla "Własny pojazd"
            try {
              const cust = mount.querySelector('#custDD');
              const addChipInline = mount.querySelector('#addVehChipInline');
              function buildForm(){
                return `
                  <style>
                    .cv-row{display:flex;align-items:center;gap:8px}
                    .cv-row input{width:110px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:#0c1322;color:var(--ink)}
                    .cv-row input::placeholder{color:var(--muted);opacity:.85}
                    .cv-row .sep{opacity:.6;padding:0 2px}
                    .cv-sub{display:flex;align-items:center;gap:8px;margin-top:8px}
                    .cv-sub input{width:120px}
                    .cv-sub input::placeholder{color:var(--muted);opacity:.85}
                    .cv-hint{color:var(--muted);font-size:.85rem;margin-top:4px}
                  </style>
                  <div class="cv-row">
                    <input id="cvL" type="number" min="50" value="" placeholder="${t('length_cm')}">
                    <span class="sep">×</span>
                    <input id="cvW" type="number" min="50" value="" placeholder="${t('width_cm')}">
                    <span class="sep">×</span>
                    <input id="cvH" type="number" min="50" value="" placeholder="${t('height_cm')}">
                  </div>
                  <div class="cv-sub">
                    <input id="cvKg" type="number" min="0" value="" placeholder="${t('payload_kg')}">
                    <input id="cvEP" type="number" min="0" value="" placeholder="EP">
                    <input id="cvGrid" type="number" min="1" value="" placeholder="${t('grid')} (cm)">
                    <div style="flex:1"></div>
                    <button id="cvCreate" class="btn">${t('create_vehicle')}</button>
                  </div>
                  <div class="cv-hint">${t('enter_cm_hint')}</div>`;
              }
              function openCust(){
                const anchor = addChipInline;
                if (!cust || !anchor) return; cust.innerHTML = buildForm();
                const wrap = mount.querySelector('.vp-wrap');
                const rc = anchor.getBoundingClientRect(); const w = wrap.getBoundingClientRect();
                cust.style.left = (rc.left - w.left) + 'px';
                cust.style.top  = (rc.bottom - w.top + 6) + 'px';
                cust.style.minWidth = '520px';
                cust.style.display = 'block'; cust.hidden = false;
                cust.querySelector('#cvCreate')?.addEventListener('click', ()=>{
                  const L=+cust.querySelector('#cvL').value||0; const W=+cust.querySelector('#cvW').value||0; const H=+cust.querySelector('#cvH').value||0;
                  const Kg=+cust.querySelector('#cvKg').value||0; const EP=+cust.querySelector('#cvEP').value||0; const Grid=+cust.querySelector('#cvGrid').value||5;
                  createVehicleWith(L,W,H,Kg,EP,Grid); closeCust();
                });
                setTimeout(()=>{
                  const onDoc=(e)=>{ if (!cust.contains(e.target) && !anchor.contains(e.target)) { closeCust(); document.removeEventListener('pointerdown', onDoc);} };
                  document.addEventListener('pointerdown', onDoc);
                },0);
              }
              function closeCust(){ if (!cust) return; cust.style.display='none'; cust.hidden=true; }
              function wireChip(el){
                if (!el) return; el.addEventListener('click',(e)=>{ e.stopPropagation(); openCust(); });
                let timer=null; const delayClose=()=>{ clearTimeout(timer); timer=setTimeout(closeCust,180); }; const cancel=()=> clearTimeout(timer);
                el.addEventListener('mouseenter', ()=>{ cancel(); openCust(); });
                el.addEventListener('mouseleave', ()=> delayClose());
                cust?.addEventListener('mouseenter', ()=> cancel());
                cust?.addEventListener('mouseleave', ()=> delayClose());
              }
              wireChip(addChipInline);
            } catch(_){}
          } catch(_) {}
          // Canvas hit-test selection
          try {
            const cv = mount.querySelector('#floor');
            cv?.addEventListener('pointerdown', (e) => {
              const rect = cv.getBoundingClientRect();
              const sx = e.clientX - rect.left;
              const sy = e.clientY - rect.top;
              const hit = hitTest(sx, sy);
              VP2D.selectedId = hit ? hit.id : null;
              render();
            });
            // Hover on 2D canvas: show label for the hovered rectangle
            cv?.addEventListener('pointermove', (e) => {
              const rect = cv.getBoundingClientRect();
              const sx = e.clientX - rect.left;
              const sy = e.clientY - rect.top;
              const hit = hitTest(sx, sy);
              try { overlayLabels.setHotId(hit ? hit.id : null); } catch(_) {}
            });
            cv?.addEventListener('pointerleave', () => { try { overlayLabels.setHotId(null); } catch(_) {} });
          } catch(_) {}
          // Autosave 2D model (no debug items by default)
          try {
            loadState2D();
            // Wyczyść ewentualne testowe prostokąty z poprzednich sesji
            if (Array.isArray(VP2D.items) && VP2D.items.length) {
              VP2D.items = [];
              try { saveState2D(); } catch(_) {}
            }
          } catch(_) {}
          try {
            setInterval(saveState2D, 2000);
            window.addEventListener('beforeunload', saveState2D);
          } catch(_) {}
          
