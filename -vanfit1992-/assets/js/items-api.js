          // ===================== ITEMS API =====================
          function addItemFromPreset(p, opts = {}) {
            const it = {
              id: uid(),
              type: p.id,
              ...p.dims,
              weight: p.weight,
              stackable: p.stackable !== false,
              stackCount: 1,
              x: 0,
              y: 0,
              rot: 0,
              flags: (p.stackable === false) ? { noStack: true } : { }
            };
            if (opts.autoPlace) placeNewItem(it);
            state.items.push(it);
            state.selectedId = it.id;
            dispatchSelectionChange();
          }

          function addCustomLine() {
            const raw = (mount.querySelector('#cOne')?.value || '').trim();
            const stackable = !!mount.querySelector('#cStack')?.checked;
            if (!raw) { showError('Podaj D×S×W×kg (opcjonalnie ×ilość)'); return; }
            // Split by commas/semicolon/newline
            const segs = raw.split(/[;,\n]+/).map(s => s.trim()).filter(Boolean);
            const RX = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*(\d+))?\s*$/i;
            let added = 0;
            pushHistory();
            for (const s of segs) {
              const m = s.match(RX);
              if (!m) continue;
              let L = Math.round(parseFloat(String(m[1]).replace(',', '.')));
              let W = Math.round(parseFloat(String(m[2]).replace(',', '.')));
              let H = Math.round(parseFloat(String(m[3]).replace(',', '.')));
              let Kg = Math.round(parseFloat(String(m[4]).replace(',', '.')));
              const Q = Math.max(1, parseInt(m[5] || '1', 10));
              if (L < W) { const tmp=L; L=W; W=tmp; }
              for (let i=0;i<Q;i++){
                const it = { id: uid(), type: 'custom', L, W, H, weight: Kg, stackable, stackCount: 1, x:0, y:0, rot:0, flags: stackable ? {} : { noStack: true } };
                placeNewItem(it);
                state.items.push(it);
                added++;
              }
            }
            if (!added) { showError('Format: 120x80x180x350 [x2]'); return; }
            if (added > 1) autopackUltra(0, true); else renderAll();
            const inp = mount.querySelector('#cOne'); if (inp) inp.value = '';
            try { addAnalyzed(added); } catch(_) {}
          }

          function rotateSelected(dir) {
            const it = state.items.find((x) => x.id === state.selectedId);
            if (!it) return;
            pushHistory();
            it.rot = ((it.rot || 0) + (dir || 1) + 4) % 4;
            const v = vehicle();
            const { l, w } = dims2D(it);
            if (it.x + l > v.inner_cm.L) it.x = v.inner_cm.L - l;
            if (it.y + w > v.inner_cm.W) it.y = v.inner_cm.W - w;
            renderAll();
            dispatchSelectionChange();
          }

          // Strict rotate: toggle 0 <-> 90 only, clamp, and cancel if collision/out-of-bounds
          function rotateSelectedStrict() {
            const it = state.items.find((x) => x.id === state.selectedId);
            if (!it) return false;
            const v = vehicle();
            const prevRot = it.rot || 0;
            const targetRot = (prevRot % 2 === 0) ? 1 : 0;
            // simulate rotation
            const tmp = { ...it, rot: targetRot };
            let { l, w } = dims2D(tmp);
            let nx = it.x, ny = it.y;
            // clamp inside cargo after rotation
            if (nx + l > v.inner_cm.L) nx = v.inner_cm.L - l;
            if (ny + w > v.inner_cm.W) ny = v.inner_cm.W - w;
            const cand = { x: nx, y: ny, l, w };
            // bounds and collisions
            let invalid = outOfBounds(cand, v);
            if (!invalid) {
              for (const other of state.items) {
                if (String(other.id) === String(it.id)) continue;
                const od = dims2D(other);
                const br = { x: other.x, y: other.y, l: od.l, w: od.w };
                if (intersects(cand, br)) { invalid = true; break; }
              }
            }
            if (invalid) {
              try { triggerCollisionFlash(cand, { x: 0, y: 0 }); } catch(_) {}
              return false;
            }
            pushHistory();
            it.rot = targetRot;
            it.x = nx; it.y = ny;
            renderAll();
            dispatchSelectionChange();
            return true;
          }
          function deleteSelected() {
            const i = state.items.findIndex((x) => x.id === state.selectedId);
            if (i > -1) {
              pushHistory();
              state.items.splice(i, 1);
              state.selectedId = null;
              renderAll();
              dispatchSelectionChange();
            }
          }
          function changeStack(delta) {
            const it = state.items.find((x) => x.id === state.selectedId);
            if (!it || !it.stackable) return;
            const v = vehicle();
            const max = Math.max(1, Math.floor(v.inner_cm.H / it.H));
            it.stackCount = Math.min(max, Math.max(1, it.stackCount + delta));
            renderAll();
          }

          function stackAll() {
            pushHistory();
            const v = vehicle();
            const groups = new Map();
            for (const it of state.items) {
              const key = [
                it.type,
                it.L,
                it.W,
                it.H,
                it.weight,
                it.stackable ? "1" : "0",
              ].join("|");
              const arr = groups.get(key) || [];
              arr.push(it);
              groups.set(key, arr);
            }
            const next = [];
            for (const [key, arr] of groups.entries()) {
              const a = arr[0];
              if (!a.stackable) {
                next.push(...arr);
                continue;
              }
              const cap = Math.max(1, Math.floor(v.inner_cm.H / a.H));
              let total = arr.reduce((s, x) => s + x.stackCount, 0);
              while (total > 0) {
                const cnt = Math.min(cap, total);
                next.push({
                  ...deepClone(a),
                  id: uid(),
                  x: 0,
                  y: 0,
                  stackCount: cnt,
                });
                total -= cnt;
              }
            }
            state.items = next;
            renderAll();
          }

          // Copy/Paste
          function copySelected() {
            const it = state.items.find((x) => x.id === state.selectedId);
            if (!it) return;
            state.clipboard = deepClone(it);
            showError("Skopiowano wybrany element");
          }
          function pasteClipboard() {
            if (!state.clipboard) {
              showError("Schowek pusty");
              return;
            }
            pushHistory();
            const base = deepClone(state.clipboard);
            base.id = uid();
            const sel = state.items.find((x) => x.id === state.selectedId);
            if (sel) {
              const sD = dims2D(sel);
              const cand = [
                { x: snap(sel.x + sD.l + vehicle().grid_cm), y: sel.y },
                { x: sel.x, y: snap(sel.y + sD.w + vehicle().grid_cm) },
              ];
              for (const c of cand) {
                base.x = c.x;
                base.y = c.y;
                if (
                  within({ ...base }, vehicle()) &&
                  !anyCollision({ ...base }, null)
                ) {
                  state.items.push(base);
                  state.selectedId = base.id;
                  renderAll();
                  dispatchSelectionChange();
                  return;
                }
              }
            }
            placeNewItem(base);
            state.items.push(base);
            state.selectedId = base.id;
            renderAll();
            dispatchSelectionChange();
          }
