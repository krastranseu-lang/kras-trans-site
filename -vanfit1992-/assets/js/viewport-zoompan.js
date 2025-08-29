          // ===================== Zoom/Pan Interactions (canvas viewport) =====================
          // Zoom keeping the world point under the pointer fixed
          function zoomAt(pointer, factor) {
            try {
              if (!stageWrap || !isFinite(factor) || factor === 1) return;
              VIEW_TOUCHED = true;
              const rect = stageWrap.getBoundingClientRect();
              const sx = (pointer.clientX != null ? pointer.clientX : pointer.x) - rect.left;
              const sy = (pointer.clientY != null ? pointer.clientY : pointer.y) - rect.top;
              // world point before zoom
              const worldPt = screenToWorld({ sx, sy });
              const prev = VIEW.zoom || 1;
              const next = Math.max(VIEW.minZoom, Math.min(VIEW.maxZoom, prev * factor));
              if (next === prev) return;
              VIEW.zoom = next;
              const s = getPxPerCm();
              VIEW.pan.x = sx - worldPt.x * s;
              VIEW.pan.y = sy - worldPt.y * s;
              // Keep VP2D view in sync for persistence
              VP2D.view.zoom = VIEW.zoom;
              VP2D.view.pan = { x: VIEW.pan.x, y: VIEW.pan.y };
              // Update visuals
              try { render(); } catch(_) {}
              try { updateRulers(); } catch(_) {}
              try { layoutLabels2D(); } catch(_) {}
              try { overlayLabels.updateAll(); } catch(_) {}
            } catch(_) {}
          }

          (function initPanZoom(){
            if (!stageWrap) return;
            // Wheel + ctrl for smooth zoom
            try {
              stageWrap.addEventListener('wheel', (e) => {
                if (!e.ctrlKey) return; // only when ctrl pressed (pinch-zoom on many systems)
                e.preventDefault();
                const k = -0.0025; // sensitivity
                const factor = Math.exp(k * e.deltaY);
                zoomAt(e, factor);
              }, { passive: false });
            } catch(_) {}

            // Double-click zoom in at pointer
            try {
              stageWrap.addEventListener('dblclick', (e) => {
                e.preventDefault();
                zoomAt(e, 1.5);
              });
            } catch(_) {}

            // Panning: MMB or Space+LMB
            let spaceDown = false;
            function isTypingTarget(t){ return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
            window.addEventListener('keydown', (e) => {
              if (e.code === 'Space' && !isTypingTarget(e.target)) {
                spaceDown = true;
                // Indicate pannable state
                if (!panDrag) stageWrap.style.cursor = 'grab';
                // prevent page scroll on space
                e.preventDefault();
              }
            });
            window.addEventListener('keyup', (e) => {
              if (e.code === 'Space') {
                spaceDown = false;
                if (!panDrag) stageWrap.style.cursor = '';
              }
            });

            let panDrag = null; // { id, start:{x,y}, pan0:{x,y} }
            function beginPan(e){
              VIEW_TOUCHED = true;
              panDrag = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, pan0: { x: VIEW.pan.x, y: VIEW.pan.y } };
              try { e.target.setPointerCapture(e.pointerId); } catch(_) {}
              stageWrap.style.cursor = 'grabbing';
            }
            function movePan(e){
              if (!panDrag || e.pointerId !== panDrag.id) return;
              const dx = e.clientX - panDrag.start.x;
              const dy = e.clientY - panDrag.start.y;
              VIEW.pan.x = panDrag.pan0.x + dx;
              VIEW.pan.y = panDrag.pan0.y + dy;
              VP2D.view.pan = { x: VIEW.pan.x, y: VIEW.pan.y };
              try { render(); } catch(_) {}
              try { updateRulers(); } catch(_) {}
              try { layoutLabels2D(); } catch(_) {}
              try { overlayLabels.updateAll(); } catch(_) {}
            }
            function endPan(e){
              if (!panDrag || e.pointerId !== panDrag.id) return;
              panDrag = null;
              stageWrap.style.cursor = spaceDown ? 'grab' : '';
              // push to history for undo granularity
              try { pushHistory(); } catch(_) {}
            }

            // Capture early to avoid interfering with item dragging
            stageWrap.addEventListener('pointerdown', (e) => {
              if (e.button === 1 || (spaceDown && e.button === 0)) {
                e.preventDefault();
                e.stopPropagation();
                beginPan(e);
              }
            }, { capture: true });
            stageWrap.addEventListener('pointermove', (e) => movePan(e), { capture: true });
            stageWrap.addEventListener('pointerup', (e) => endPan(e), { capture: true });
            stageWrap.addEventListener('pointercancel', (e) => endPan(e), { capture: true });

            // External cancel (e.g., ESC from viewport)
            try {
              document.addEventListener('vp-cancel-pan', () => {
                panDrag = null;
                stageWrap.style.cursor = spaceDown ? 'grab' : '';
              });
            } catch(_) {}

            // Toolbar buttons (zoom in/out/reset) — optional helpers
            try {
              const btnIn = mount.querySelector('#zoomIn');
              const btnOut = mount.querySelector('#zoomOut');
              const btnReset = mount.querySelector('#resetView');
              const centerPointer = () => {
                const r = stageWrap.getBoundingClientRect();
                return { clientX: r.left + r.width/2, clientY: r.top + r.height/2 };
              };
              btnIn?.addEventListener('click', () => zoomAt(centerPointer(), 1.2));
              btnOut?.addEventListener('click', () => zoomAt(centerPointer(), 1/1.2));
              btnReset?.addEventListener('click', () => {
                VIEW.zoom = 1; VIEW.pan = { x: 0, y: 0 }; VP2D.view = { zoom: 1, pan: { x: 0, y: 0 } };
                try { render(); } catch(_) {}
                try { updateRulers(); } catch(_) {}
                try { layoutLabels2D(); } catch(_) {}
                try { overlayLabels.updateAll(); } catch(_) {}
              });
            } catch(_) {}
          })();
