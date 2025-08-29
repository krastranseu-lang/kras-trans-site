          // ===================== Three.js 3D (real camera/controls) =====================
          const CM_TO_M = 0.01; // 1 m = 100 cm
          const threeCtx = {
            init: false,
            container: null,
            scene: null,
            camera: null,
            perspCam: null,
            orthoCam: null,
            renderer: null,
            controls: null,
            meshes: { vehicle: null, hullMesh: null, gridMinor: null, gridMajor: null, axes: null, items: new Map(), instanced: [], overflow: [] },
            materials: { pallet: null, fragile: null, noStack: null, default: null, instanced: null },
            raycaster: null,
            mouse: null,
            drag: null,
            instIndexMap: new Map(),
            gizmo: null,
            ui: { tooltip: null },
            raf: null,
            clippingPlane: null,
            state: { sectionEnabled: false, sectionPos: 0.5, activeLayer: 0, top2d: false, sketch: false },
            geoCache: new Map(),
            dummy: null,
            composer: null,
            passes: { render: null, outline: null, bloom: null, fxaa: null },
          };

          function threeInit(){
            try {
              if (threeCtx.init) return true;
              if (typeof THREE === 'undefined') { console.warn('THREE not loaded'); return false; }
              const cont = mount.querySelector('#view3d');
              if (!cont) return false;
              threeCtx.container = cont;
              const rect = cont.getBoundingClientRect();
              const w = Math.max(100, rect.width|0), h = Math.max(100, rect.height|0);

              const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
              // DPR capped for performance
              renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
              renderer.setSize(w, h);
              renderer.localClippingEnabled = true;
              // Quality: tone mapping and color space; keep shadows off by default
              try { renderer.toneMapping = THREE.ACESFilmicToneMapping; } catch(_) {}
              try { renderer.toneMappingExposure = 1.05; } catch(_) {}
              try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch(_) {}
              try { renderer.shadowMap.enabled = false; } catch(_) {}
              cont.innerHTML = '';
              cont.appendChild(renderer.domElement);

              const scene = new THREE.Scene();
              // Lighting: Hemisphere + Directional
              const hemi = new THREE.HemisphereLight(0xffffff, 0x0b1220, 0.6);
              scene.add(hemi);
              const dir = new THREE.DirectionalLight(0xffffff, 0.85);
              dir.position.set(3, 4, 5);
              scene.add(dir);

              // Cameras: perspective + orthographic (top-down)
              const persp = new THREE.PerspectiveCamera(50, w/h, 0.1, 5000);
              persp.position.set(6, 5, 6);
              const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 5000);
              ortho.position.set(0, 10, 0);
              ortho.up.set(0, 0, -1);
              ortho.lookAt(0, 0, 0);

              let controls = null;
              try { controls = new THREE.OrbitControls(persp, renderer.domElement); } catch(_) {}
              if (controls) {
                controls.enableDamping = true;
                controls.dampingFactor = 0.08;
                controls.enableZoom = true;
                controls.target.set(0, 0, 0);
                controls.update();
              }

              // Helpers
              const axes = new THREE.AxesHelper(2.0);
              scene.add(axes);

              threeCtx.scene = scene;
              threeCtx.camera = persp;
              threeCtx.perspCam = persp;
              threeCtx.orthoCam = ortho;
              threeCtx.renderer = renderer;
              threeCtx.controls = controls;
              threeCtx.meshes.axes = axes;
              threeCtx.raycaster = new THREE.Raycaster();
              threeCtx.mouse = new THREE.Vector2();
              threeCtx.init = true;
              threeCtx.dummy = new THREE.Object3D();

              // Prepare composer (post‑FX) lazily
              try { threeEnsureComposer(); } catch(_) {}

              // Global clipping plane for side section (YZ plane moving along X)
              threeCtx.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
              threeCtx.renderer.clippingPlanes = [];

              // First vehicle box
              threeUpdateVehicle();
              // Items
              threeUpdateItems();
              // Picking (hover/click)
              threeAttachPicking();

              const loop = () => {
                try {
                  if (threeCtx.controls) threeCtx.controls.update();
                  threeRender();
                } catch(_) {}
                threeCtx.raf = requestAnimationFrame(loop);
              };
              threeCtx.raf = requestAnimationFrame(loop);

              // Resize
              window.addEventListener('resize', threeResize);
              return true;
            } catch (e) {
              console.warn('threeInit failed', e);
              return false;
            }
          }

  function threeResize(){
    if (!threeCtx.init || !threeCtx.container) return;
    const rect = threeCtx.container.getBoundingClientRect();
    const w = Math.max(100, rect.width|0), h = Math.max(100, rect.height|0);
    try {
      // Update active camera
      if (threeCtx.camera && threeCtx.camera.isPerspectiveCamera) {
        threeCtx.camera.aspect = w / h;
        threeCtx.camera.updateProjectionMatrix();
      } else if (threeCtx.camera && threeCtx.camera.isOrthographicCamera) {
        // Keep ortho frustum ratios consistent
        threeFrameTopOrtho();
      }
      threeCtx.renderer.setSize(w, h);
      try { threeCtx.composer?.setSize(w, h); } catch(_) {}
      try {
        if (threeCtx.passes?.fxaa && threeCtx.renderer) {
          const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
          threeCtx.passes.fxaa.uniforms['resolution'].value.set(1/(w*dpr), 1/(h*dpr));
        }
      } catch(_) {}
    } catch(_) {}
  }

          // Switch active camera between perspective and orthographic top-down
  function threeSetCamera(kind){
            if (!threeCtx.init) return;
            const rect = threeCtx.container.getBoundingClientRect();
            const w = Math.max(100, rect.width|0), h = Math.max(100, rect.height|0);
            // Dispose old controls
            try { threeCtx.controls?.dispose?.(); } catch(_) {}
    if (kind === 'ortho') {
      threeCtx.camera = threeCtx.orthoCam;
              // Create controls for ortho camera (pan/zoom only)
              try {
                threeCtx.controls = new THREE.OrbitControls(threeCtx.camera, threeCtx.renderer.domElement);
                threeCtx.controls.enableRotate = false;
                threeCtx.controls.enableDamping = true;
                threeCtx.controls.dampingFactor = 0.08;
                threeCtx.controls.update();
              } catch(_) { threeCtx.controls = null; }
              threeFrameTopOrtho();
      try {
        if (threeCtx.passes?.render) threeCtx.passes.render.camera = threeCtx.camera;
        if (threeCtx.passes?.outline) threeCtx.passes.outline.renderCamera = threeCtx.camera;
      } catch(_) {}
    } else {
      // Perspective
      threeCtx.camera = threeCtx.perspCam;
      threeCtx.camera.aspect = w / h;
      threeCtx.camera.updateProjectionMatrix();
              try {
                threeCtx.controls = new THREE.OrbitControls(threeCtx.camera, threeCtx.renderer.domElement);
                threeCtx.controls.enableDamping = true;
                threeCtx.controls.dampingFactor = 0.08;
                threeCtx.controls.enableZoom = true;
                threeCtx.controls.target.set(0, 0, 0);
                threeCtx.controls.update();
              } catch(_) { threeCtx.controls = null; }
      try {
        if (threeCtx.passes?.render) threeCtx.passes.render.camera = threeCtx.camera;
        if (threeCtx.passes?.outline) threeCtx.passes.outline.renderCamera = threeCtx.camera;
      } catch(_) {}
      animateCameraTo('persp');
    }
  }

          // Compute XZ bounds (in meters) of current items or fallback to hull
          function computeItemsBoundsXZ(itemsArg){
            const v = vehicle();
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const items = (itemsArg || state.items || []).filter(it => it && !it.overflow);
            if (!items.length) {
              return { minX: -Lm/2, maxX: Lm/2, minZ: -Wm/2, maxZ: Wm/2 };
            }
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const it of items){
              const d = dims2D(it);
              const gl = Math.max(0, d.l) * CM_TO_M;
              const gw = Math.max(0, d.w) * CM_TO_M;
              const x0 = (-Lm/2) + (it.x||0) * CM_TO_M;
              const z0 = (-Wm/2) + (it.y||0) * CM_TO_M;
              const x1 = x0 + gl;
              const z1 = z0 + gw;
              if (x0 < minX) minX = x0;
              if (x1 > maxX) maxX = x1;
              if (z0 < minZ) minZ = z0;
              if (z1 > maxZ) maxZ = z1;
            }
            return { minX, maxX, minZ, maxZ };
          }

          // Fit orthographic camera to items' bounding box
          function threeFrameTopOrtho(margin = 1.12){
            if (!threeCtx.init) return;
            const cam = threeCtx.orthoCam;
            const rect = threeCtx.container.getBoundingClientRect();
            const aspect = Math.max(0.0001, rect.width / Math.max(1, rect.height));
            const v = vehicle();
            const Hm = (v?.inner_cm?.H || 0) * CM_TO_M;
            const b = computeItemsBoundsXZ();
            threeFrameTopToBounds(b, margin);
          }

          // Generic orthographic fit to provided bounds
  function threeFrameTopToBounds(bounds, margin = 1.12){
            if (!threeCtx.init) return;
            const cam = threeCtx.orthoCam;
            const rect = threeCtx.container.getBoundingClientRect();
            const aspect = Math.max(0.0001, rect.width / Math.max(1, rect.height));
            const v = vehicle();
            const Hm = (v?.inner_cm?.H || 0) * CM_TO_M;
            const b = bounds;
            const widthW = Math.max(0.1, (b.maxX - b.minX) * margin);
            const heightW = Math.max(0.1, (b.maxZ - b.minZ) * margin);
            let viewW = widthW, viewH = heightW;
            if (viewW / viewH > aspect) { viewH = viewW / aspect; } else { viewW = viewH * aspect; }
            const cx = (b.minX + b.maxX) / 2;
            const cz = (b.minZ + b.maxZ) / 2;
            cam.left = -viewW / 2; cam.right = viewW / 2; cam.top = viewH / 2; cam.bottom = -viewH / 2;
            cam.updateProjectionMatrix();
            cam.position.set(cx, Math.max(5, Hm + 1), cz);
            cam.lookAt(cx, 0, cz);
            cam.up.set(0, 0, -1);
          }

          // Compute length span along X for loaded items
          function computeLoadedSpan(items){
            // Optional items param; otherwise use current state
            const b = computeItemsBoundsXZ(items);
            return { minX: b.minX, maxX: b.maxX };
          }

          // Focus camera on a given X-span (and current Z bounds), keeping height
          function threeFocusLoaded(padding = 0.12){
            if (!threeCtx.init) return;
            const v = vehicle();
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Hm = (v?.inner_cm?.H || 0) * CM_TO_M;
            const b = computeItemsBoundsXZ();
            // If span covers almost all length, just overview
            const spanLen = Math.max(0, b.maxX - b.minX);
            if (spanLen <= 0.0001 || spanLen >= Lm * 0.92) { animateCameraTo('persp'); return; }
            // Expand span by padding
            const pad = Math.max(0, padding || 0);
            const cx = (b.minX + b.maxX) / 2;
            const cz = (b.minZ + b.maxZ) / 2;
            const dx = spanLen * (1 + pad);
            const dz = Math.max(0.1, (b.maxZ - b.minZ) * (1 + pad));
            // Compute distance to fit a sphere enclosing this sub-box
            const radius = 0.5 * Math.sqrt(dx*dx + dz*dz + Hm*Hm) * 1.12;
            const cam = threeCtx.perspCam;
            const fov = (cam?.fov || 50) * Math.PI / 180;
            const dist = radius / Math.sin(Math.max(0.0001, fov/2));
            const fromPos = threeCtx.camera.position.clone();
            const fromTgt = (threeCtx.controls?.target?.clone && threeCtx.controls.target.clone()) || new THREE.Vector3();
            const k = 0.72;
            const toPos = new THREE.Vector3(cx + dist*k, Hm*0.55 + dist*0.0, cz + dist*k);
            const toTgt = new THREE.Vector3(cx, Hm/2, cz);
            // Switch to perspective if not already
            threeSetCamera('persp');
            // Animate
            const t0 = (performance && performance.now) ? performance.now() : Date.now();
            const dur = 650;
            const ease = (t)=> (t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2);
            function step(){
              const now = (performance && performance.now) ? performance.now() : Date.now();
              const tt = Math.min(1, (now - t0) / dur);
              const kk = ease(tt);
              threeCtx.camera.position.lerpVectors(fromPos, toPos, kk);
              if (threeCtx.controls) {
                const tgt = new THREE.Vector3().lerpVectors(fromTgt, toTgt, kk);
                threeCtx.controls.target.copy(tgt);
                threeCtx.controls.update();
              }
              if (tt < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          }

          // Generic focus to provided X-span (meters). If top2d is active, fit ortho to that span + current Z bounds.
          function focusSpan(span, padding = 0.12){
            if (!threeCtx.init || !span) return;
            const v = vehicle();
            const Hm = (v?.inner_cm?.H || 0) * CM_TO_M;
            const bAll = computeItemsBoundsXZ();
            const b = { minX: span.minX, maxX: span.maxX, minZ: bAll.minZ, maxZ: bAll.maxZ };
            if (threeCtx.state.top2d) {
              threeSetCamera('ortho');
              threeFrameTopToBounds(b, 1 + Math.max(0, padding));
            } else {
              threeFocusLoaded(padding);
            }
          }

          // Enable/disable side section clipping and set plane position (0..1 along length)
          function threeSetSectionEnabled(on){
            if (!threeCtx.init) return;
            threeCtx.state.sectionEnabled = !!on;
            threeCtx.renderer.clippingPlanes = on ? [threeCtx.clippingPlane] : [];
            threeUpdateSectionPlane(threeCtx.state.sectionPos);
          }
          function threeUpdateSectionPlane(pos01){
            if (!threeCtx.init) return;
            const v = vehicle();
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const xClip = (-Lm/2) + Math.max(0, Math.min(1, pos01||0)) * Lm;
            threeCtx.state.sectionPos = Math.max(0, Math.min(1, pos01||0));
            if (threeCtx.clippingPlane) {
              // Plane eq: x - xClip >= 0 => keep rear part
              threeCtx.clippingPlane.set(new THREE.Vector3(1,0,0), -xClip);
            }
          }

          // Active layer: 0 = all; 1..3 -> filter by item mid-height within [h0,h1]
          function threeSetActiveLayer(layerIndex){
            threeCtx.state.activeLayer = Math.max(0, Math.min(3, layerIndex|0));
            threeUpdateItems();
          }

  function threeUpdateVehicle(){
            if (!threeCtx.init) return;
            const v = vehicle();
            const L = (v?.inner_cm?.L || 100) * CM_TO_M;
            const W = (v?.inner_cm?.W || 100) * CM_TO_M;
            const H = ((v?.inner_cm?.H ?? 200) || 200) * CM_TO_M; // default 2m if missing
            // remove old
            if (threeCtx.meshes.vehicle) {
              try { threeCtx.scene.remove(threeCtx.meshes.vehicle); threeCtx.meshes.vehicle.geometry?.dispose(); threeCtx.meshes.vehicle.material?.dispose(); } catch(_) {}
              threeCtx.meshes.vehicle = null;
            }
            if (threeCtx.meshes.hullMesh) {
              try { threeCtx.scene.remove(threeCtx.meshes.hullMesh); threeCtx.meshes.hullMesh.geometry?.dispose(); threeCtx.meshes.hullMesh.material?.dispose(); } catch(_) {}
              threeCtx.meshes.hullMesh = null;
            }
            // build box edges
            const geo = new THREE.BoxGeometry(L, H, W);
            const edges = new THREE.EdgesGeometry(geo);
            const mat = new THREE.LineBasicMaterial({ color: 0x83a1ff });
            const wire = new THREE.LineSegments(edges, mat);
            wire.position.set(0, H/2, 0); // floor at y=0
            threeCtx.scene.add(wire);
            threeCtx.meshes.vehicle = wire;
            // semi‑transparent walls (interior)
            const wallMat = new THREE.MeshBasicMaterial({ color: 0x83a1ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.BackSide });
            const hullMesh = new THREE.Mesh(geo, wallMat);
            hullMesh.position.set(0, H/2, 0);
            threeCtx.scene.add(hullMesh);
            threeCtx.meshes.hullMesh = hullMesh;

            // Grid (floor) with 0.1 m minor and 0.5 m major steps on XZ plane (Y up)
    threeBuildFloorGrid(L, W);
            // frame camera a bit out
            try {
              const cam = threeCtx.camera;
              const maxDim = Math.max(L, W, H);
              const dist = maxDim * 1.6 + 2.5;
              cam.position.set(dist, dist * 0.9, dist);
              if (threeCtx.controls) {
                threeCtx.controls.target.set(0, H/2, 0);
                threeCtx.controls.update();
              }
    } catch(_) {}

    // Update outline targets if sketch mode is on
    try { if (threeCtx.state.sketch) threeRefreshOutlineTargets(); } catch(_) {}
  }

  // Mark items as overflow if their dimensions exceed vehicle interior (L/W/H × stack)
  function enforceOverflowRules(){
    try {
      const v = vehicle();
      const L = v?.inner_cm?.L || 0;
      const W = v?.inner_cm?.W || 0;
      const H = v?.inner_cm?.H || 0;
      let changed = false;
      for (const it of (state.items || [])){
        if (!it) continue;
        const d = dims2D(it);
        const tooTall = (it.H || 0) * (it.stackCount || 1) > H + 1e-6;
        const tooWide = (d.w || 0) > W + 1e-6;
        const tooLong = (d.l || 0) > L + 1e-6;
        const ov = !!(tooTall || tooWide || tooLong);
        if (it.overflow !== ov) { it.overflow = ov; changed = true; }
      }
      if (changed) {
        try { if (threeCtx && threeCtx.init) threeUpdateItems(); } catch(_) {}
      }
    } catch(_) {}
  }

  // Compute scene bounds (vehicle + items) and return framing info
  function frameAll(margin = 1.15){
            const v = vehicle();
            const L = (v?.inner_cm?.L || 100) * CM_TO_M;
            const W = (v?.inner_cm?.W || 100) * CM_TO_M;
            const H = ((v?.inner_cm?.H ?? 200) || 200) * CM_TO_M;
            // Our cargo is centered at x=0,z=0; y spans [0..H]
            const center = new THREE.Vector3(0, H/2, 0);
            const size = new THREE.Vector3(L, H, W);
            const radius = 0.5 * Math.sqrt(L*L + H*H + W*W) * margin;
            // Distance to fit sphere by vertical FOV
            const cam = threeCtx.camera;
            const fov = (cam?.fov || 50) * Math.PI / 180;
            const dist = radius / Math.sin(Math.max(0.0001, fov/2));
            return { center, size, radius, dist };
          }

          // Smoothly animate camera + controls.target to a preset
          function animateCameraTo(preset = 'persp', ms = 650){
            if (!threeCtx.init || !threeCtx.camera) return;
            const { center, dist } = frameAll(1.18);
            const cam = threeCtx.camera;
            const ctr = threeCtx.controls;
            const fromPos = cam.position.clone();
            const fromTgt = (ctr?.target?.clone && ctr.target.clone()) || new THREE.Vector3();
            let toPos = fromPos.clone();
            let toTgt = center.clone();
            const up = new THREE.Vector3(0,1,0);
            // Choose direction vectors
            if (preset === 'top') {
              toPos = new THREE.Vector3(center.x, center.y + dist, center.z);
            } else if (preset === 'side') { // right side (+X)
              toPos = new THREE.Vector3(center.x + dist, center.y + dist*0.12, center.z);
            } else if (preset === 'rear') { // rear (-X)
              toPos = new THREE.Vector3(center.x - dist, center.y + dist*0.12, center.z);
            } else if (preset === 'rearLeft') { // 3/4 rear-left (−X, −Z)
              const k = 0.78;
              toPos = new THREE.Vector3(center.x - dist*k, center.y + dist*0.42, center.z - dist*0.52);
            } else { // perspective/isometric
              const k = 0.72;
              toPos = new THREE.Vector3(center.x + dist*k, center.y + dist*0.55, center.z + dist*k);
            }
            cam.up.copy(up);

            const t0 = (performance && performance.now) ? performance.now() : Date.now();
            const dur = Math.max(100, ms|0);
            const ease = (t)=> (t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2); // cubic in/out
            function step(){
              const now = (performance && performance.now) ? performance.now() : Date.now();
              const tt = Math.min(1, (now - t0) / dur);
              const k = ease(tt);
              cam.position.lerpVectors(fromPos, toPos, k);
              if (ctr) {
                const tgt = new THREE.Vector3().lerpVectors(fromTgt, toTgt, k);
                ctr.target.copy(tgt);
                ctr.update();
              }
              if (tt < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          }

          // Helpers for colors
          function isPalletType(t){
            if (!t) return false;
            return /(eur|pallet|palet|plt|epal|eur|paleta)/i.test(String(t));
          }
          function hslToHex(h, s, l){
            // h in [0..360], s,l in [0..100]
            const hh = ((+h)%360)/360, ss = Math.max(0, Math.min(1, (+s)/100)), ll = Math.max(0, Math.min(1, (+l)/100));
            const c = (1 - Math.abs(2*ll - 1)) * ss;
            const x = c * (1 - Math.abs((hh * 6) % 2 - 1));
            const m = ll - c/2;
            let r=0,g=0,b=0;
            if (hh < 1/6) { r=c; g=x; b=0; }
            else if (hh < 2/6) { r=x; g=c; b=0; }
            else if (hh < 3/6) { r=0; g=c; b=x; }
            else if (hh < 4/6) { r=0; g=x; b=c; }
            else if (hh < 5/6) { r=x; g=0; b=c; }
            else { r=c; g=0; b=x; }
            const R = Math.round((r+m)*255), G = Math.round((g+m)*255), B = Math.round((b+m)*255);
            const toHex = (n) => n.toString(16).padStart(2, '0');
            return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
          }
          function colorFromItem(it){
            // Flags override
            if (it?.flags?.fragile) return '#ef4444'; // warm
            if (it?.flags?.noStack || it?.stackable === false) return '#3b82f6'; // cool
            // Pallet-like types -> neutral
            if (isPalletType(it?.type)) return '#a0aec0';
            // fallback to deterministic HSL from 2D color
            try {
              const hsl = getItemColor(it); // e.g., hsl(h,s%,l%)
              const m = /hsl\((\d+),\s*(\d+)%\,\s*(\d+)%\)/.exec(hsl);
              if (m) return hslToHex(+m[1], +m[2], +m[3]);
            } catch(_) {}
            return '#7c9cf5';
          }

          function disposeItemMeshes(){
            try {
              if (!threeCtx.meshes.items) return;
              for (const [, mesh] of threeCtx.meshes.items) {
                try {
                  threeCtx.scene.remove(mesh);
                  // Geometry is cached and reused; do not dispose here
                } catch(_) {}
              }
              threeCtx.meshes.items.clear();
            } catch(_) {}
          }

  function disposeInstancedMeshes(){
            try {
              const arr = threeCtx.meshes.instanced || [];
              for (const m of arr) {
                try {
                  threeCtx.scene.remove(m);
                  // Geometry comes from cache; do not dispose here
                } catch(_) {}
              }
              threeCtx.meshes.instanced = [];
            } catch(_) {}
          }

  function ensureItemMaterials(){
    const M = threeCtx.materials;
    if (!M.pallet)   M.pallet   = new THREE.MeshLambertMaterial({ color: 0xa0aec0 });
    if (!M.fragile)  M.fragile  = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    if (!M.noStack)  M.noStack  = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
    if (!M.default)  M.default  = new THREE.MeshLambertMaterial({ color: 0x7c9cf5 });
    if (!M.instanced) M.instanced = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (!M.overflow) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xff4d4f, emissive: 0xff5555, emissiveIntensity: 2.0, roughness: 0.6, metalness: 0.0, transparent: true, opacity: 0.92 });
      M.overflow = mat;
    }
  }

  function disposeOverflowMeshes(){
    try {
      const arr = threeCtx.meshes.overflow || [];
      for (const m of arr) {
        try { threeCtx.scene.remove(m); } catch(_) {}
      }
      threeCtx.meshes.overflow = [];
    } catch(_) {}
  }

          function getBoxGeometryCached(gl, gh, gw){
            const key = `${gl.toFixed(6)}|${gh.toFixed(6)}|${gw.toFixed(6)}`;
            const cache = threeCtx.geoCache;
            if (!cache.has(key)) cache.set(key, new THREE.BoxGeometry(gl, gh, gw));
            return cache.get(key);
          }

          function pickMaterialFor(it){
            ensureItemMaterials();
            if (it?.flags?.fragile) return threeCtx.materials.fragile;
            if (it?.flags?.noStack || it?.stackable === false) return threeCtx.materials.noStack;
            if (isPalletType(it?.type)) return threeCtx.materials.pallet;
            // Fallback: create on-the-fly material from derived color (cache by hex)
            const hex = colorFromItem(it);
            const key = `dyn:${hex}`;
            if (!threeCtx.materials[key]) threeCtx.materials[key] = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
            return threeCtx.materials[key];
          }

  function threeUpdateItems(){
    if (!threeCtx.init) return;
    const v = vehicle();
    const L = (v?.inner_cm?.L || 0) * CM_TO_M;
    const W = (v?.inner_cm?.W || 0) * CM_TO_M;
    const H = (v?.inner_cm?.H || 0);
    // clear previous
    disposeItemMeshes();
    disposeInstancedMeshes();
    disposeOverflowMeshes();
    threeCtx.instIndexMap = new Map();

            // Filter items (skip overflow and layer filter)
            const include = [];
    for (const it of (state.items || [])){
      if (!it || it.overflow) continue;
              const hTotal = Math.max(0, (it.H || 0) * (it.stackCount || 1));
              if (threeCtx.state.activeLayer > 0) {
                const layerH = Math.max(1, H) / 3;
                const idx = threeCtx.state.activeLayer - 1;
                const h0 = idx * layerH;
                const h1 = (idx + 1) * layerH;
                const mid = hTotal / 2;
                if (!(mid > h0 && mid <= h1)) continue;
              }
              include.push(it);
            }

            // Group by geometry dimensions (meters)
            const groups = new Map(); // key -> { gl, gw, gh, items: [] }
            for (const it of include){
              const d = dims2D(it);
              const gl = Math.max(0.001, d.l * CM_TO_M);
              const gw = Math.max(0.001, d.w * CM_TO_M);
              const gh = Math.max(0.001, (it.H * (it.stackCount || 1)) * CM_TO_M);
              const key = `${gl.toFixed(6)}|${gw.toFixed(6)}|${gh.toFixed(6)}`;
              if (!groups.has(key)) groups.set(key, { gl, gw, gh, items: [] });
              groups.get(key).items.push(it);
            }

            ensureItemMaterials();
            const dummy = threeCtx.dummy || new THREE.Object3D();
            const instancedMat = threeCtx.materials.instanced;

            for (const { gl, gw, gh, items } of groups.values()){
              if (items.length >= 2){
                const geo = getBoxGeometryCached(gl, gh, gw);
                const count = items.length;
                const inst = new THREE.InstancedMesh(geo, instancedMat, count);
                const ids = [];
                for (let i=0;i<count;i++){
                  const it = items[i];
                  const cx = (-L/2) + ((it.x || 0) * CM_TO_M) + gl/2;
                  const cz = (-W/2) + ((it.y || 0) * CM_TO_M) + gw/2;
                  const cy = gh / 2;
                  dummy.position.set(cx, cy, cz);
                  dummy.rotation.set(0, 0, 0);
                  dummy.updateMatrix();
                  inst.setMatrixAt(i, dummy.matrix);
                  // Per-instance color
                  try {
                    const hex = colorFromItem(it);
                    const col = new THREE.Color(hex);
                    inst.setColorAt(i, col);
                  } catch(_) {}
                  ids.push(String(it.id));
                  try { threeCtx.instIndexMap.set(String(it.id), { inst, index: i }); } catch(_) {}
                }
                try { inst.instanceMatrix.needsUpdate = true; } catch(_) {}
                try { inst.instanceColor && (inst.instanceColor.needsUpdate = true); } catch(_) {}
                inst.userData.ids = ids;
                threeCtx.scene.add(inst);
                threeCtx.meshes.instanced.push(inst);
              } else {
                // Single item -> regular mesh but reuse cached geometry + shared materials
                const it = items[0];
                const geo = getBoxGeometryCached(gl, gh, gw);
                const mat = pickMaterialFor(it);
                const mesh = new THREE.Mesh(geo, mat);
                const cx = (-L/2) + ((it.x || 0) * CM_TO_M) + gl/2;
                const cz = (-W/2) + ((it.y || 0) * CM_TO_M) + gw/2;
                const cy = gh / 2;
                mesh.position.set(cx, cy, cz);
                mesh.userData.itemId = String(it.id);
                threeCtx.scene.add(mesh);
                threeCtx.meshes.items.set(String(it.id), mesh);
              }
    }
    try { threeUpdateGizmo(); } catch(_) {}

    // Update outline targets if sketch mode is on
    try { if (threeCtx.state.sketch) threeRefreshOutlineTargets(); } catch(_) {}

    // Render overflow items outside the hull with red glow
    try {
      const ov = (state.items || []).filter(it => it && it.overflow);
      ensureItemMaterials();
      for (const it of ov){
        const d = dims2D(it);
        const gl = Math.max(0.001, d.l * CM_TO_M);
        const gw = Math.max(0.001, d.w * CM_TO_M);
        const gh = Math.max(0.001, (it.H * (it.stackCount || 1)) * CM_TO_M);
        const geo = getBoxGeometryCached(gl, gh, gw);
        const mesh = new THREE.Mesh(geo, threeCtx.materials.overflow);
        // place just behind the rear (−X)
        const x = (-L/2) - gl/2 - 0.05;
        const z = 0;
        mesh.position.set(x, gh/2, z);
        mesh.userData.itemId = String(it.id);
        threeCtx.scene.add(mesh);
        threeCtx.meshes.overflow.push(mesh);
      }
    } catch(_) {}

    // Refresh outline selections if needed
    try { if (threeCtx.state.sketch) threeRefreshOutlineTargets(); } catch(_) {}
  }

