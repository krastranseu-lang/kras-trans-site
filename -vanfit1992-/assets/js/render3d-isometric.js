          // ===================== 3D RENDER (isometric preview) =====================
          function hslParts(hsl) {
            const m = /hsl\((\d+),\s*(\d+)%\,\s*(\d+)%\)/.exec(hsl);
            if (!m) return { h: 215, s: 60, l: 42 };
            return { h: +m[1], s: +m[2], l: +m[3] };
          }
          function hslAdjust(hsl, dl) {
            const p = hslParts(hsl);
            const l = Math.max(0, Math.min(100, p.l + dl));
            return `hsl(${p.h}, ${p.s}%, ${l}%)`;
          }
          function projectIso(x, y, z, scale, ox, oy) {
            const px = (x - y) * 0.8660254 * scale + ox;
            const py = ((x + y) * 0.5 - z) * scale + oy;
            return { x: px, y: py };
          }
          function compute3DScaleOrigin(v, cw, ch) {
            // Approximate extents for isometric projection
            const rangeX = 0.8660254 * (v.inner_cm.L + v.inner_cm.W);
            const rangeY = 0.5 * (v.inner_cm.L + v.inner_cm.W) + v.inner_cm.H;
            const scale = 0.9 * Math.min(cw / Math.max(1, rangeX), ch / Math.max(1, rangeY));
            const ox = cw * 0.5;
            const oy = ch * 0.6; // slightly lower to leave room for hull
            return { scale, ox, oy };
          }
          function render3D() {
            if (!board3d) return;
            const rect = board3d.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const cw = Math.max(200, rect.width | 0);
            const ch = Math.max(200, rect.height | 0);
            if (board3d.width !== (cw * dpr)) {
              board3d.width = cw * dpr;
              board3d.height = ch * dpr;
            }
            const ctx = board3d.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cw, ch);

            const v = vehicle();
            const { scale, ox, oy } = compute3DScaleOrigin(v, cw, ch);

            // Grid (floor)
            const gridStep = Math.max(20, v.grid_cm * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = mount.getAttribute("data-theme") === "dark" ? "#26334e" : "#e6ecfb";
            ctx.globalAlpha = 0.7;
            for (let x = 0; x <= v.inner_cm.L; x += gridStep) {
              const a = projectIso(x, 0, 0, scale, ox, oy);
              const b = projectIso(x, v.inner_cm.W, 0, scale, ox, oy);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            for (let y = 0; y <= v.inner_cm.W; y += gridStep) {
              const a = projectIso(0, y, 0, scale, ox, oy);
              const b = projectIso(v.inner_cm.L, y, 0, scale, ox, oy);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // Hull wireframe
            function line3(a, b, color, w = 1.4) {
              ctx.strokeStyle = color;
              ctx.lineWidth = w;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            const hullPts = {
              A: projectIso(0, 0, 0, scale, ox, oy),
              B: projectIso(v.inner_cm.L, 0, 0, scale, ox, oy),
              C: projectIso(v.inner_cm.L, v.inner_cm.W, 0, scale, ox, oy),
              D: projectIso(0, v.inner_cm.W, 0, scale, ox, oy),
              Ap: projectIso(0, 0, v.inner_cm.H, scale, ox, oy),
              Bp: projectIso(v.inner_cm.L, 0, v.inner_cm.H, scale, ox, oy),
              Cp: projectIso(v.inner_cm.L, v.inner_cm.W, v.inner_cm.H, scale, ox, oy),
              Dp: projectIso(0, v.inner_cm.W, v.inner_cm.H, scale, ox, oy),
            };
            const hullLine = mount.getAttribute("data-theme") === "dark" ? "#3a4d77" : "#89a3ff";
            line3(hullPts.A, hullPts.B, hullLine);
            line3(hullPts.B, hullPts.C, hullLine);
            line3(hullPts.C, hullPts.D, hullLine);
            line3(hullPts.D, hullPts.A, hullLine);
            line3(hullPts.Ap, hullPts.Bp, hullLine);
            line3(hullPts.Bp, hullPts.Cp, hullLine);
            line3(hullPts.Cp, hullPts.Dp, hullLine);
            line3(hullPts.Dp, hullPts.Ap, hullLine);
            line3(hullPts.A, hullPts.Ap, hullLine, 1.2);
            line3(hullPts.B, hullPts.Bp, hullLine, 1.2);
            line3(hullPts.C, hullPts.Cp, hullLine, 1.2);
            line3(hullPts.D, hullPts.Dp, hullLine, 1.2);

            // Items as prisms
            const items = state.items.map((it) => ({ it, d: it.x + it.y + (it.H * it.stackCount) * 0.3 }));
            items.sort((a, b) => a.d - b.d); // back to front

            for (const { it } of items) {
              const { l, w } = dims2D(it);
              const h = it.H * (it.stackCount || 1);
              const base = [
                projectIso(it.x, it.y, 0, scale, ox, oy),
                projectIso(it.x + l, it.y, 0, scale, ox, oy),
                projectIso(it.x + l, it.y + w, 0, scale, ox, oy),
                projectIso(it.x, it.y + w, 0, scale, ox, oy),
              ];
              const top = [
                projectIso(it.x, it.y, h, scale, ox, oy),
                projectIso(it.x + l, it.y, h, scale, ox, oy),
                projectIso(it.x + l, it.y + w, h, scale, ox, oy),
                projectIso(it.x, it.y + w, h, scale, ox, oy),
              ];
              const baseCol = getItemColor(it);
              const sideCol = hslAdjust(baseCol, -10);
              const topCol = hslAdjust(baseCol, +8);

              // top face
              ctx.fillStyle = topCol;
              ctx.strokeStyle = hslAdjust(baseCol, -15);
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(top[0].x, top[0].y);
              for (let i = 1; i < 4; i++) ctx.lineTo(top[i].x, top[i].y);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // side faces (right and left)
              function poly(points, fill, stroke) {
                ctx.fillStyle = fill;
                ctx.strokeStyle = stroke;
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              }
              poly([top[1], top[2], base[2], base[1]], sideCol, hslAdjust(baseCol, -20));
              poly([top[0], top[1], base[1], base[0]], hslAdjust(sideCol, -4), hslAdjust(baseCol, -20));

              // front edge accents
              ctx.strokeStyle = hslAdjust(baseCol, -25);
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.moveTo(base[0].x, base[0].y);
              ctx.lineTo(base[1].x, base[1].y);
              ctx.moveTo(base[1].x, base[1].y);
              ctx.lineTo(base[2].x, base[2].y);
              ctx.stroke();

              // subtle grid on top face to hint stacking
              const step = Math.max(20, v.grid_cm * 2);
              ctx.strokeStyle = hslAdjust(topCol, -12);
              ctx.lineWidth = 0.8;
              const nx = Math.max(1, Math.round(l / step));
              for (let i = 1; i < nx; i++) {
                const t = i / nx;
                const p1 = projectIso(it.x + l * t, it.y, h, scale, ox, oy);
                const p2 = projectIso(it.x + l * t, it.y + w, h, scale, ox, oy);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
            }
          }

          function renderItems() {
            const g = board.querySelector("#gItems");
            g.innerHTML = "";
            hudLayer.innerHTML = "";
            const rect = board.getBoundingClientRect();
            const v = vehicle();
            const sx = rect.width / v.inner_cm.L,
              sy = rect.height / v.inner_cm.W;
            const pxPerCm = Math.min(sx, sy);
            const isCompact = pxPerCm < 3; // requirement: when zoomed out
            // defs for clipping labels inside items
            let defs = board.querySelector('defs');
            if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg','defs'); board.insertBefore(defs, board.firstChild); }
          // Layout for overflow area to the right of the hull
          let colX = v.inner_cm.L + 5;
          let colY = 0;
          let colW = 0;
          // Ensure glow filter for overflow
          if (!defs.querySelector('#redGlow')){
            const flt = document.createElementNS('http://www.w3.org/2000/svg','filter');
            flt.setAttribute('id','redGlow');
            flt.setAttribute('x','-50%'); flt.setAttribute('y','-50%'); flt.setAttribute('width','200%'); flt.setAttribute('height','200%');
            const ds = document.createElementNS('http://www.w3.org/2000/svg','feDropShadow');
            ds.setAttribute('dx','0'); ds.setAttribute('dy','0'); ds.setAttribute('stdDeviation','4');
            ds.setAttribute('flood-color','#ff4d4f'); ds.setAttribute('flood-opacity','0.65');
            flt.appendChild(ds);
            defs.appendChild(flt);
          }
          state.items.forEach((it) => {
              const { l, w } = dims2D(it);
              // Determine drawing coordinates, moving overflow items to columns on the right
              let drawX = it.x;
              let drawY = it.y;
              if (it.overflow) {
                if (colY + w > v.inner_cm.W) {
                  // new column
                  colX += colW + 10;
                  colY = 0;
                  colW = 0;
                }
                drawX = colX;
                drawY = colY;
                colY += w + 5;
                if (l > colW) colW = l;
              }
              // Invisible, oversized hit rectangle to make dragging easy
              const hitPad = 6; // cm (SVG units)
              const hit = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "rect"
              );
              hit.setAttribute("x", Math.max(0, drawX - hitPad));
              hit.setAttribute("y", Math.max(0, drawY - hitPad));
              hit.setAttribute("width", l + hitPad * 2);
              hit.setAttribute("height", w + hitPad * 2);
              hit.setAttribute("class", "dragHit");
              hit.setAttribute("data-id", it.id);
              g.appendChild(hit);

              const r = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "rect"
              );
              r.setAttribute("x", drawX);
              r.setAttribute("y", drawY);
              r.setAttribute("width", l);
              r.setAttribute("height", w);
              r.setAttribute("rx", 1.5);
              r.setAttribute(
                "class",
                "item" + (state.selectedId === it.id ? " selected" : "")
              );
              r.setAttribute("data-id", it.id);
              r.setAttribute("tabindex", "0");
              // Apply dynamic color based on item index and stack count
              const col = getItemColor(it);
              // derive a darker color for the stroke by reducing lightness
              let strokeCol = col;
              const m = /hsl\((\d+),\s*(\d+)%\,\s*(\d+)%\)/.exec(col);
              if (m) {
                const h = m[1];
                const s = m[2];
                let lval = parseInt(m[3], 10) - 20;
                if (lval < 5) lval = 5;
                strokeCol = `hsl(${h}, ${s}%, ${lval}%)`;
              }
              // Set via style rather than attribute to ensure it overrides theme CSS
              r.style.fill = col;
              r.style.stroke = strokeCol;
              // Append base rectangle early so label measurement (getBBox) sees DOM
              if (it.overflow) {
                r.style.filter = 'url(#redGlow)';
                // Make overflow more apparent
                r.style.stroke = '#ff4d4f';
                r.style.fillOpacity = '0.92';
              }
              g.appendChild(r);

              // Clip-path to keep indicators inside the rectangle
              const clipId = `cp_${it.id}`;
              const cp = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
              cp.setAttribute('id', clipId);
              const cpr = document.createElementNS('http://www.w3.org/2000/svg','rect');
              cpr.setAttribute('x', drawX); cpr.setAttribute('y', drawY);
              cpr.setAttribute('width', l); cpr.setAttribute('height', w);
              cp.appendChild(cpr);
              defs.appendChild(cp);

              // Choose contrasting label colors vs item fill
              let txtFill = '#f6f8ff', txtStroke = '#0b1020';
              if (m) {
                const light = parseInt(m[3], 10);
                if (light > 55) { // light item → darker text
                  txtFill = '#0b1020';
                  txtStroke = 'rgba(255,255,255,0.35)';
                }
              }
              // Centered two-line label. Auto-scales up/down to keep readability.
              const gLab = document.createElementNS('http://www.w3.org/2000/svg','g');
              gLab.setAttribute('clip-path', `url(#${clipId})`);
              gLab.setAttribute('pointer-events', 'none');
              const cx = drawX + l/2;
              const cy = drawY + w/2;
              const d2 = dims2D(it);
              const fullDims = `${d2.l}×${d2.w}×${it.H}`;
              const gText = document.createElementNS('http://www.w3.org/2000/svg','g');
              // main dims
              const labelDims = document.createElementNS('http://www.w3.org/2000/svg','text');
              labelDims.setAttribute('x', cx);
              labelDims.setAttribute('y', cy - 2);
              labelDims.setAttribute('text-anchor','middle');
              labelDims.setAttribute('dominant-baseline','middle');
              labelDims.setAttribute('class','label dimA');
              labelDims.style.fill = txtFill; labelDims.style.stroke = txtStroke;
              labelDims.textContent = fullDims;
              gText.appendChild(labelDims);
              // secondary line: weight (+ stack)
              const labelKg = document.createElementNS('http://www.w3.org/2000/svg','text');
              labelKg.setAttribute('x', cx);
              labelKg.setAttribute('y', cy + 12);
              labelKg.setAttribute('text-anchor','middle');
              labelKg.setAttribute('dominant-baseline','middle');
              labelKg.setAttribute('class','label dimB');
              labelKg.style.fill = txtFill; labelKg.style.stroke = txtStroke;
              const kgTxt = `${Math.max(0, it.weight||0)} kg${it.stackCount>1?` ×${it.stackCount}`:''}`;
              labelKg.textContent = kgTxt;
              gText.appendChild(labelKg);
              // Tooltip text
              const tip = `${fullDims}, ${Math.max(0, it.weight||0)} kg, ${it.type||'—'}`;
              gLab.setAttribute('title', tip);
              try {
                gLab.appendChild(gText);
                g.appendChild(gLab);
                const bbox = gText.getBBox();
                const pad = 4;
                const maxW = Math.max(1, l - pad);
                const maxH = Math.max(1, w - pad);
                let s = Math.min(maxW / Math.max(1, bbox.width), maxH / Math.max(1, bbox.height));
                s = Math.max(0.45, Math.min(2.0, s)); // allow enlarge for małe palety
                const t = `translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`;
                gText.setAttribute('transform', t);
              } catch(_) {
                gLab.appendChild(gText);
                g.appendChild(gLab);
              }

              // Optional small icons inside the item rect (top‑right), clipped to item
              const flags = it.flags || {};
              if (flags.noStack || flags.fragile) {
                const iconSize = 4; // in cm (SVG units)
                let ix = drawX + l - iconSize - 1.5;
                const iy = drawY + 1.8;
                if (flags.noStack) {
                  const u1 = document.createElementNS('http://www.w3.org/2000/svg','use');
                  u1.setAttribute('href','#i-nostack');
                  u1.setAttribute('x', ix);
                  u1.setAttribute('y', iy);
                  u1.setAttribute('width', iconSize);
                  u1.setAttribute('height', iconSize);
                  u1.setAttribute('fill', txtFill);
                  gLab.appendChild(u1);
                  ix -= iconSize + 1;
                }
                if (flags.fragile) {
                  const u2 = document.createElementNS('http://www.w3.org/2000/svg','use');
                  u2.setAttribute('href','#i-fragile');
                  u2.setAttribute('x', ix);
                  u2.setAttribute('y', iy);
                  u2.setAttribute('width', iconSize);
                  u2.setAttribute('height', iconSize);
                  u2.setAttribute('fill', txtFill);
                  gLab.appendChild(u2);
                }
              }

              const bx = drawX + l - 3.5,
                by = drawY + 3.5;
              const rbHit = document.createElementNS("http://www.w3.org/2000/svg","circle");
              rbHit.setAttribute("cx", bx);
              rbHit.setAttribute("cy", by);
              rbHit.setAttribute("r", 12); // większy, niewidzialny obszar obrotu
              rbHit.setAttribute("class", "rotHit");
              rbHit.setAttribute("data-rot", it.id);
              // tylko hit-area, bez widocznych ikon
              g.appendChild(rbHit);
            });
            selPanel.classList.toggle("active", !!state.selectedId);
          }

          function recalc() {
            const v = vehicle();
            let vol = 0,
              kg = 0,
              ldm = 0;
            state.items.forEach((it) => {
              vol += volItem(it);
              kg += weightItem(it);
              ldm += ldmOf(it, v);
            });
            const capVol =
              (v.inner_cm.L * v.inner_cm.W * v.inner_cm.H) / 1_000_000;
            volBar.max = 100;
            volBar.value = Math.min(100, (vol / capVol) * 100);
            kgBar.max = 100;
            kgBar.value = Math.min(100, (kg / v.payload_kg) * 100);
            volText.textContent = `${vol.toFixed(2)} / ${capVol.toFixed(1)} m³`;
            kgText.textContent = `${Math.round(kg)} / ${
              v.payload_kg
            } kg • LDM ~ ${ldm.toFixed(2)}`;

            const overload = kg - v.payload_kg;
            fitBadge.className = "badge " + (overload > 0 ? "bad" : "ok");
            fitBadge.textContent =
              overload > 0
                ? t('exceeds_payload', { kg: Math.abs(Math.round(overload)) })
                : t("fits");

            let maxX = 0,
              usedWidth = 0;
            const rows = buildShelvesSnapshot();
            rows.forEach((row) => {
              maxX = Math.max(maxX, row.x);
              usedWidth += row.h;
            });
            leftBadge.textContent = t("clearance_lw", {
              L: Math.max(0, v.inner_cm.L - Math.round(maxX)),
              W: Math.max(0, v.inner_cm.W - Math.round(usedWidth)),
            });

            // Update axle load info + warnings/suggestion after recalculation
            warnAndSuggest();
          }

          // Compute distribution across axles with optional vehicle.ax {front,rear,fmax,rmax}
          // Returns detailed metrics and updates the UI summary line.
          function computeAxleLoads(items, veh) {
            const infoEl = mount.querySelector("#axleInfo");
            const ax = veh.ax || {};
            const L = veh.inner_cm?.L || 0;
            const frontPos = Number(ax.front ?? 0); // cm from origin (front)
            const rearPos = Number(ax.rear ?? L);   // cm from origin (rear axle position)
            const fmax = Number(ax.fmax ?? veh.front_axle_kg ?? 0) || 0;
            const rmax = Number(ax.rmax ?? veh.rear_axle_kg ?? 0) || 0;

            // Total weight considering stacking
            let totalKg = 0, cxSum = 0;
            for (const it of items) {
              const kg = weightItem(it); // already multiplies by stackCount
              const { l } = dims2D(it);
              const cx = (Number(it.x) || 0) + l / 2; // cm from front
              totalKg += kg;
              cxSum += kg * cx;
            }
            // Center of mass along length
            const Cx = totalKg ? cxSum / totalKg : (L || 0) / 2;
            const span = Math.max(1, (rearPos - frontPos));
            // Simple beam reaction forces (front and rear supports)
            let Rf = totalKg * (rearPos - Cx) / span; // front reaction
            let Rr = totalKg - Rf;                    // rear reaction
            // Guard against tiny negatives from rounding
            Rf = Math.max(0, Rf);
            Rr = Math.max(0, Rr);

            const res = {
              front_kg: Math.round(Rf),
              rear_kg: Math.round(Rr),
              front_pct: fmax ? Math.round((Rf / fmax) * 100) : 0,
              rear_pct: rmax ? Math.round((Rr / rmax) * 100) : 0,
              totalKg: Math.round(totalKg),
              cx_cm: Math.round(Cx),
            };

            if (infoEl) {
              if (!totalKg) {
                infoEl.textContent = t('axle_no_data');
              } else {
                const pctF = fmax ? ` (${res.front_pct}%${res.front_pct>100?"!":""})` : "";
                const pctR = rmax ? ` (${res.rear_pct}%${res.rear_pct>100?"!":""})` : "";
                try {
                  const totL = (I18N[lang] && I18N[lang].axis_total) || (t('front_rear_total').split('•')[0]||'Total').trim() || 'Total';
                  const fL = (I18N[lang] && I18N[lang].axis_front) || (t('front_rear_total').split('•')[1]||'Front').trim() || 'Front';
                  const rL = (I18N[lang] && I18N[lang].axis_rear) || (t('front_rear_total').split('•')[2]||'Rear').trim() || 'Rear';
                  infoEl.textContent = `${totL}: ${res.totalKg} kg • ${fL}: ${res.front_kg} kg${pctF} • ${rL}: ${res.rear_kg} kg${pctR}`;
                } catch(_) {
                  infoEl.textContent = `Total: ${res.totalKg} kg • Front: ${res.front_kg} kg${pctF} • Rear: ${res.rear_kg} kg${pctR}`;
                }
              }
            }
            return res;
          }

          // Build warnings + simple vehicle suggestion based on axle and payload
          function warnAndSuggest() {
            const v = vehicle();
            const ax = computeAxleLoads(state.items || [], v);
            const warnings = [];
            if (ax.front_pct > 100) warnings.push(t('warn_front_over', { pct: ax.front_pct }));
            if (ax.rear_pct > 100) warnings.push(t('warn_rear_over', { pct: ax.rear_pct }));
            if ((state.items || []).some((it) => (it.H || 0) > v.inner_cm.H)) warnings.push(t('warn_too_tall'));
            if ((state.items || []).some((it) => it.stackable === false)) warnings.push(t('warn_non_stack'));
            const totalKg = (state.items || []).reduce((s, it) => s + weightItem(it), 0);
            if (totalKg > v.payload_kg) warnings.push(t('warn_payload_over'));
            const notPlaced = (state.items || []).filter((it) => it && it.overflow).length;
            if (notPlaced > 0) warnings.push(t('warn_not_placed', { count: notPlaced }));

            state.warnings = warnings;
            const warnEl = mount.querySelector('#warnList');
            if (warnEl) {
              warnEl.innerHTML = '';
              if (!warnings.length) {
                warnEl.style.display = 'none';
              } else {
                warnEl.style.display = 'flex';
                for (const w of warnings) {
                  const b = document.createElement('span');
                  b.className = 'badge bad';
                  b.textContent = w;
                  warnEl.appendChild(b);
                }
              }
            }
            return ax;
          }

          function buildShelvesSnapshot() {
            const v = vehicle();
            const items = state.items.map((it) => ({ ...it, ...dims2D(it) }));
            items.sort((a, b) => b.w - a.w);
            const shelves = [];
            let y = 0;
            items.forEach((it) => {
              let placed = false;
              for (const sh of shelves) {
                if (
                  it.w <= v.inner_cm.W - sh.y &&
                  sh.x + it.l <= v.inner_cm.L
                ) {
                  sh.x += it.l;
                  sh.h = Math.max(sh.h, it.w);
                  placed = true;
                  break;
                }
              }
              if (!placed) {
                if (y + it.w <= v.inner_cm.W) {
                  shelves.push({ x: it.l, h: it.w, y });
                  y += it.w;
                }
              }
            });
            return shelves;
          }

  function renderAll() {
    // Enforce simple overflow-by-dimensions rule before rendering
    try { enforceOverflowRules(); } catch(_) {}
    renderVehSelect();
            renderSpecs();
            if (state.viewMode === "3d") {
              // show 3D canvas, hide 2D SVG + HUD
              board.style.display = "none";
              hudLayer.style.display = "none";
              // prefer new Three.js view
              if (view3d) { view3d.hidden = false; view3d.style.display = 'block'; }
              if (board3d) { board3d.style.display = 'none'; }
              stageWrap?.classList.remove('compare');
              if (boardB) boardB.style.display = 'none';
              try { 
                threeInit(); 
                // Ensure camera mode
                if (threeCtx.state.top2d) threeSetCamera('ortho'); else threeSetCamera('persp');
                threeUpdateVehicle(); 
                threeUpdateItems();
                // Update section slider visibility
                if (sectionSlider) sectionSlider.style.display = threeCtx.state.sectionEnabled ? 'inline-block' : 'none';
              } catch(_) {}
              // Hide overlay in 3D mode
              try {
                const vp = mount.querySelector('#viewport');
                if (vp) { vp.style.display = 'none'; vp.setAttribute('aria-hidden','true'); }
              } catch(_) {}
            } else {
              board3d.style.display = "none";
              hudLayer.style.display = "block";
              board.style.display = "block";
              if (view3d) { view3d.hidden = true; view3d.style.display = 'none'; }
              try { hide3DTooltip(); } catch(_) {}
              buildSVG();
              renderItems();
              // Overlay labels: always keep in sync after main render
              try { overlayLabels.updateAll(); } catch (_) {}
              // Keep 3D scene data in sync even when not visible
              try { if (threeCtx && threeCtx.init) threeUpdateItems(); } catch(_) {}
              if (state.compareOn && state.variants?.plans?.length) {
                stageWrap?.classList.add('compare');
                if (boardB) boardB.style.display = 'block';
                renderCompareB();
              } else {
                stageWrap?.classList.remove('compare');
                if (boardB) boardB.style.display = 'none';
              }
              // Always hide section slider outside 3D
              if (sectionSlider) sectionSlider.style.display = 'none';
            }
            renderAxleOverlay();
            try { updateRulers(); } catch(_) {}
            renderSection();
            recalc();
            bindItemEvents();
            updateVariantLabel();
            // Update overlay labels at end of render
            try { overlayLabels.updateAll(); } catch(_){}
          }

          // Feature flags
          const AXLE_OVERLAY_ON = false; // hide dashed CoG/guide lines unless explicitly enabled

          function renderAxleOverlay() {
            if (!board) return;
            if (!AXLE_OVERLAY_ON) {
              try { board.querySelector('#gAxle')?.remove(); board.querySelector('#gGuides')?.remove(); } catch(_) {}
              return;
            }
            const v = vehicle();
            const old = board.querySelector('#gAxle');
            if (old) old.remove();
            if (!state.items.length) return;
            const ax = computeAxleLoads(state.items, v);
            if (!ax || !isFinite(ax.cx_cm)) return;
            const g = document.createElementNS('http://www.w3.org/2000/svg','g');
            g.setAttribute('id','gAxle');
            // CoG line
            const ln = document.createElementNS('http://www.w3.org/2000/svg','line');
            ln.setAttribute('x1', ax.cx_cm);
            ln.setAttribute('y1', 0);
            ln.setAttribute('x2', ax.cx_cm);
            ln.setAttribute('y2', v.inner_cm.W);
            ln.setAttribute('class','axline');
            g.appendChild(ln);
            // CoG marker (middle width)
            const mk = document.createElementNS('http://www.w3.org/2000/svg','circle');
            mk.setAttribute('cx', ax.cx_cm);
            mk.setAttribute('cy', Math.max(6, Math.min(v.inner_cm.W-6, v.inner_cm.W/2)));
            mk.setAttribute('r', 2.6);
            mk.setAttribute('class','axmark');
            g.appendChild(mk);
            // Bars for front/rear loads (relative to max if available, else to total)
            const hb = 4; // height of bar
            const pad = 1;
            const fRatio = (ax.front_pct && ax.front_pct>0) ? Math.min(1, ax.front_pct/100) : (ax.front_kg/(ax.front_kg+ax.rear_kg||1));
            const rRatio = (ax.rear_pct && ax.rear_pct>0) ? Math.min(1, ax.rear_pct/100) : (ax.rear_kg/(ax.front_kg+ax.rear_kg||1));
            const fRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
            fRect.setAttribute('x', pad);
            fRect.setAttribute('y', pad);
            fRect.setAttribute('width', Math.max(2, (v.inner_cm.L/2 - 2*pad) * fRatio));
            fRect.setAttribute('height', hb);
            fRect.setAttribute('class','axbar');
            g.appendChild(fRect);
            const rRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
            const rightX = v.inner_cm.L/2 + pad;
            rRect.setAttribute('x', rightX);
            rRect.setAttribute('y', pad);
            rRect.setAttribute('width', Math.max(2, (v.inner_cm.L/2 - 2*pad) * rRatio));
            rRect.setAttribute('height', hb);
            rRect.setAttribute('class','axbar');
            g.appendChild(rRect);
            // Texts
            const tf = document.createElementNS('http://www.w3.org/2000/svg','text');
            tf.setAttribute('x', pad+2);
            tf.setAttribute('y', hb + pad + 3);
            tf.setAttribute('class','axtext');
            tf.textContent = `F ${ax.front_kg} kg${ax.front_pct?` (${ax.front_pct}%)`:''}`;
            g.appendChild(tf);
            const tr = document.createElementNS('http://www.w3.org/2000/svg','text');
            tr.setAttribute('x', rightX + 2);
            tr.setAttribute('y', hb + pad + 3);
            tr.setAttribute('class','axtext');
            tr.textContent = `R ${ax.rear_kg} kg${ax.rear_pct?` (${ax.rear_pct}%)`:''}`;
            g.appendChild(tr);
            board.appendChild(g);

            // Also draw a full-height guide line at the loaded length (max X of placed items)
            try {
              const g2old = board.querySelector('#gGuides');
              if (g2old) g2old.remove();
              const g2 = document.createElementNS('http://www.w3.org/2000/svg','g');
              g2.setAttribute('id','gGuides');
              const maxX = (state.items||[]).reduce((m,it)=>{
                if (!it || it.overflow) return m;
                const d = dims2D(it);
                return Math.max(m, (it.x||0) + (d.l||0));
              }, 0);
              if (maxX > 0) {
                const ln2 = document.createElementNS('http://www.w3.org/2000/svg','line');
                ln2.setAttribute('x1', String(maxX));
                ln2.setAttribute('y1', '0');
                ln2.setAttribute('x2', String(maxX));
                ln2.setAttribute('y2', String(v.inner_cm.W));
                ln2.setAttribute('class','sectionline');
                g2.appendChild(ln2);
              }
              board.appendChild(g2);
            } catch(_) {}
          }

          function renderCompareB() {
            if (!boardB) return;
            const v = vehicle();
            // Pick next variant as B (wrap if needed)
            let idxB = (state.variants?.index ?? 0) + 1;
            const n = state.variants?.plans?.length || 0;
            if (!n) return;
            idxB = idxB % n;
            const itemsB = deepClone(state.variants.plans[idxB] || state.items || []);

            // Compute overflow padding similar to buildSVG()
            const ovItems = (itemsB || []).filter((it) => it && it.overflow);
            let pad = 0;
            if (ovItems.length) {
              const totalH = ovItems.reduce((s, it) => {
                const d = dims2D(it);
                return s + (d.w || 0) + 5;
              }, 0);
              const cols = Math.max(1, Math.ceil(totalH / Math.max(1, v.inner_cm.W)));
              const maxL = ovItems.reduce((m, it) => Math.max(m, dims2D(it).l || 0), 0);
              pad = cols * (maxL + 10) + 10;
            }
            boardB.setAttribute('viewBox', `0 0 ${v.inner_cm.L + pad} ${v.inner_cm.W}`);
            boardB.innerHTML = '';
            // grid
            const gGrid = document.createElementNS('http://www.w3.org/2000/svg','g');
            const step = v.grid_cm;
            for (let x = 0; x <= v.inner_cm.L; x += step) {
              const line = document.createElementNS('http://www.w3.org/2000/svg','line');
              line.setAttribute('x1', x); line.setAttribute('y1', 0);
              line.setAttribute('x2', x); line.setAttribute('y2', v.inner_cm.W);
              line.setAttribute('class','gridline');
              gGrid.appendChild(line);
            }
            for (let y = 0; y <= v.inner_cm.W; y += step) {
              const line = document.createElementNS('http://www.w3.org/2000/svg','line');
              line.setAttribute('x1', 0); line.setAttribute('y1', y);
              line.setAttribute('x2', v.inner_cm.L); line.setAttribute('y2', y);
              line.setAttribute('class','gridline');
              gGrid.appendChild(line);
            }
            boardB.appendChild(gGrid);
            // hull
            const hull = document.createElementNS('http://www.w3.org/2000/svg','rect');
            hull.setAttribute('x',0); hull.setAttribute('y',0);
            hull.setAttribute('width', v.inner_cm.L);
            hull.setAttribute('height', v.inner_cm.W);
            hull.setAttribute('rx',3);
            hull.setAttribute('class','hull');
            boardB.appendChild(hull);

            // items (static preview)
            let colX = v.inner_cm.L + 5, colY = 0, colW = 0;
            for (const it of itemsB) {
              const { l, w } = dims2D(it);
              let drawX = it.x, drawY = it.y;
              if (it.overflow) {
                if (colY + w > v.inner_cm.W) { colX += colW + 10; colY = 0; colW = 0; }
                drawX = colX; drawY = colY; colY += w + 5; if (l > colW) colW = l;
              }
              const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
              r.setAttribute('x', drawX); r.setAttribute('y', drawY);
              r.setAttribute('width', l); r.setAttribute('height', w);
              r.setAttribute('rx', 1.5); r.setAttribute('class','item');
              const col = getItemColor(it);
              let strokeCol = col; const m = /hsl\((\d+),\s*(\d+)%\,\s*(\d+)%\)/.exec(col);
              if (m) { const h=m[1], s=m[2]; let lv=parseInt(m[3],10)-20; if (lv<5) lv=5; strokeCol=`hsl(${h}, ${s}%, ${lv}%)`; }
              r.style.fill = col; r.style.stroke = strokeCol;
              boardB.appendChild(r);
            }
          }