  // ============== Postprocessing & Sketch mode ==============
  function threeEnsureComposer(){
    if (!threeCtx || !threeCtx.renderer || !threeCtx.scene || !threeCtx.camera) return;
    try {
      if (!THREE.EffectComposer || !THREE.RenderPass) return; // libs may not be loaded
    } catch(_) { return; }
    if (!threeCtx.composer){
      const rect = threeCtx.container.getBoundingClientRect();
      const w = Math.max(100, rect.width|0), h = Math.max(100, rect.height|0);
      const composer = new THREE.EffectComposer(threeCtx.renderer);
      const rp = new THREE.RenderPass(threeCtx.scene, threeCtx.camera);
      composer.addPass(rp);
      // Outline (general)
      let op = null;
      try {
        op = new THREE.OutlinePass(new THREE.Vector2(w, h), threeCtx.scene, threeCtx.camera);
        op.edgeStrength = 2.0;
        op.edgeGlow = 0.0;
        op.edgeThickness = 1.0;
        op.pulsePeriod = 0;
        op.visibleEdgeColor.set('#444');
        op.hiddenEdgeColor.set('#222');
        composer.addPass(op);
      } catch(_) {}
      // Outline (overflow, red)
      let op2 = null;
      try {
        op2 = new THREE.OutlinePass(new THREE.Vector2(w, h), threeCtx.scene, threeCtx.camera);
        op2.edgeStrength = 2.0;
        op2.edgeGlow = 0.0;
        op2.edgeThickness = 1.0;
        op2.pulsePeriod = 0;
        op2.visibleEdgeColor.set('#ff4d4f');
        op2.hiddenEdgeColor.set('#a61b1d');
        composer.addPass(op2);
      } catch(_) {}
      // Bloom (subtle, helps red overflow glow)
      let bp = null;
      try {
        bp = new THREE.UnrealBloomPass(new THREE.Vector2(w,h), 0.25, 0.6, 0.9);
        composer.addPass(bp);
      } catch(_) {}
      // FXAA for cleaner lines
      let fx = null;
      try {
        fx = new THREE.ShaderPass(THREE.FXAAShader);
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        fx.uniforms['resolution'].value.set(1/(w*dpr), 1/(h*dpr));
        composer.addPass(fx);
      } catch(_) {}
      threeCtx.composer = composer;
      threeCtx.passes.render = rp;
      threeCtx.passes.outline = op;
      threeCtx.passes.outlineOverflow = op2;
      threeCtx.passes.bloom = bp;
      threeCtx.passes.fxaa = fx;
    } else {
      // Keep passes' camera in sync
      try { threeCtx.passes.render.camera = threeCtx.camera; } catch(_) {}
      try { threeCtx.passes.outline.renderCamera = threeCtx.camera; } catch(_) {}
    }
  }

  function threeRefreshOutlineTargets(){
    if (!threeCtx || !threeCtx.passes || !threeCtx.passes.outline) return;
    const targets = [];
    try { if (threeCtx.meshes.hullMesh) targets.push(threeCtx.meshes.hullMesh); } catch(_) {}
    try {
      for (const m of (threeCtx.meshes.instanced || [])) targets.push(m);
      for (const [, m] of (threeCtx.meshes.items || [])) targets.push(m);
    } catch(_) {}
    try { threeCtx.passes.outline.selectedObjects = targets; } catch(_) {}
    // Overflow (red outline)
    try {
      const ov = [];
      for (const m of (threeCtx.meshes.overflow || [])) ov.push(m);
      if (threeCtx.passes.outlineOverflow) threeCtx.passes.outlineOverflow.selectedObjects = ov;
    } catch(_) {}
  }

  function threeRender(){
    if (!threeCtx || !threeCtx.renderer) return;
    if (threeCtx.state.sketch && threeCtx.composer) {
      try { threeCtx.composer.render(); return; } catch(_) {}
    }
    try { threeCtx.renderer.render(threeCtx.scene, threeCtx.camera); } catch(_) {}
  }

  function threeSetSketch(on){
    if (!threeCtx || !threeCtx.init) return;
    threeCtx.state.sketch = !!on;
    try { threeEnsureComposer(); } catch(_) {}
    if (threeCtx.state.sketch) {
      try { threeRefreshOutlineTargets(); } catch(_) {}
      try { threeCtx.renderer.setClearColor(0x000000, 0); } catch(_) {}
    } else {
      try { threeCtx.renderer.setClearColor(0x000000, 0); } catch(_) {}
    }
  }

          function ensure3DTooltip(){
            if (!threeCtx.init) return null;
            if (!threeCtx.ui.tooltip) {
              const tip = document.createElement('div');
              tip.id = 'vp3dTip';
              tip.style.position = 'absolute';
              tip.style.zIndex = '20';
              tip.style.pointerEvents = 'auto';
              tip.style.display = 'none';
              tip.style.maxWidth = '240px';
              tip.style.background = 'rgba(0,0,0,0.8)';
              tip.style.color = '#fff';
              tip.style.border = '1px solid rgba(255,255,255,0.15)';
              tip.style.borderRadius = '8px';
              tip.style.padding = '8px 10px';
              tip.style.font = '600 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif';
              threeCtx.container.appendChild(tip);
              threeCtx.ui.tooltip = tip;
            }
            return threeCtx.ui.tooltip;
          }
          function hide3DTooltip(){
            const tip = ensure3DTooltip();
            if (tip) tip.style.display = 'none';
          }
          function show3DTooltip(it, clientX, clientY){
            const tip = ensure3DTooltip();
            if (!tip || !it) return;
            const d2 = dims2D(it);
            const dims = `${d2.l}×${d2.w}×${it.H} cm`;
            const kg = `${Math.max(0, it.weight||0)} kg`;
            const typ = it.type || '—';
            const flags = it.flags||{};
            const fHtml = [
              flags.noStack ? '<span title="no‑stack" style="margin-right:6px">⛔</span>' : '',
              flags.fragile ? '<span title="fragile" style="margin-right:6px">🍷</span>' : ''
            ].join('');
            tip.innerHTML = `
              <div style=\"margin-bottom:4px\"><b>${t('dims_label')}:</b> ${dims}</div>
              <div style=\"margin-bottom:4px\"><b>${t('weight')}:</b> ${kg}</div>
              <div style=\"margin-bottom:6px\"><b>Typ:</b> ${typ} ${fHtml}</div>
              <div style=\"display:flex;gap:6px;justify-content:flex-end\">
                <button id=\"vp3dRot\" style=\"appearance:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer\">↻ ${t('rotateR') || t('rotate_right') || 'Rotate 90° right'}</button>
                <button id=\"vp3dMore\" class=\"vp3dMoreBtn\" style=\"appearance:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer\">${t('more_btn')}</button>
              </div>
            `;
            const rect = threeCtx.container.getBoundingClientRect();
            const x = Math.round(clientX - rect.left + 8);
            const y = Math.round(clientY - rect.top + 8);
            tip.style.left = `${x}px`;
            tip.style.top  = `${y}px`;
            tip.style.display = 'block';
            // Wire the button
            tip.querySelector('#vp3dMore')?.addEventListener('click', (e) => {
              e.stopPropagation();
              try {
                mount.dispatchEvent(new CustomEvent('showItemDetails', { detail: { itemId: it.id, item: JSON.parse(JSON.stringify(it)) } }));
              } catch(_) {}
            }, { once: true });
            tip.querySelector('#vp3dRot')?.addEventListener('click', (e) => {
              e.stopPropagation();
              state.selectedId = String(it.id);
              const ok = rotateSelectedStrict();
              if (!ok) return;
              try { threeUpdateItems(); } catch(_) {}
              try { threeUpdateGizmo(); } catch(_) {}
              try { overlayLabels.updateAll?.(); } catch(_) {}
            });
          }

          function threeAttachPicking(){
            if (!threeCtx.init || !threeCtx.renderer) return;
            const el = threeCtx.renderer.domElement;
            if (!el || el.__vpPickingInstalled) return;
            const ray = threeCtx.raycaster || new THREE.Raycaster();
            threeCtx.raycaster = ray;
            let dragMoved = false;
            function updateMouse(ev){
              const r = el.getBoundingClientRect();
              const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
              const ny = -((ev.clientY - r.top) / r.height) * 2 + 1;
              if (!threeCtx.mouse) threeCtx.mouse = new THREE.Vector2();
              threeCtx.mouse.set(nx, ny);
              return { nx, ny, rect: r };
            }
            el.addEventListener('pointermove', (ev) => {
              updateMouse(ev);
              if (threeCtx.drag) { dragMoved = true; threeUpdateDrag(ev); }
            });
            el.addEventListener('pointerdown', (ev) => {
              dragMoved = false;
              const { nx, ny } = updateMouse(ev);
              ray.setFromCamera({ x: nx, y: ny }, threeCtx.camera);
              const singles = Array.from(threeCtx.meshes.items.values());
              const insts = (threeCtx.meshes.instanced || []);
              const targets = singles.concat(insts);
              if (!targets.length) return;
              const hits = ray.intersectObjects(targets, true);
              if (!hits || !hits.length) return;
              const hit = hits[0];
              let m = hit.object;
              while (m && !m.userData?.itemId && !m.isInstancedMesh && m.parent) m = m.parent;
              let id = '';
              let meshType = 'mesh';
              let instIndex = -1;
              if (m && m.isInstancedMesh) {
                meshType = 'inst';
                instIndex = (hit.instanceId != null ? hit.instanceId : -1);
                const ids = m.userData?.ids || [];
                id = String(ids[instIndex] || '');
              } else {
                id = String(m?.userData?.itemId || '');
              }
              const it = (state.items || []).find(x => String(x.id) === id);
              if (!it) return;
              state.selectedId = id; dispatchSelectionChange(); try { threeUpdateGizmo(); } catch(_) {}
              threeStartDrag(ev, { id, meshType, target: m, instIndex });
            });
            el.addEventListener('pointerup', (ev) => {
              if (!threeCtx.drag) return;
              threeEndDrag(ev);
              if (!dragMoved) {
                try {
                  const it = (state.items || []).find(x => String(x.id) === String(state.selectedId||''));
                  if (it) show3DTooltip(it, ev.clientX, ev.clientY);
                } catch(_) {}
              }
            });
            // Hide tooltip on ESC or leaving 3D view
            threeCtx.container.addEventListener('mouseleave', hide3DTooltip);
            el.__vpPickingInstalled = true;
          }

          function threeBuildFloorGrid(L, W){
            // Remove previous
            for (const k of ['gridMinor','gridMajor']) {
              const old = threeCtx.meshes[k];
              if (old) { try { threeCtx.scene.remove(old); old.geometry?.dispose(); old.material?.dispose(); } catch(_) {} threeCtx.meshes[k] = null; }
            }
            // Helper to build line geometry for a set of segments
            function buildLines(positions){
              const geo = new THREE.BufferGeometry();
              const arr = new Float32Array(positions);
              geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
              const mat = new THREE.LineBasicMaterial({ color: 0x2a3958, transparent: true, opacity: 0.35 });
              return new THREE.LineSegments(geo, mat);
            }
            function buildPositions(step){
              const pos = [];
              // vertical lines along Z from z=0..W at x = 0..L
              for (let x=0; x<=L+1e-6; x+=step){
                pos.push(x, 0.0001, 0,  x, 0.0001, W);
              }
              // horizontal lines along X from x=0..L at z = 0..W
              for (let z=0; z<=W+1e-6; z+=step){
                pos.push(0, 0.0001, z,  L, 0.0001, z);
              }
              return pos;
            }
            // Minor grid (0.1 m)
            const minorPos = buildPositions(0.1);
            const minor = buildLines(minorPos);
            // Major grid (0.5 m) different color/opacity
            const majorPos = buildPositions(0.5);
            const majorGeo = new THREE.BufferGeometry();
            majorGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(majorPos), 3));
            const majorMat = new THREE.LineBasicMaterial({ color: 0x3a4d77, transparent: true, opacity: 0.8 });
            const major = new THREE.LineSegments(majorGeo, majorMat);

            threeCtx.scene.add(minor);
            threeCtx.scene.add(major);
            threeCtx.meshes.gridMinor = minor;
            threeCtx.meshes.gridMajor = major;
          }
