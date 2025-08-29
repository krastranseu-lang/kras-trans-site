          // ===================== DRAG / KEYBOARD + DOCKING =====================
          let drag = null; // {id, offXcm, offYcm, pre:{x,y}}
          const DOCK = 5; // cm

          // Grid snap to nearest minor grid (in world cm)
          function computeSnapGrid(x, y, minor) {
            const g = Math.max(1, Number(minor) || 5);
            return {
              x: Math.round(x / g) * g,
              y: Math.round(y / g) * g,
            };
          }

          // Wall snap: if close to any cargo wall within threshold (fraction of grid step)
          function computeSnapWalls(x, y, w, h, veh, th = 0.6) {
            const L = Math.max(0, veh?.inner_cm?.L || 0);
            const W = Math.max(0, veh?.inner_cm?.W || 0);
            const g = Math.max(1, veh?.grid_cm || 5);
            const d = Math.max(1, g * (Number(th) || 0.6));
            let nx = x, ny = y;
            let snapped = false;
            // Clamp into bounds first to avoid drifting beyond edges
            nx = Math.max(0, Math.min(L - w, nx));
            ny = Math.max(0, Math.min(W - h, ny));
            // Snap to left/right
            if (Math.abs(nx - 0) <= d) { nx = 0; snapped = true; }
            if (Math.abs(nx + w - L) <= d) { nx = L - w; snapped = true; }
            // Snap to top/bottom
            if (Math.abs(ny - 0) <= d) { ny = 0; snapped = true; }
            if (Math.abs(ny + h - W) <= d) { ny = W - h; snapped = true; }
            return { x: nx, y: ny, snapped };
          }

          // Edge snap to neighbor items. Returns first eligible (closest) edge within threshold.
          function computeSnapEdges(x, y, l, w, items, selfId, veh, th = 0.6) {
            const g = Math.max(1, veh?.grid_cm || 5);
            const thCm = Math.max(1, g * (Number(th) || 0.6));
            let best = { axis: null, delta: Infinity, nx: x, ny: y };
            for (const other of (items || [])) {
              if (!other || String(other.id) === String(selfId)) continue;
              const od = dims2D(other);
              const ox = Number(other.x) || 0;
              const oy = Number(other.y) || 0;
              const ol = Number(od.l) || 0;
              const ow = Number(od.w) || 0;

              // Horizontal snapping (align X) if vertical ranges overlap
              const vOverlap = !(y + w <= oy || y >= oy + ow);
              if (vOverlap) {
                // to other's right edge
                const candX1 = ox + ol; // x = other.right
                const dx1 = Math.abs(x - candX1);
                if (dx1 <= thCm && dx1 < best.delta) {
                  best = { axis: 'x', delta: dx1, nx: candX1, ny: y };
                }
                // to other's left edge (x + l = ox)
                const candX2 = ox - l; // x = other.left - self.width
                const dx2 = Math.abs(x - candX2);
                if (dx2 <= thCm && dx2 < best.delta) {
                  best = { axis: 'x', delta: dx2, nx: candX2, ny: y };
                }
              }

              // Vertical snapping (align Y) if horizontal ranges overlap
              const hOverlap = !(x + l <= ox || x >= ox + ol);
              if (hOverlap) {
                // to other's bottom edge
                const candY1 = oy + ow; // y = other.bottom
                const dy1 = Math.abs(y - candY1);
                if (dy1 <= thCm && dy1 < best.delta) {
                  best = { axis: 'y', delta: dy1, nx: x, ny: candY1 };
                }
                // to other's top edge (y + w = oy)
                const candY2 = oy - w; // y = other.top - self.height
                const dy2 = Math.abs(y - candY2);
                if (dy2 <= thCm && dy2 < best.delta) {
                  best = { axis: 'y', delta: dy2, nx: x, ny: candY2 };
                }
              }
            }
            if (best.axis) return { x: best.nx, y: best.ny, snapped: true };
            return { x, y, snapped: false };
          }

          // Generic rectangle intersection and bounds helpers (world cm)
          function intersects(a, b) {
            return !(a.x >= b.x + b.l || a.x + a.l <= b.x || a.y >= b.y + b.w || a.y + a.w <= b.y);
          }
          function outOfBounds(a, veh) {
            const L = veh?.inner_cm?.L || 0;
            const W = veh?.inner_cm?.W || 0;
            return a.x < 0 || a.y < 0 || a.x + a.l > L || a.y + a.w > W;
          }

          // Ephemeral collision flash in overlay with small sinusoidal bump
          // Disable by default (unwanted red preview rectangle while dragging into collisions)
          const COLLISION_FLASH_ON = false;
          let COLLISION = null; // {rect:{x,y,l,w}, dir:{x,y}, start, dur, amp}
          let collisionRAF = null;
          function triggerCollisionFlash(rect, dir) {
            if (!COLLISION_FLASH_ON) return; // feature turned off
            try { cancelAnimationFrame(collisionRAF); } catch(_) {}
            const now = (performance && performance.now) ? performance.now() : Date.now();
            COLLISION = { rect: { ...rect }, dir: { x: dir.x || 0, y: dir.y || 0 }, start: now, dur: 150, amp: 8 };
            renderCollisionsOverlay();
          }
          function renderCollisionsOverlay() {
            if (!COLLISION_FLASH_ON) return; // safety guard
            const overlayEl = mount.querySelector('#overlay');
            if (!overlayEl) return;
            // Cleanup previous group
            let g = overlayEl.querySelector('#gCollisionFlash');
            if (!COLLISION) { if (g) g.remove(); return; }
            const now = (performance && performance.now) ? performance.now() : Date.now();
            const t = Math.max(0, Math.min(1, (now - COLLISION.start) / (COLLISION.dur || 150)));
            const alpha = 0.9 * (1 - t);
            const ease = Math.sin(Math.PI * t);
            // World->screen scale via overlayLabels helper (fallback to 1)
            let sx = 1, sy = 1;
            try { const sc = overlayLabels.worldToScreen(0,0); sx = sc.sx || 1; sy = sc.sy || 1; } catch(_) {}
            const px = COLLISION.rect.x * sx;
            const py = COLLISION.rect.y * sy;
            const pw = Math.max(1, COLLISION.rect.l * sx);
            const ph = Math.max(1, COLLISION.rect.w * sy);
            // Direction in px normalized
            let dx = COLLISION.dir.x * sx;
            let dy = COLLISION.dir.y * sy;
            const len = Math.hypot(dx, dy) || 1;
            dx = (dx / len) * (COLLISION.amp || 8) * ease;
            dy = (dy / len) * (COLLISION.amp || 8) * ease;
            if (!g) {
              g = document.createElementNS('http://www.w3.org/2000/svg','g');
              g.setAttribute('id','gCollisionFlash');
              overlayEl.appendChild(g);
            } else {
              while (g.firstChild) g.removeChild(g.firstChild);
            }
            const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
            r.setAttribute('x', String(Math.round(px)));
            r.setAttribute('y', String(Math.round(py)));
            r.setAttribute('width', String(Math.round(pw)));
            r.setAttribute('height', String(Math.round(ph)));
            r.setAttribute('fill', 'none');
            r.setAttribute('stroke', '#ff4d4f');
            r.setAttribute('stroke-width', '2');
            r.setAttribute('opacity', String(alpha.toFixed(3)));
            r.setAttribute('pointer-events', 'none');
            r.setAttribute('transform', `translate(${dx.toFixed(2)}, ${dy.toFixed(2)})`);
            g.appendChild(r);

            if (t >= 1) {
              // Finish
              COLLISION = null;
              // Let the next frame clean the group
              collisionRAF = requestAnimationFrame(() => {
                try { const gg = overlayEl.querySelector('#gCollisionFlash'); gg && gg.remove(); } catch(_) {}
              });
            } else {
              collisionRAF = requestAnimationFrame(renderCollisionsOverlay);
            }
          }

          function bindItemEvents() {
          board.querySelectorAll("[data-rot]").forEach((c) => {
            c.addEventListener("pointerdown", (e) => {
              e.stopPropagation();
              const id = c.getAttribute("data-rot");
              state.selectedId = id;
              try { dispatchSelectionChange(); } catch (_) {}
              rotateSelected(+1);
            });
            // Hover: highlight matching overlay label
            c.addEventListener('mouseenter', () => {
              const id = c.getAttribute('data-rot');
              try { overlayLabels.setHotId(id); } catch(_) {}
            });
            c.addEventListener('mouseleave', () => {
              try { overlayLabels.setHotId(null); } catch(_) {}
            });
          });

            board.querySelectorAll("rect.item, rect.dragHit").forEach((r) => {
              r.addEventListener("pointerdown", (e) => {
                const id = r.getAttribute("data-id");
                state.selectedId = id;
                renderItems();
                try { dispatchSelectionChange(); } catch (_) {}
                const it = state.items.find((x) => x.id === id);
                const p = toSvgPoint(e);
                drag = {
                  id,
                  offXcm: p.x - it.x,
                  offYcm: p.y - it.y,
                  pre: { x: it.x, y: it.y },
                };
                try { r.setPointerCapture(e.pointerId); } catch(_) {}
                mount.classList.add("dragging");
              });
              r.addEventListener("keydown", (e) => {
                const step = vehicle().grid_cm;
                const it = state.items.find(
                  (x) => x.id === r.getAttribute("data-id")
                );
                if (!it) return;
                if (
                  [
                    "ArrowUp",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowRight",
                    "Delete",
                    "Backspace",
                    "r",
                    "R",
                    "+",
                    "-",
                  ].includes(e.key)
                ) {
                  e.preventDefault();
                }
                if (e.key === "ArrowLeft") {
                  pushHistory();
                  it.x = Math.max(0, it.x - step);
                }
                if (e.key === "ArrowRight") {
                  pushHistory();
                  const { l } = dims2D(it);
                  it.x = Math.min(vehicle().inner_cm.L - l, it.x + step);
                }
                if (e.key === "ArrowUp") {
                  pushHistory();
                  it.y = Math.max(0, it.y - step);
                }
                if (e.key === "ArrowDown") {
                  pushHistory();
                  const { w } = dims2D(it);
                  it.y = Math.min(vehicle().inner_cm.W - w, it.y + step);
                }
                if (e.key === "Delete" || e.key === "Backspace") {
                  deleteSelected();
                }
                if (e.key === "r" || e.key === "R") {
                  rotateSelected(+1);
                }
                if (e.key === "+") {
                  changeStack(+1);
                }
                if (e.key === "-") {
                  changeStack(-1);
                }
                renderAll();
              });
              // Hover: show-only this label
              r.addEventListener('mouseenter', () => {
                const id = r.getAttribute('data-id');
                try { overlayLabels.setHotId(id); } catch(_) {}
              });
              r.addEventListener('mouseleave', () => {
                try { overlayLabels.setHotId(null); } catch(_) {}
              });
            });
            // Clear hover when leaving the board
            try {
              board.addEventListener('mouseleave', () => {
                try { overlayLabels.setHotId(null); } catch(_) {}
              });
            } catch(_) {}
          }

          // Keyboard controls on #viewport: arrows move ±1cm (Shift=±5cm), R toggles 0/90 with collision guard,
          // Delete removes, Esc cancels drag/pan/selection
          function installViewportKeys(){
            const vp = mount.querySelector('#viewport');
            if (!vp) return;
            vp.addEventListener('keydown', (e) => {
              const key = e.key;
              const it = state.items.find(x => x.id === state.selectedId);
              // Helpers
              function tryMove(dx, dy){
                if (!it) return;
                const v = vehicle();
                const d = dims2D(it);
                const nx = Math.max(0, Math.min(v.inner_cm.L - d.l, it.x + dx));
                const ny = Math.max(0, Math.min(v.inner_cm.W - d.w, it.y + dy));
                const cand = { x: nx, y: ny, l: d.l, w: d.w };
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
                  try { triggerCollisionFlash(cand, { x: dx, y: dy }); } catch(_) {}
                } else {
                  pushHistory();
                  it.x = nx; it.y = ny;
                  renderAll();
                  dispatchSelectionChange();
                }
              }

              // Movement
              if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
                e.preventDefault();
                const step = e.shiftKey ? 5 : 1; // cm
                let dx = 0, dy = 0;
                if (key === 'ArrowLeft') dx = -step;
                if (key === 'ArrowRight') dx = +step;
                if (key === 'ArrowUp') dy = -step;
                if (key === 'ArrowDown') dy = +step;
                tryMove(dx, dy);
                return;
              }

              // Rotate 0<->90
              if (key === 'r' || key === 'R') {
                e.preventDefault();
                rotateSelectedStrict();
                return;
              }

              // Delete selected
              if (key === 'Delete' || key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
                return;
              }

              // Escape: cancel drag, pan, selection
              if (key === 'Escape') {
                e.preventDefault();
                try {
                  if (drag) {
                    const it2 = state.items.find(x => x.id === drag.id);
                    if (it2 && drag.pre) { it2.x = drag.pre.x; it2.y = drag.pre.y; }
                    drag = null; mount.classList.remove('dragging');
                  }
                } catch(_) {}
                try { document.dispatchEvent(new CustomEvent('vp-cancel-pan')); } catch(_) {}
                state.selectedId = null; renderAll(); dispatchSelectionChange();
                return;
              }
            });
          }

          // Click on section rectangles to select item
          section?.addEventListener("pointerdown", (e) => {
            const t = e.target;
            if (t && t.getAttribute && t.hasAttribute("data-id")) {
              state.selectedId = t.getAttribute("data-id");
              renderAll();
              dispatchSelectionChange();
            }
          });
          // Section hover: mirror hot label to corresponding item
          section?.addEventListener('pointermove', (e) => {
            const t = e.target;
            if (t && t.getAttribute && t.hasAttribute('data-id')) {
              try { overlayLabels.setHotId(t.getAttribute('data-id')); } catch(_) {}
            } else {
              try { overlayLabels.setHotId(null); } catch(_) {}
            }
          });
          section?.addEventListener('pointerleave', () => { try { overlayLabels.setHotId(null); } catch(_) {} });

          board.addEventListener("pointermove", (e) => {
            if (!drag) return;
            const id = state.selectedId;
            const it = state.items.find((x) => x.id === id);
            if (!it) return;
            const v = vehicle();
            const p = toSvgPoint(e);
            // Candidate position in world cm
            let nx = (p.x - drag.offXcm);
            let ny = (p.y - drag.offYcm);
            const { l, w } = dims2D(it);
            // 1) Snap to grid
            const gsn = computeSnapGrid(nx, ny, v.grid_cm);
            nx = gsn.x; ny = gsn.y;
            // 2) Snap to walls (after grid)
            const wsn = computeSnapWalls(nx, ny, l, w, v, 0.6);
            nx = wsn.x; ny = wsn.y;
            // 3) Snap to neighbor edges (only if walls didn’t snap)
            if (!wsn.snapped) {
              const esn = computeSnapEdges(nx, ny, l, w, state.items, id, v, 0.6);
              if (esn.snapped) { nx = esn.x; ny = esn.y; }
            }
            // Candidate rect
            const cand = { x: nx, y: ny, l, w };
            let invalid = outOfBounds(cand, v);
            if (!invalid) {
              for (const other of state.items) {
                if (String(other.id) === String(id)) continue;
                const d2 = dims2D(other);
                const br = { x: other.x, y: other.y, l: d2.l, w: d2.w };
                if (intersects(cand, br)) { invalid = true; break; }
              }
            }
            if (invalid) {
              // Block movement and show feedback
              const dir = { x: nx - it.x, y: ny - it.y };
              try { triggerCollisionFlash(cand, dir); } catch(_) {}
            } else {
              it.x = nx; it.y = ny;
            }
            board
              .querySelectorAll("rect.item")
              .forEach((n) => n.classList.remove("collide"));
            if (invalid)
              board
                .querySelector(`rect.item[data-id="${id}"]`)
                ?.classList.add("collide");
            renderItems();
            // live CoG/axle overlay + info update while dragging
            renderAxleOverlay();
            const axLive = computeAxleLoads(state.items, vehicle());
            const infoEl = mount.querySelector('#axleInfo');
            if (infoEl && axLive && axLive.totalKg) {
              const pctF = axLive.front_pct ? ` (${axLive.front_pct}%${axLive.front_pct>100?'!':''})` : '';
              const pctR = axLive.rear_pct ? ` (${axLive.rear_pct}%${axLive.rear_pct>100?'!':''})` : '';
              try {
                const frt = t('front_rear_total').split('•').map(s=>s.trim());
                const totL = frt[0] || 'Total';
                const fL = frt[1] || 'Front';
                const rL = frt[2] || 'Rear';
                infoEl.textContent = `${totL}: ${axLive.totalKg} kg • ${fL}: ${axLive.front_kg} kg${pctF} • ${rL}: ${axLive.rear_kg} kg${pctR}`;
              } catch(_) {
                infoEl.textContent = `Total: ${axLive.totalKg} kg • Front: ${axLive.front_kg} kg${pctF} • Rear: ${axLive.rear_kg} kg${pctR}`;
              }
            }
          });

          board.addEventListener("pointerup", (e) => {
            if (!drag) return;
            const id = drag.id;
            const it = state.items.find((x) => x.id === id);
            const invalid = !within(it, vehicle()) || anyCollision(it, id);
            if (invalid) {
              it.x = drag.pre.x;
              it.y = drag.pre.y;
            }
            pushHistory();
            drag = null;
            mount.classList.remove("dragging");
            renderAll();
            try { overlayLabels.updateAll(); } catch(_){}
          });

