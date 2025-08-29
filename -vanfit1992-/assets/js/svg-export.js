          // ===================== SVG =====================
          function buildSVG() {
            const v = vehicle();
            // Extend viewBox to the right if we have overflow items to visualize outside cargo area
            const ovItems = (state.items || []).filter((it) => it && it.overflow);
            let pad = 0;
            if (ovItems.length) {
              // approximate needed columns based on total height
              const totalH = ovItems.reduce((s, it) => {
                const d = dims2D(it);
                return s + (d.w || 0) + 5;
              }, 0);
              const cols = Math.max(1, Math.ceil(totalH / Math.max(1, v.inner_cm.W)));
              const maxL = ovItems.reduce((m, it) => Math.max(m, dims2D(it).l || 0), 0);
              pad = cols * (maxL + 10) + 10; // some spacing
            }
            board.setAttribute("viewBox", `0 0 ${v.inner_cm.L + pad} ${v.inner_cm.W}`);
            board.innerHTML = "";
            hudLayer.innerHTML = "";
            // Global symbols/defs (icons etc.)
            const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
            // No‑stack icon: two boxes + strike-through
            const symNoStack = document.createElementNS('http://www.w3.org/2000/svg','symbol');
            symNoStack.setAttribute('id','i-nostack');
            symNoStack.setAttribute('viewBox','0 0 24 24');
            const nsR1 = document.createElementNS('http://www.w3.org/2000/svg','rect');
            nsR1.setAttribute('x','3'); nsR1.setAttribute('y','13'); nsR1.setAttribute('width','8'); nsR1.setAttribute('height','6'); nsR1.setAttribute('rx','1.2');
            const nsR2 = document.createElementNS('http://www.w3.org/2000/svg','rect');
            nsR2.setAttribute('x','13'); nsR2.setAttribute('y','5'); nsR2.setAttribute('width','8'); nsR2.setAttribute('height','6'); nsR2.setAttribute('rx','1.2');
            const nsSlash = document.createElementNS('http://www.w3.org/2000/svg','path');
            nsSlash.setAttribute('d','M4 20 L20 4'); nsSlash.setAttribute('fill','none'); nsSlash.setAttribute('stroke','currentColor'); nsSlash.setAttribute('stroke-width','2'); nsSlash.setAttribute('stroke-linecap','round');
            symNoStack.appendChild(nsR1); symNoStack.appendChild(nsR2); symNoStack.appendChild(nsSlash);
            defs.appendChild(symNoStack);
            // Fragile icon: wine glass + crack
            const symFragile = document.createElementNS('http://www.w3.org/2000/svg','symbol');
            symFragile.setAttribute('id','i-fragile');
            symFragile.setAttribute('viewBox','0 0 24 24');
            const frBowl = document.createElementNS('http://www.w3.org/2000/svg','path');
            frBowl.setAttribute('d','M6 3h12v4a6 6 0 0 1-6 6a6 6 0 0 1-6-6V3z');
            const frStem = document.createElementNS('http://www.w3.org/2000/svg','path');
            frStem.setAttribute('d','M12 13v5'); frStem.setAttribute('fill','none'); frStem.setAttribute('stroke','currentColor'); frStem.setAttribute('stroke-width','2'); frStem.setAttribute('stroke-linecap','round');
            const frBase = document.createElementNS('http://www.w3.org/2000/svg','rect');
            frBase.setAttribute('x','8'); frBase.setAttribute('y','20'); frBase.setAttribute('width','8'); frBase.setAttribute('height','2'); frBase.setAttribute('rx','1');
            const frCrack = document.createElementNS('http://www.w3.org/2000/svg','path');
            frCrack.setAttribute('d','M12 3l1.5 3l-2 2l2 1.5'); frCrack.setAttribute('fill','none'); frCrack.setAttribute('stroke','currentColor'); frCrack.setAttribute('stroke-width','1.8'); frCrack.setAttribute('stroke-linecap','round'); frCrack.setAttribute('stroke-linejoin','round');
            symFragile.appendChild(frBowl); symFragile.appendChild(frStem); symFragile.appendChild(frBase); symFragile.appendChild(frCrack);
            defs.appendChild(symFragile);
            board.appendChild(defs);
            const gGrid = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "g"
            );
            const step = v.grid_cm;
            for (let x = 0; x <= v.inner_cm.L; x += step) {
              const line = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line"
              );
              line.setAttribute("x1", x);
              line.setAttribute("y1", 0);
              line.setAttribute("x2", x);
              line.setAttribute("y2", v.inner_cm.W);
              line.setAttribute("class", "gridline");
              gGrid.appendChild(line);
            }
            for (let y = 0; y <= v.inner_cm.W; y += step) {
              const line = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line"
              );
              line.setAttribute("x1", 0);
              line.setAttribute("y1", y);
              line.setAttribute("x2", v.inner_cm.L);
              line.setAttribute("y2", y);
              line.setAttribute("class", "gridline");
              gGrid.appendChild(line);
            }
            // Major grid every 50 cm
            const gGridMajor = document.createElementNS('http://www.w3.org/2000/svg','g');
            const major = 50;
            for (let x = 0; x <= v.inner_cm.L; x += major) {
              const ln = document.createElementNS('http://www.w3.org/2000/svg','line');
              ln.setAttribute('x1', x); ln.setAttribute('y1', 0);
              ln.setAttribute('x2', x); ln.setAttribute('y2', v.inner_cm.W);
              ln.setAttribute('class','gridline major');
              gGridMajor.appendChild(ln);
            }
            for (let y = 0; y <= v.inner_cm.W; y += major) {
              const ln = document.createElementNS('http://www.w3.org/2000/svg','line');
              ln.setAttribute('x1', 0); ln.setAttribute('y1', y);
              ln.setAttribute('x2', v.inner_cm.L); ln.setAttribute('y2', y);
              ln.setAttribute('class','gridline major');
              gGridMajor.appendChild(ln);
            }
            board.appendChild(gGrid);
            board.appendChild(gGridMajor);
            const hull = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "rect"
            );
            hull.setAttribute("x", 0);
            hull.setAttribute("y", 0);
            hull.setAttribute("width", v.inner_cm.L);
            hull.setAttribute("height", v.inner_cm.W);
            hull.setAttribute("rx", 3);
            hull.setAttribute("class", "hull");
            board.appendChild(hull);
            // (wyłączono wewnętrzną linijkę — używamy zewnętrznej w overlay)
            // Section plane marker at middle of length
            const secx = v.inner_cm.L / 2;
            const sline = document.createElementNS("http://www.w3.org/2000/svg", "line");
            sline.setAttribute("x1", secx);
            sline.setAttribute("y1", 0);
            sline.setAttribute("x2", secx);
            sline.setAttribute("y2", v.inner_cm.W);
            sline.setAttribute("class", "sectionline");
            board.appendChild(sline);
            const gItems = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "g"
            );
            gItems.setAttribute("id", "gItems");
            board.appendChild(gItems);
          }
