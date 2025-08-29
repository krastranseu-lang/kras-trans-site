          // ===================== Overlay Labels (IIFE) =====================
          // Provides: buildLabel(item), layoutLabels(), updateAll(), worldToScreen(x,y), test helpers
          const overlayLabels = (() => {
            let viewport = mount.querySelector('#viewport');
            let floor = mount.querySelector('#floor');
            let overlay = mount.querySelector('#overlay');
            let labels = mount.querySelector('#labels');
            let tip = null; // tooltip element for aria-describedby
            // Track the currently hovered item ID for auto-show labels
            let hotId = '';
            // Caches and helpers for label layout
            const labelSizeCache = new Map(); // Map<id, {w,h}>
            const placed = new Map(); // Map<id, {left,top,w,h}>
            let ro = null; // ResizeObserver for label content changes

            // Helper: parse CSS color to RGB array [r,g,b]
            function parseColor(c){
              if (!c) return [0,0,0];
              c = String(c).trim();
              // rgb/rgba
              let m = c.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
              if (m) return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
              // hsl
              m = c.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
              if (m) {
                const h = (+m[1]) % 360, s = (+m[2])/100, l = (+m[3])/100;
                function h2rgb(p,q,t){ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; }
                let r,g,b; if (s === 0) { r=g=b=l; } else { const q = l < 0.5 ? l*(1+s) : l+s-l*s; const p = 2*l-q; r=h2rgb(p,q,(h/360)+1/3); g=h2rgb(p,q,(h/360)); b=h2rgb(p,q,(h/360)-1/3);} 
                return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
              }
              // hex #rgb or #rrggbb
              m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
              if (m){
                let x = m[1];
                if (x.length===3) x = x.split('').map(ch=>ch+ch).join('');
                const n = parseInt(x,16);
                return [(n>>16)&255, (n>>8)&255, n&255];
              }
              return [0,0,0];
            }

            // Compute relative luminance (WCAG) and set contrasting styles
            // Backwards-compatible wrapper to the global applyLabelContrast
            function applyContrast(el, bgColor){
              try { applyLabelContrast(el, bgColor); } catch(_) {}
            }

            function ensureDOM() {
              if (!viewport) {
                viewport = document.createElement('div');
                viewport.id = 'viewport';
                viewport.setAttribute('aria-hidden','true');
                stageWrap.appendChild(viewport);
              }
              if (!floor) {
                floor = document.createElement('canvas');
                floor.id = 'floor';
                viewport.appendChild(floor);
              }
              if (!overlay) {
                overlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
                overlay.id = 'overlay';
                viewport.appendChild(overlay);
              }
              if (!labels) {
                labels = document.createElement('div');
                labels.id = 'labels';
                viewport.appendChild(labels);
              }
              if (!tip) {
                tip = document.createElement('div');
                tip.id = 'labelTip';
                tip.setAttribute('role','tooltip');
                tip.setAttribute('aria-hidden','true');
                tip.style.position = 'absolute';
                tip.style.font = '600 12px/1.2 system-ui, -apple-system, Segoe UI,Roboto,Inter,Arial,sans-serif';
                tip.style.padding = '6px 8px';
                tip.style.borderRadius = '6px';
                tip.style.pointerEvents = 'none';
                tip.style.background = 'rgba(0,0,0,.8)';
                tip.style.color = '#fff';
                tip.style.display = 'none';
                viewport.appendChild(tip);
              }
            }

            function worldToScreen(x, y) {
              const v = vehicle();
              const rect = stageWrap.getBoundingClientRect();
              const sx = (rect.width || 1) / Math.max(1, v.inner_cm.L);
              const sy = (rect.height || 1) / Math.max(1, v.inner_cm.W);
              // stageWrap and #viewport share the same origin (absolute inset:0)
              return { x: x * sx, y: y * sy, sx, sy };
            }

            function ensureObserver(){
              if (!ro) {
                try {
                  ro = new ResizeObserver((entries) => {
                    for (const entry of entries) {
                      const el = entry.target;
                      const id = el.getAttribute('data-id');
                      if (!id) continue;
                      labelSizeCache.delete(id);
                      // Re-pick position just for this item
                      const it = (state.items || []).find(x => String(x.id) === String(id));
                      if (it) {
                        try { pickPosition(it); } catch(_) {}
                      }
                    }
                  });
                } catch (_) {
                  ro = null;
                }
              }
            }

            function measureLabel(el){
              ensureDOM();
              if (!el) return { w: 0, h: 0 };
              const id = el.getAttribute('data-id') || '';
              const cached = labelSizeCache.get(id);
              if (cached) return cached;
              // Temporarily ensure visibility for measurement
              const prev = el.style.visibility;
              el.style.visibility = prev || '' ? prev : 'hidden';
              const r = el.getBoundingClientRect();
              const res = { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
              labelSizeCache.set(id, res);
              try { ensureObserver(); ro && ro.observe(el); } catch(_){}
              if (!prev) el.style.visibility = '';
              return res;
            }

            function rectArea(a){ return Math.max(0, a.w) * Math.max(0, a.h); }
            function intersectArea(a,b){
              const x1 = Math.max(a.left, b.left);
              const y1 = Math.max(a.top, b.top);
              const x2 = Math.min(a.left + a.w, b.left + b.w);
              const y2 = Math.min(a.top + a.h, b.top + b.h);
              const w = x2 - x1; const h = y2 - y1;
              return (w > 0 && h > 0) ? (w * h) : 0;
            }

            function getOtherBoxesRects(excludeId){
              const v = vehicle();
              const scale = worldToScreen(0,0);
              const out = [];
              for (const it of (state.items || [])){
                if (!it || String(it.id) === String(excludeId)) continue;
                if (it.overflow) continue; // only inside cargo area for scoring
                const { l, w } = dims2D(it);
                const left = it.x * scale.sx;
                const top  = it.y * scale.sy;
                out.push({ left, top, w: Math.max(1, l * scale.sx), h: Math.max(1, w * scale.sy) });
              }
              return out;
            }

            function getPlacedLabelRects(excludeId){
              const out = [];
              for (const [id, r] of placed.entries()){
                if (String(id) === String(excludeId)) continue;
                out.push({ left: r.left, top: r.top, w: r.w, h: r.h });
              }
              return out;
            }

            // Pick best label anchor/rect (inside or outside) with scoring for overlaps and viewport overflow
            function pickLabelAnchor(item){
              ensureDOM();
              const { w, h } = measureLabel(buildLabel(item));
              const scale = worldToScreen(0,0);
              const d = dims2D(item);
              // Overflow items: place in top-left fallback to avoid offscreen
              if (item.overflow) {
                return { anchor: 'nw', rect: { left: 4, top: 4, w, h }, leader: null };
              }
              const left = (item.x||0) * scale.sx;
              const top  = (item.y||0) * scale.sy;
              const bw = Math.max(1, (d.l||0) * scale.sx);
              const bh = Math.max(1, (d.w||0) * scale.sy);
              const cx = left + bw/2, cy = top + bh/2;
              const pad = 2;
              const otherLabels = getPlacedLabelRects(item.id);
              const otherBoxes  = getOtherBoxesRects(item.id);
              const stage = stageWrap.getBoundingClientRect();
              const stageRect = { left: 0, top: 0, w: Math.max(1, stage.width|0), h: Math.max(1, stage.height|0) };
              function offscreenArea(r){
                const x1 = Math.max(stageRect.left, r.left);
                const y1 = Math.max(stageRect.top,  r.top);
                const x2 = Math.min(stageRect.left + stageRect.w, r.left + r.w);
                const y2 = Math.min(stageRect.top  + stageRect.h, r.top  + r.h);
                const interW = Math.max(0, x2 - x1), interH = Math.max(0, y2 - y1);
                const interA = interW * interH;
                const a = Math.max(0, r.w) * Math.max(0, r.h);
                return Math.max(0, a - interA);
              }
              // Build candidates
              const isPrint = document.documentElement.classList.contains('print');
              const mode = isPrint ? 'outside' : ((item.label && item.label.mode) || 'auto');
              const inside = [
                { a: 'center', x: left + (bw - w)/2, y: top + (bh - h)/2 },
                { a: 'nw',     x: left + pad,           y: top + pad },
                { a: 'ne',     x: left + bw - w - pad, y: top + pad },
                { a: 'sw',     x: left + pad,           y: top + bh - h - pad },
                { a: 'se',     x: left + bw - w - pad, y: top + bh - h - pad },
              ];
              const outPad = Math.max(6, pad + 4);
              const outside = [
                { a: 'e-out',  x: left + bw + outPad, y: cy - h/2, leader: { x1: Math.round(left + bw), y1: Math.round(cy), lx: 'left', side:'e' } },
                { a: 'w-out',  x: left - w - outPad,  y: cy - h/2, leader: { x1: Math.round(left),     y1: Math.round(cy), lx: 'right', side:'w' } },
              ];
              // Clamp outside Y into stage vertically
              outside.forEach(r => { r.y = Math.max(2, Math.min(stageRect.h - h - 2, r.y)); });
              let candidates = inside.concat(outside);
              if (mode === 'inside') candidates = inside;
              else if (mode === 'outside') candidates = outside;
              let best = { score: Infinity, anchor: 'center', rect: null, leader: null };
              for (const c of candidates){
                const rect = { left: Math.round(c.x), top: Math.round(c.y), w, h };
                // penalties
                let overlapL = 0; for (const r of otherLabels) overlapL += intersectArea(rect, r);
                let overlapB = 0; for (const r of otherBoxes)  overlapB += intersectArea(rect, r);
                const lcx = rect.left + rect.w/2, lcy = rect.top + rect.h/2;
                const dist2 = (lcx - cx)*(lcx - cx) + (lcy - cy)*(lcy - cy);
                const offA = offscreenArea(rect);
                // weights: labels >> boxes >> offscreen >> distance
                const score = overlapL * 12 + overlapB * 3 + offA * 20 + dist2 * 0.02 + (c.a.endsWith('-out') ? 6 : 0);
                if (score < best.score) {
                  let leader = null;
                  if (c.a === 'e-out') {
                    leader = { x1: Math.round(left + bw), y1: Math.round(cy), x2: Math.round(rect.left), y2: Math.round(rect.top + rect.h/2) };
                  } else if (c.a === 'w-out') {
                    leader = { x1: Math.round(left), y1: Math.round(cy), x2: Math.round(rect.left + rect.w), y2: Math.round(rect.top + rect.h/2) };
                  }
                  best = { score, anchor: c.a, rect, leader };
                }
              }
              return best;
            }

            function pickPosition(item){
              ensureDOM();
              const el = buildLabel(item);
              const res = pickLabelAnchor(item);
              // Apply placement
              el.style.left = res.rect.left + 'px';
              el.style.top  = res.rect.top  + 'px';
              placed.set(String(item.id), res.rect);
              try { item.label = item.label || {}; item.label.anchor = res.anchor; } catch(_) {}
              if (res.leader) {
                try {
                  const ln = document.createElementNS('http://www.w3.org/2000/svg','line');
                  ln.setAttribute('x1', res.leader.x1); ln.setAttribute('y1', res.leader.y1);
                  ln.setAttribute('x2', res.leader.x2); ln.setAttribute('y2', res.leader.y2);
                  ln.setAttribute('class','leaderline');
                  overlay.appendChild(ln);
                } catch(_) {}
              }
              return res.anchor;
            }

          function buildLabel(item) {
            ensureDOM();
            const id = String(item.id);
            let el = labels.querySelector(`.label[data-id="${CSS.escape(id)}"]`);
            if (!el) {
              el = document.createElement('div');
              el.className = 'label';
              el.dataset.id = id;
              labels.appendChild(el);
            }
            // Dimensions D×S×W: D/S from 2D oriented dims; W from height
            const d2 = dims2D(item);
            const D = d2.l ?? item.L ?? item.h ?? '—';
            const S = d2.w ?? item.W ?? item.w ?? '—';
            const W = item.H ?? item.height ?? '—';
            const kg = Math.max(0, item.weight || 0);
            const typ = item.type || '—';
            // Reset content and (re)build text + icons
            el.innerHTML = '';
            const body = document.createElement('span');
            body.className = 'body';
            body.setAttribute('tabindex', '0');
            body.setAttribute('aria-label', `${D}×${S}×${W}, ${kg} kg, ${typ}`);
            const top = document.createElement('span');
            top.className = 'lineA';
            top.textContent = `${D}×${S}×${W}`;
            const bot = document.createElement('span');
            bot.className = 'lineB';
            bot.textContent = `${kg} kg • ${typ}`;
            body.appendChild(top);
            body.appendChild(bot);
            el.appendChild(body);
            // Clear old icons, then append active ones
            el.querySelectorAll('svg.ico').forEach(n => n.remove());
            const flags = item.flags || {};
            function addIco(id){
              const sv = document.createElementNS('http://www.w3.org/2000/svg','svg');
              sv.setAttribute('class','ico');
              const use = document.createElementNS('http://www.w3.org/2000/svg','use');
              use.setAttribute('href', `#${id}`);
              sv.appendChild(use);
              el.appendChild(sv);
            }
            if (flags.noStack === true) addIco('i-nostack');
            if (flags.fragile === true) addIco('i-fragile');
            // Contrast vs the item background color
            try { applyLabelContrast(el, getItemColor(item)); } catch (_) {}
            // Hover/focus tooltip wiring (once per element)
            if (!body.dataset.tipwired) {
              const show = () => { try { openTooltip(id); } catch(_) {} };
              const hide = () => { try { closeTooltip(id); } catch(_) {} };
              body.addEventListener('mouseenter', show);
              body.addEventListener('mouseleave', hide);
              body.addEventListener('focus', show);
              body.addEventListener('blur', hide);
              body.dataset.tipwired = '1';
            }
            return el;
          }

            function layoutLabels() {
              ensureDOM();
              placed.clear();
              if (overlay) { try { overlay.innerHTML = ''; } catch(_){} }
              const ids = new Set();
              const items = (state.items || []).slice().filter(Boolean);
              // Larger boxes first
              items.sort((a,b) => {
                const da = dims2D(a), db = dims2D(b);
                return (db.l*db.w) - (da.l*da.w);
              });
              for (const it of items){
                ids.add(String(it.id));
                pickPosition(it);
              }
              // Remove labels for items that no longer exist
              Array.from(labels.querySelectorAll('.label')).forEach((n) => {
                if (!ids.has(n.getAttribute('data-id') || '')) n.remove();
              });
              // Highlight according to selection
              try { highlightSelected(); } catch(_) {}
            }

            function highlightSelected(){
              const sel = String(state.selectedId || '');
              Array.from(labels.querySelectorAll('.label')).forEach(el => {
                const id = el.getAttribute('data-id') || '';
                const isSel = id === sel;
                const isHot = id === (hotId || '');
                el.classList.toggle('is-selected', !!isSel);
                el.classList.toggle('is-hot', !!(isSel || isHot));
              });
            }

            function setHotId(id){
              hotId = String(id || '');
              // Toggle classes according to current hover and selection
              try { highlightSelected(); } catch(_) {}
            }

            function updateAll() {
              ensureDOM();
              try { layoutLabels(); } catch(_) {}
              viewport.style.display = 'block';
              viewport.setAttribute('aria-hidden', 'false');
              try { highlightSelected(); } catch(_) {}
              // Reapply hover state after relayout
              try { setHotId(hotId); } catch(_) {}
            }

            // Accessible tooltip API for tests and optional UI hooks
            function openTooltip(id){
              ensureDOM();
              const el = labels.querySelector(`.label[data-id="${CSS.escape(String(id))}"]`);
              if (!el) return false;
              const body = el.querySelector('.body');
              // Build richer content for tooltip: dims + weight + type + flags
              const it = (state.items || []).find(x => String(x.id) === String(id));
              let text = '';
              if (it) {
                const d2 = dims2D(it);
                const dims = `${d2.l ?? it.L ?? '—'}×${d2.w ?? it.W ?? '—'}×${it.H ?? '—'} cm`;
                const kg = `${Math.max(0, it.weight||0)} kg`;
                const typ = it.type || '—';
                const flags = it.flags || {};
                const icons = [ flags.noStack ? '⛔' : '', flags.fragile ? '🍷' : '' ].filter(Boolean).join(' ');
                text = `<div style="font-weight:700;margin-bottom:4px">${dims}</div>`+
                       `<div style="opacity:.95">${kg} • ${typ} ${icons?`<span style='margin-left:6px'>${icons}</span>`:''}</div>`;
              } else {
                text = body ? (body.textContent || '') : '';
              }
              el.setAttribute('aria-describedby','labelTip');
              tip.innerHTML = text;
              // position tooltip centered above the label
              const r = el.getBoundingClientRect();
              const vp = viewport.getBoundingClientRect();
              const x = Math.round(r.left - vp.left + r.width/2 - Math.min(240, Math.max(80, r.width)) / 2);
              const y = Math.max(2, Math.round(r.top - vp.top - 8 - 20));
              tip.style.left = x + 'px';
              tip.style.top  = y + 'px';
              tip.style.display = 'block';
              tip.setAttribute('aria-hidden','false');
              return true;
            }
            function closeTooltip(id){
              ensureDOM();
              const el = labels.querySelector(`.label[data-id="${CSS.escape(String(id))}"]`);
              if (el) el.removeAttribute('aria-describedby');
              if (tip){ tip.style.display = 'none'; tip.setAttribute('aria-hidden','true'); }
              return true;
            }

            // test helpers
            function test_applyContrast_on(color){
              const el = document.createElement('div');
              applyContrast(el, color);
              return { color: el.style.color, bg: el.style.background };
            }

            // public API
            return { buildLabel, layoutLabels, updateAll, worldToScreen, measureLabel, pickPosition, pickLabelAnchor, highlightSelected, openTooltip, closeTooltip, test_applyContrast_on, setHotId };
          })();

          // Expose globally for debugging if needed
          window.overlayLabels = overlayLabels;
          // Keep label highlight in sync with selection changes
          try { mount.addEventListener('selectionchange', () => { try { overlayLabels.highlightSelected(); } catch (_) {} try { threeUpdateGizmo(); } catch(_) {} }); } catch (_) {}
          window.addEventListener('resize', () => {
            try { overlayLabels.updateAll(); } catch (_) {}
            try { resizeVehSelectToContent(); } catch(_) {}
            try { fitCanvasToVehicleWidth(false); } catch(_) {}
          });
          function within(it, veh) {
            const { l, w } = dims2D(it);
            return (
              it.x >= 0 &&
              it.y >= 0 &&
              it.x + l <= veh.inner_cm.L &&
              it.y + w <= veh.inner_cm.W
            );
          }
          function overlap(a, b) {
            const A = dims2D(a),
              B = dims2D(b);
            return (
              a.x < b.x + B.l &&
              a.x + A.l > b.x &&
              a.y < b.y + B.w &&
              a.y + A.w > b.y
            );
          }
          function anyCollision(it, exceptId) {
            return state.items.some((x) => x.id !== exceptId && overlap(it, x));
          }
          function snap(v) {
            const g = vehicle().grid_cm;
            return Math.round(v / g) * g;
          }
          function meters(cm) {
            return cm / 100;
          }
          function ldmOf(it, veh) {
            const { l, w } = dims2D(it);
            return (
              meters(l) * (meters(w) / meters(veh.inner_cm.W)) * it.stackCount
            );
          }

          // Generate a distinct color for each item based on its position in the list and stack count.
          // This helps visually differentiate different cargo pieces and hints at stacking (lighter colors for higher stacks).
          function getItemColor(it) {
            // Stable color based on dimensions only (same D/S/W -> same color)
            const L = Math.max(it.L, it.W) | 0;
            const W = Math.min(it.L, it.W) | 0;
            const H = (it.H | 0) || 0;
            const key = `${L}x${W}x${H}`;
            let hash = 0;
            for (let i = 0; i < key.length; i++) {
              hash = (hash * 131 + key.charCodeAt(i)) % 360;
            }
            const hue = (hash + 360) % 360;
            const sat = 62;
            const light = mount.getAttribute("data-theme") === "dark" ? 40 : 45;
            return `hsl(${hue}, ${sat}%, ${light}%)`;
          }

          function pushHistory() {
            state.history.push(
              deepClone({
                items: state.items,
                vehicleIndex: state.vehicleIndex,
              })
            );
            if (state.history.length > 50) state.history.shift();
            state.future.length = 0;
          }
          function undo() {
            const last = state.history.pop();
            if (!last) return;
            state.future.push(
              deepClone({
                items: state.items,
                vehicleIndex: state.vehicleIndex,
              })
            );
            state.items = deepClone(last.items);
            state.vehicleIndex = last.vehicleIndex;
            state.selectedId = null;
            renderAll();
          }
          function redo() {
            const next = state.future.pop();
            if (!next) return;
            pushHistory();
            state.items = deepClone(next.items);
            state.vehicleIndex = next.vehicleIndex;
            state.selectedId = null;
            renderAll();
          }

          function saveLocal() {
            localStorage.setItem(
              "vanpack_state",
              JSON.stringify({
                v: state.vehicleIndex,
                items: state.items,
                lang,
              })
            );
            alert(t('saved_to_browser'));
          }
          function loadLocal() {
            try {
              const s = JSON.parse(localStorage.getItem("vanpack_state"));
              if (s) {
                state.vehicleIndex = s.v || 0;
                state.items = s.items || [];
                lang = s.lang || lang;
                // Theme follows system preference; ignore saved theme
              }
            } catch {}
          }
          function shareLink() {
            const data = btoa(
              unescape(
                encodeURIComponent(
                  JSON.stringify({
                    v: state.vehicleIndex,
                    items: state.items,
                    lang,
                    theme: mount.getAttribute("data-theme"),
                  })
                )
              )
            );
            const url = location.origin + location.pathname + "#vp=" + data;
            navigator.clipboard?.writeText(url);
            alert(t('link_copied'));
          }
          function loadFromHash() {
            const m = location.hash.match(/#vp=([^&]+)/);
            if (!m) return false;
            try {
              const obj = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
              state.vehicleIndex = obj.v || 0;
              state.items = obj.items || [];
              lang = obj.lang || lang;
              // Theme follows system preference; ignore saved theme
              return true;
            } catch {
              return false;
            }
          }
          function toSvgPoint(evt) {
            const pt = board.createSVGPoint();
            pt.x = evt.clientX;
            pt.y = evt.clientY;
            const sp = pt.matrixTransform(board.getScreenCTM().inverse());
            return { x: sp.x, y: sp.y };
          }
          function showError(msg) {
            errBox.textContent = msg;
            errBox.setAttribute("aria-hidden", "false");
            setTimeout(() => errBox.setAttribute("aria-hidden", "true"), 4000);
          }
