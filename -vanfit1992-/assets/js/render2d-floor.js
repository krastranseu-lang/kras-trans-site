          // ===================== World<->Screen + Render Pipeline (floor canvas) =====================
          // Base configuration: 4 px per cm, zoom in [0.3, 6], pan in CSS px
          const VIEW = {
            basePxPerCm: 4,
            zoom: 1,
            minZoom: 0.3,
            maxZoom: 6,
            pan: { x: 0, y: 0 },
          };
          // Track whether user changed view (so we don't override on resize)
          let VIEW_TOUCHED = false;
          const vpFloor = () => mount.querySelector('#floor');

          function getPxPerCm() {
            return Math.max(0.0001, VIEW.basePxPerCm * VIEW.zoom);
          }
          // World (cm) to screen (CSS px)
          function worldToScreen(pt) {
            const s = getPxPerCm();
            return { sx: VIEW.pan.x + (pt.x || 0) * s, sy: VIEW.pan.y + (pt.y || 0) * s };
          }
          // Screen (CSS px) to world (cm)
          function screenToWorld(pt) {
            const s = getPxPerCm();
            return { x: ((pt.sx || 0) - VIEW.pan.x) / s, y: ((pt.sy || 0) - VIEW.pan.y) / s };
          }
          function resizeCanvasIfNeeded(dpr) {
            const cv = vpFloor();
            if (!cv) return { w: 0, h: 0 };
            const rect = cv.getBoundingClientRect();
            const needW = Math.max(1, Math.round(rect.width * dpr));
            const needH = Math.max(1, Math.round(rect.height * dpr));
            if (cv.width !== needW || cv.height !== needH) {
              cv.width = needW;
              cv.height = needH;
            }
            return { w: rect.width, h: rect.height };
          }
          function setWorldTransform(ctx, pxPerCm, pan) {
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.translate(pan.x, pan.y);
            ctx.scale(pxPerCm, pxPerCm);
          }
          // Placeholder drawing stages
          function computeGridSteps(pxPerCm) {
            if (pxPerCm >= 12) return { minor: 1, major: 10 };
            if (pxPerCm >= 6) return { minor: 2, major: 10 };
            return { minor: 5, major: 10 };
          }
          function drawGrid(ctx, veh2d, steps) {
            if (!steps) return;
            ctx.save();
            const s = getPxPerCm();
            const cv = vpFloor();
            const rect = cv ? cv.getBoundingClientRect() : { width: 0, height: 0 };
            // Visible world rect in cm (account for pan and zoom)
            const viewL = Math.max(0.0001, rect.width / Math.max(0.0001, s));
            const viewW = Math.max(0.0001, rect.height / Math.max(0.0001, s));
            const left = -VIEW.pan.x / Math.max(0.0001, s);
            const top  = -VIEW.pan.y / Math.max(0.0001, s);
            const step = Math.max(1, steps.minor);
            const major = Math.max(step, steps.major);
            const lw = 1 / Math.max(0.0001, s);
            const css = getComputedStyle(document.documentElement);
            const colMinor = (css.getPropertyValue('--gridMinor') || 'rgba(0,0,0,.08)').trim();
            const colMajor = (css.getPropertyValue('--gridMajor') || 'rgba(0,0,0,.16)').trim();
            const endX = left + viewL;
            const endY = top + viewW;
            // minor lines covering the whole visible canvas area
            ctx.strokeStyle = colMinor;
            ctx.lineWidth = lw;
            let startX = Math.floor(left / step) * step;
            for (let x = startX; x <= endX; x += step) {
              ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, endY); ctx.stroke();
            }
            let startY = Math.floor(top / step) * step;
            for (let y = startY; y <= endY; y += step) {
              ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(endX, y); ctx.stroke();
            }
            // major lines
            ctx.strokeStyle = colMajor;
            ctx.lineWidth = Math.max(lw, 1.5 * lw);
            const kx = Math.max(1, Math.round(major / step));
            startX = Math.floor(left / major) * major;
            for (let x = startX; x <= endX; x += major) {
              ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, endY); ctx.stroke();
            }
            const ky = kx;
            startY = Math.floor(top / major) * major;
            for (let y = startY; y <= endY; y += major) {
              ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(endX, y); ctx.stroke();
            }
            ctx.restore();
          }
          function drawVehicleRect(ctx, veh2d) {
            if (!veh2d) return;
            ctx.save();
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#FF7A00';
            ctx.lineWidth = 2 / getPxPerCm();
            const L = Math.max(0, Number((veh2d && (veh2d.L ?? veh2d.W)) || 0));
            const W = Math.max(0, Number((veh2d && (veh2d.W ?? veh2d.H)) || 0));
            ctx.strokeRect(0, 0, L, W);
            ctx.restore();
          }
          function dims2D2(it){
            const r = (Number(it.rot)||0) % 2 !== 0;
            const w = Math.max(0, Number(it.w)||0);
            const h = Math.max(0, Number(it.h)||0);
            return r ? { w: h, h: w } : { w, h };
          }
          function drawItems(ctx, items) {
            ctx.save();
            ctx.lineWidth = 1.5 / getPxPerCm();
            ctx.strokeStyle = 'rgba(0,0,0,.35)';
            for (const it of (items || [])) {
              const d = dims2D2(it);
              const x = Math.max(0, Number(it.x)||0);
              const y = Math.max(0, Number(it.y)||0);
              const isSel = String(VP2D.selectedId||'') === String(it.id||'');
              ctx.fillStyle = 'rgba(127,160,255,0.18)';
              ctx.strokeStyle = isSel ? (getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#FF7A00') : 'rgba(90,120,200,0.9)';
              ctx.lineWidth = isSel ? (3.0 / getPxPerCm()) : (1.5 / getPxPerCm());
              ctx.fillRect(x, y, d.w, d.h);
              ctx.strokeRect(x, y, d.w, d.h);
            }
            ctx.restore();
          }
          function hitTest(sx, sy){
            const p = screenToWorld({ sx, sy });
            for (let i = VP2D.items.length - 1; i >= 0; i--) {
              const it = VP2D.items[i];
              const d = dims2D2(it);
              const x = Number(it.x)||0, y = Number(it.y)||0;
              if (p.x >= x && p.x <= x + d.w && p.y >= y && p.y <= y + d.h) {
                return it;
              }
            }
            return null;
          }
          function layoutLabels2D(){
            const labels = mount.querySelector('#labels');
            const svg = mount.querySelector('#overlay');
            if (!labels || !svg) return;
            // Keep labels container visible
            const ids = new Set();
            for (const it of VP2D.items){
              const id = String(it.id||'');
              ids.add(id);
              let el = labels.querySelector(`.label[data-id="${CSS.escape(id)}"]`);
              const d = dims2D2(it);
              const text = `${Math.round(d.w)}×${Math.round(d.h)} cm, ${it.type||'—'}`;
              if (!el){
                el = document.createElement('div');
                el.className = 'label';
                el.dataset.id = id;
                labels.appendChild(el);
              }
              el.textContent = text;
              // Apply contrast based on item color
              try { applyLabelContrast(el, getItemColor(it)); } catch(_) {}
              // center label on item center via translate(-50%,-50%)
              const c = worldToScreen({ x: (Number(it.x)||0) + d.w/2, y: (Number(it.y)||0) + d.h/2 });
              el.style.left = `${Math.round(c.sx)}px`;
              el.style.top  = `${Math.round(c.sy)}px`;
              el.style.transform = 'translate(-50%, -50%)';
              const isSel = String(VP2D.selectedId||'') === id;
              el.classList.toggle('is-selected', !!isSel);
            }
            // remove stale
            Array.from(labels.querySelectorAll('.label')).forEach(n => {
              const id = n.getAttribute('data-id')||'';
              if (!ids.has(id)) n.remove();
            });
          }
          // Simple 2D state model for canvas mode
          const VP2D = {
            vehicle: { W: 178, H: 370 },
            items: [],
            selectedId: null,
            view: { zoom: 1, pan: { x: 0, y: 0 } },
          };
          const LS2D_KEY = 'vanfit:2d:v1';
          function saveState2D(){
            try {
              VP2D.view.zoom = VIEW.zoom;
              VP2D.view.pan = { x: VIEW.pan.x, y: VIEW.pan.y };
              localStorage.setItem(LS2D_KEY, JSON.stringify(VP2D));
            } catch(_){}
          }
          function loadState2D(){
            try {
              const raw = localStorage.getItem(LS2D_KEY);
              if (!raw) return false;
              const obj = JSON.parse(raw);
              if (obj && typeof obj === 'object') {
                if (obj.vehicle && typeof obj.vehicle.W === 'number' && typeof obj.vehicle.H === 'number') VP2D.vehicle = { W: obj.vehicle.W, H: obj.vehicle.H };
                if (Array.isArray(obj.items)) VP2D.items = obj.items.filter(Boolean).map(it=>({ id: String(it.id||uid()), x:+it.x||0, y:+it.y||0, w:+it.w||0, h:+it.h||0, rot:+it.rot||0, type: it.type||'paleta', weight: +it.weight||0 }));
                VP2D.selectedId = obj.selectedId ?? null;
                if (obj.view && typeof obj.view.zoom === 'number' && obj.view.pan) {
                  VP2D.view = { zoom: obj.view.zoom, pan: { x: +obj.view.pan.x||0, y: +obj.view.pan.y||0 } };
                  VIEW.zoom = Math.max(VIEW.minZoom, Math.min(VIEW.maxZoom, VP2D.view.zoom));
                  VIEW.pan = { x: VP2D.view.pan.x, y: VP2D.view.pan.y };
                }
                return true;
              }
            } catch(_){}
            return false;
          }
          function updateStatus(){
            const el = mount.querySelector('#status');
            if (!el) return;
            const pct = Math.round((VIEW.zoom||1) * 100);
            el.textContent = `${t('zoom')} ${pct}% • ${VP2D.items.length}`;
          }
          function isGridOn() {
            const cb = mount.querySelector('#gridToggle');
            return cb ? !!cb.checked : true;
          }
          function updateRulers() {
            const svg = mount.querySelector('#overlay');
            if (!svg) return;
            if (!isGridOn()) { svg.querySelector('#rulerX')?.remove(); svg.querySelector('#rulerY')?.remove(); return; }
            let gx = svg.querySelector('#rulerX');
            let gy = svg.querySelector('#rulerY');
            if (!gx) { gx = document.createElementNS('http://www.w3.org/2000/svg','g'); gx.setAttribute('id','rulerX'); svg.insertBefore(gx, svg.firstChild); }
            if (!gy) { gy = document.createElementNS('http://www.w3.org/2000/svg','g'); gy.setAttribute('id','rulerY'); svg.insertBefore(gy, svg.firstChild); }
            const w = Math.max(1, svg.clientWidth || 0);
            const h = Math.max(1, svg.clientHeight || 0);
            const band = 28;
            const theme = mount.getAttribute('data-theme') || 'dark';
            const fill = theme !== 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.25)';
            gx.innerHTML = '';
            gy.innerHTML = '';
            const rx = document.createElementNS('http://www.w3.org/2000/svg','rect');
            rx.setAttribute('x','0'); rx.setAttribute('y','0'); rx.setAttribute('width', String(w)); rx.setAttribute('height', String(band)); rx.setAttribute('fill', fill);
            gx.appendChild(rx);
            const ry = document.createElementNS('http://www.w3.org/2000/svg','rect');
            ry.setAttribute('x','0'); ry.setAttribute('y','0'); ry.setAttribute('width', String(band)); ry.setAttribute('height', String(h)); ry.setAttribute('fill', fill);
            gy.appendChild(ry);

            // Draw ticks and labels using world->screen scale
            try {
              const v = vehicle();
              const sc0 = overlayLabels.worldToScreen(0,0);
              const sc1 = overlayLabels.worldToScreen(1,0);
              const pxPerCmX = Math.max(0.0001, (sc1.x - sc0.x));
              const pxPerCmY = Math.max(0.0001, (overlayLabels.worldToScreen(0,1).y - sc0.y));
              // Minor step based on zoom; labels every 10 cm
              let minor = 1;
              if (pxPerCmX < 2.5) minor = 10; else if (pxPerCmX < 5) minor = 5; else if (pxPerCmX < 10) minor = 2;
              const major = 10; // label step (cm)

              // X ruler (top): vertical ticks
              for (let cm = 0; cm <= v.inner_cm.L; cm += minor) {
                const p = overlayLabels.worldToScreen(cm, 0);
                const x = Math.round(p.x);
                const isMajor = (cm % major) === 0;
                const len = isMajor ? band - 6 : Math.max(6, Math.floor(band * 0.45));
                const t = document.createElementNS('http://www.w3.org/2000/svg','line');
                t.setAttribute('x1', String(x)); t.setAttribute('y1', '0');
                t.setAttribute('x2', String(x)); t.setAttribute('y2', String(len));
                t.setAttribute('class','rulerTick');
                gx.appendChild(t);
                if (isMajor) {
                  const tx = document.createElementNS('http://www.w3.org/2000/svg','text');
                  tx.setAttribute('x', String(x + 2)); tx.setAttribute('y', String(band - 6));
                  tx.setAttribute('class','rulerText');
                  tx.textContent = String(cm);
                  gx.appendChild(tx);
                }
              }

              // Y ruler (left): horizontal ticks
              for (let cm = 0; cm <= v.inner_cm.W; cm += minor) {
                const p = overlayLabels.worldToScreen(0, cm);
                const y = Math.round(p.y);
                const isMajor = (cm % major) === 0;
                const len = isMajor ? band - 6 : Math.max(6, Math.floor(band * 0.45));
                const t = document.createElementNS('http://www.w3.org/2000/svg','line');
                t.setAttribute('x1', '0'); t.setAttribute('y1', String(y));
                t.setAttribute('x2', String(len)); t.setAttribute('y2', String(y));
                t.setAttribute('class','rulerTick');
                gy.appendChild(t);
                if (isMajor) {
                  const ty = document.createElementNS('http://www.w3.org/2000/svg','text');
                  ty.setAttribute('x', String(6)); ty.setAttribute('y', String(y + 3));
                  ty.setAttribute('class','rulerText');
                  ty.textContent = String(cm);
                  gy.appendChild(ty);
                }
              }
            } catch(_) {}
          }
          function render() {
            const cv = vpFloor();
            if (!cv) return;
            const ctx = cv.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rect = resizeCanvasIfNeeded(dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, rect.w, rect.h);
            const pxPerCm = getPxPerCm();
            setWorldTransform(ctx, pxPerCm, VIEW.pan);
            const steps = computeGridSteps(pxPerCm);
            // Use current vehicle dimensions (L×W) for the canvas grid/rect
            const vsel = vehicle();
            const dims2d = vsel ? { L: vsel.inner_cm.L, W: vsel.inner_cm.W } : VP2D.vehicle;
            if (isGridOn()) drawGrid(ctx, dims2d, steps);
            drawVehicleRect(ctx, dims2d);
            drawItems(ctx, VP2D.items);
            // Ensure overlay viewport is visible for labels/rulers
            try { const vp = mount.querySelector('#viewport'); if (vp) { vp.style.display='block'; vp.setAttribute('aria-hidden','false'); } } catch(_){ }
            updateRulers();
            layoutLabels2D();
            updateStatus();
          }

          // Fit canvas grid to the full cargo width (initial position)
          function fitCanvasToVehicleWidth(force = false){
            try {
              if (!force && VIEW_TOUCHED) return; // don't override user's view
              const cv = vpFloor(); if (!cv) return;
              const rect = cv.getBoundingClientRect();
              const v = vehicle();
              const desiredPxPerCm = Math.max(0.0001, rect.width / Math.max(1, v.inner_cm.L));
              const newZoom = desiredPxPerCm / Math.max(0.0001, VIEW.basePxPerCm);
              VIEW.zoom = Math.max(VIEW.minZoom, Math.min(VIEW.maxZoom, newZoom));
              // Align world origin to top-left of canvas
              VIEW.pan.x = 0;
              VIEW.pan.y = 0;
              VP2D.view.zoom = VIEW.zoom;
              VP2D.view.pan = { x: VIEW.pan.x, y: VIEW.pan.y };
              render();
              try { updateRulers(); } catch(_) {}
              try { layoutLabels2D(); } catch(_) {}
              try { overlayLabels.updateAll(); } catch(_) {}
            } catch(_) {}
          }
