          // ===================== SIDE CUT RENDER (W×H at middle length) =====================
          function renderSection() {
            if (!section) return;
            const v = vehicle();
            const Xc = v.inner_cm.L / 2;
            if (secLabel) secLabel.textContent = `${t('section')} D=${Math.round(Xc)} cm`;
            section.setAttribute("viewBox", `0 0 ${v.inner_cm.W} ${v.inner_cm.H}`);
            section.innerHTML = "";

            // grid
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            const step = Math.max(10, v.grid_cm);
            for (let x = 0; x <= v.inner_cm.W; x += step) {
              const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
              ln.setAttribute("x1", x);
              ln.setAttribute("y1", 0);
              ln.setAttribute("x2", x);
              ln.setAttribute("y2", v.inner_cm.H);
              ln.setAttribute("class", "sec-gridline");
              g.appendChild(ln);
            }
            for (let y = 0; y <= v.inner_cm.H; y += step) {
              const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
              ln.setAttribute("x1", 0);
              ln.setAttribute("y1", y);
              ln.setAttribute("x2", v.inner_cm.W);
              ln.setAttribute("y2", y);
              ln.setAttribute("class", "sec-gridline");
              g.appendChild(ln);
            }
            section.appendChild(g);

            // hull box (0..W, 0..H)
            const hull2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            hull2.setAttribute("x", 0);
            hull2.setAttribute("y", 0);
            hull2.setAttribute("width", v.inner_cm.W);
            hull2.setAttribute("height", v.inner_cm.H);
            hull2.setAttribute("rx", 3);
            hull2.setAttribute("class", "hull");
            section.appendChild(hull2);

            // items that intersect plane Xc
            const items = (state.items || []).filter((it) => !it.overflow);
            for (const it of items) {
              const d = dims2D(it);
              const x1 = it.x;
              const x2 = it.x + d.l;
              if (!(Xc >= x1 && Xc <= x2)) continue;
              const widthSpan = d.w;
              const heightSpan = (it.H || 0) * (it.stackCount || 1);
              if (heightSpan <= 0) continue;
              const x = Math.max(0, it.y);
              const w = Math.min(widthSpan, v.inner_cm.W - x);
              const h = Math.min(heightSpan, v.inner_cm.H);
              const y = Math.max(0, v.inner_cm.H - h);

              const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
              r.setAttribute("x", x);
              r.setAttribute("y", y);
              r.setAttribute("width", w);
              r.setAttribute("height", h);
              r.setAttribute("rx", 1.5);
              r.setAttribute("data-id", it.id);
              const col = getItemColor(it);
              // darken stroke slightly
              let strokeCol = col;
              const m = /hsl\((\d+),\s*(\d+)%\,\s*(\d+)%\)/.exec(col);
              if (m) {
                const h0 = m[1], s0 = m[2];
                let lval = parseInt(m[3], 10) - 18;
                if (lval < 5) lval = 5;
                strokeCol = `hsl(${h0}, ${s0}%, ${lval}%)`;
              }
              r.style.fill = col;
              r.style.stroke = state.selectedId === it.id ? 'var(--accent)' : strokeCol;
              r.style.strokeWidth = state.selectedId === it.id ? '1.6' : '0.8';
              r.style.cursor = 'pointer';
              section.appendChild(r);
            }
          }
