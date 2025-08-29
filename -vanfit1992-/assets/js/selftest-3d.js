  // ===================== SELF TEST: 3D =====================
  function selfTest3D(){
    try {
      const log = (name, ok, msg='') => console.log(`[${ok?'PASS':'FAIL'} ${name}]${msg? ' '+msg:''}`);
      // Backup current state and view
      const backup = {
        items: deepClone(state.items),
        sel: state.selectedId,
        mode: state.viewMode,
        top2d: (threeCtx && threeCtx.state ? threeCtx.state.top2d : false),
        sectionOn: (threeCtx && threeCtx.state ? threeCtx.state.sectionEnabled : false),
        sectionPos: (threeCtx && threeCtx.state ? threeCtx.state.sectionPos : 0.5),
      };

      // Ensure 3D mode and init
      state.viewMode = '3d'; renderAll(); threeInit(); threeUpdateVehicle();

      // Create a unique single item to avoid instancing
      const it = { id: 'test3d_one', type: 'test', L: 123, W: 77, H: 50, weight: 10, stackCount: 1, x: 10, y: 10, rot: 0 };
      state.items = [it]; state.selectedId = it.id; renderAll();
      let okRender = false;
      try { threeCtx.renderer.render(threeCtx.scene, threeCtx.camera); okRender = true; } catch(_) { okRender = false; }
      log('3D render', okRender);

      // frameAll + focusSpan API smoke
      try { frameAll(1.10); const span = computeLoadedSpan(); focusSpan(span, 0.10); log('frameAll+focusSpan', true); } catch(e) { log('frameAll+focusSpan', false, e?.message||''); }

      // Raycast should return the item
      try {
        threeUpdateItems();
        const v = vehicle();
        const d = dims2D(it);
        const gl = d.l * CM_TO_M, gw = d.w * CM_TO_M, gh = (it.H * it.stackCount) * CM_TO_M;
        const L = (v?.inner_cm?.L||0) * CM_TO_M, W = (v?.inner_cm?.W||0) * CM_TO_M;
        const cx = (-L/2) + (it.x||0)*CM_TO_M + gl/2;
        const cy = gh/2;
        const cz = (-W/2) + (it.y||0)*CM_TO_M + gw/2;
        const p = new THREE.Vector3(cx, cy, cz).project(threeCtx.camera);
        const ray = threeCtx.raycaster; ray.setFromCamera({ x: p.x, y: p.y }, threeCtx.camera);
        const singles = Array.from(threeCtx.meshes.items.values());
        const insts = (threeCtx.meshes.instanced || []);
        const hits = ray.intersectObjects(singles.concat(insts), true);
        let hitId = '';
        if (hits && hits.length) {
          let m = hits[0].object; while (m && !m.userData?.itemId && !m.isInstancedMesh && m.parent) m = m.parent;
          if (m && m.isInstancedMesh) {
            const idx = (hits[0].instanceId != null ? hits[0].instanceId : -1);
            const ids = m.userData?.ids || []; hitId = String(ids[idx] || '');
          } else { hitId = String(m?.userData?.itemId || ''); }
        }
        log('raycast item', hitId === it.id);
      } catch(e) { log('raycast item', false, e?.message||''); }

      // Top view 2D camera
      try { threeSetCamera('ortho'); const ok = !!(threeCtx.camera && threeCtx.camera.isOrthographicCamera); log('top view 2D', ok); } catch(e) { log('top view 2D', false, e?.message||''); }

      // Clipping plane movement
      try {
        threeSetSectionEnabled(true); threeUpdateSectionPlane(0.33);
        const ok = threeCtx.state.sectionEnabled && Math.abs(threeCtx.state.sectionPos - 0.33) < 1e-3 && (threeCtx.renderer.clippingPlanes||[]).length > 0;
        log('clipping plane', ok);
      } catch(e) { log('clipping plane', false, e?.message||''); }

      // Performance: N=300 boxes, ~>30 FPS on desktop (approx)
      try {
        const dev = getDevice();
        const N = 300; const v = vehicle();
        const cell = 10; // cm
        const cols = Math.max(1, Math.floor(v.inner_cm.L / cell));
        const rows = Math.max(1, Math.floor(v.inner_cm.W / cell));
        const many = [];
        for (let i=0;i<N;i++){
          const x = (i % cols) * cell;
          const y = Math.floor(i / cols) * cell;
          if (y + cell > v.inner_cm.W) break; // keep within
          many.push({ id: `p${i}`, type: 'bulk', L: cell, W: cell, H: 10, weight: 1, stackCount: 1, x, y, rot: 0 });
        }
        state.items = many; renderAll();
        const t0 = (performance && performance.now) ? performance.now() : Date.now();
        threeUpdateItems();
        const t1 = (performance && performance.now) ? performance.now() : Date.now();
        threeCtx.renderer.render(threeCtx.scene, threeCtx.camera);
        const t2 = (performance && performance.now) ? performance.now() : Date.now();
        const drawMs = t2 - t1; // render cost
        const ok = dev !== 'desktop' ? true : drawMs <= 33; // ~30 FPS
        log(`perf 300 (render ${drawMs.toFixed(1)} ms)`, ok);
      } catch(e) { log('perf 300', false, e?.message||''); }

      // Restore prior state
      state.items = backup.items; state.selectedId = backup.sel; state.viewMode = backup.mode;
      if (threeCtx && threeCtx.state) { threeCtx.state.top2d = backup.top2d; threeSetSectionEnabled(backup.sectionOn); threeUpdateSectionPlane(backup.sectionPos); }
      renderAll();
    } catch(e) {
      console.warn('[selfTest3D] unexpected', e);
    }
  }

          // Shortcuts (global) — honor typing contexts (inputs/textarea/contenteditable)
          window.addEventListener("keydown", (e) => {
            const t = e.target;
            const tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
            const isTyping = !!t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA');
            // If user types inside an input/textarea (e.g., bulkText), do not hijack clipboard or other keys
            if (isTyping) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
              e.preventDefault();
              copySelected();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
              e.preventDefault();
              pasteClipboard();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
              e.preventDefault();
              undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
              e.preventDefault();
              redo();
            }
            if (e.key === "R" || e.key === "r") rotateSelected(+1);
            try { overlayLabels.updateAll(); } catch(_){}
            if (e.key === "Delete") {
              deleteSelected();
            }
            if (e.key === "+" || e.key === "=") {
              changeStack(+1);
            }
            if (e.key === "-") {
              changeStack(-1);
            }
            if (
              e.key === "ArrowLeft" &&
              e.shiftKey &&
              (e.metaKey || e.ctrlKey)
            ) {
              applyVariant(state.variants.index - 1);
            }
            if (
              e.key === "ArrowRight" &&
              e.shiftKey &&
              (e.metaKey || e.ctrlKey)
            ) {
              applyVariant(state.variants.index + 1);
            }
          });

          // Convenience: in bulk input allow Cmd/Ctrl+Enter to analyze and add
          try {
            bulkText.addEventListener('keydown', (e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                bulkAdd?.click();
              }
            });
          } catch(_) {}

  firstTimeInit();
  // Ensure language button reflects current language after state/URL load
  try {
    (function(){
      const btn = mount.querySelector('#lang-trigger');
      const pop = mount.querySelector('#lang-popover');
      const FLAGS = { pl:'🇵🇱', ru:'🇷🇺', uk:'🇺🇦', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', en:'🇬🇧' };
      const CODEMAP = { uk: 'UA' };
      if (btn) {
        btn.querySelector('.hdr-flag').textContent = FLAGS[lang] || '🏳️';
        btn.querySelector('.hdr-lang-code').textContent = (CODEMAP[lang] || lang || 'pl').toUpperCase();
        pop?.querySelectorAll('[role="menuitemradio"]').forEach(el=>{
          const on = el.getAttribute('data-lang') === lang; el.setAttribute('aria-checked', String(on));
        });
      }
    })();
  } catch(_) {}
  try { installViewportKeys(); } catch(_) {}
  // Observe only viewport size to re-layout positions; font size stays CSS-driven (vw)
  try {
    const vp = mount.querySelector('#viewport');
    if (vp && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(() => {
        try { overlayLabels.updateAll(); } catch(_) {}
        try { layoutLabels2D(); } catch(_) {}
      });
      ro.observe(vp);
    }
