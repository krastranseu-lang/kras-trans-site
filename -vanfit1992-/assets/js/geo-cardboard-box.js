          // ===================== Cardboard Box (FEFCO 0201‑like) =====================
          // createBox({L,W,H,t=3, massKg=0, stackable=true, maxStack=0, label='BOX'})
          // Units: mm. Pivot: base‑center (x/z center, y at floor). Returns { group, box }.
          function createBox({ L = 600, W = 400, H = 350, t = 3, massKg = 0, stackable = true, maxStack = 0, label = 'BOX' } = {}) {
            if (typeof THREE === 'undefined') throw new Error('THREE not available');
            // Guard for minimum wall thickness vs outer dims
            const tw = Math.max(0.5, +t || 3);
            const mm = (v) => (v || 0) * 0.001; // mm -> m
            const halfL = L / 2, halfW = W / 2;
            const innerL = Math.max(1, L - 2 * tw);
            const innerW = Math.max(1, W - 2 * tw);
            const innerH = Math.max(1, H - 2 * tw);

            const grp = new THREE.Group();
            grp.name = 'Box-0201';
            // Cardboard material
            const matCard = new THREE.MeshStandardMaterial({ color: 0xD2AA74, roughness: 0.88, metalness: 0.02 });
            const matCardDark = new THREE.MeshStandardMaterial({ color: 0xB8905E, roughness: 0.9, metalness: 0.02 });

            function addPart(xMM, yMM, zMM, cxMM, cyMM, czMM, mat) {
              const geo = new THREE.BoxGeometry(mm(xMM), mm(yMM), mm(zMM));
              const mesh = new THREE.Mesh(geo, mat);
              mesh.position.set(mm(cxMM), mm(cyMM), mm(czMM));
              mesh.castShadow = true; mesh.receiveShadow = true;
              grp.add(mesh);
              return mesh;
            }

            // Four side walls (outer envelope LxWxH with thickness tw)
            // Long walls (thickness along Z)
            addPart(L, H, tw, 0, H / 2,  halfW - tw / 2, matCard);
            addPart(L, H, tw, 0, H / 2, -halfW + tw / 2, matCard);
            // Short walls (thickness along X)
            addPart(tw, H, W,  halfL - tw / 2, H / 2, 0, matCard);
            addPart(tw, H, W, -halfL + tw / 2, H / 2, 0, matCard);

            // Bottom flaps (closed) – 2 panels meeting at centerline (no visible gap)
            const botY = tw / 2; // plate center from floor
            addPart(innerL, tw, innerW / 2, 0, botY, -innerW / 4, matCardDark);
            addPart(innerL, tw, innerW / 2, 0, botY,  innerW / 4, matCardDark);

            // Top flaps (closed)
            const topY = H - tw / 2;
            addPart(innerL, tw, innerW / 2, 0, topY, -innerW / 4, matCardDark);
            addPart(innerL, tw, innerW / 2, 0, topY,  innerW / 4, matCardDark);

            // User metadata
            grp.userData = Object.assign({}, grp.userData, {
              kind: 'box0201',
              outer_mm: { L, W, H },
              wall_mm: tw,
              massKg: +massKg || 0,
              stackable: !!stackable,
              maxStack: Math.max(0, maxStack|0),
              label: String(label || 'BOX')
            });

            // Bounds (world‑independent now; update again after positioning if needed)
            grp.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(grp);
            return { group: grp, box };
          }

          // Helper: place object with base‑pivot on top of base object (by Box3)
          function placeOnTopOf(baseObj, obj, dxMM = 0, dzMM = 0) {
            const mm = (v) => (v || 0) * 0.001;
            const b = new THREE.Box3().setFromObject(baseObj);
            const topY = b.max.y; // world Y of base top
            obj.position.set((baseObj.position.x || 0) + mm(dxMM), topY + (obj.position.y||0), (baseObj.position.z || 0) + mm(dzMM));
          }

          // Convenience: add a box to scene at floor or at given mm offset
          function threeAddBox(opts = {}, pos = { x: 0, y: 0, z: 0 }) {
            if (!threeCtx || !threeCtx.scene) throw new Error('3D scene not initialised');
            const mm = (v) => (v || 0) * 0.001;
            const res = createBox(opts);
            res.group.position.set(mm(pos.x || 0), mm(pos.y || 0), mm(pos.z || 0));
            threeCtx.scene.add(res.group);
            return res;
          }

          try { window.createBox = createBox; window.threeAddBox = threeAddBox; window.placeOnTopOf = placeOnTopOf; } catch(_) {}
          mount.querySelectorAll('[data-act="undo"]').forEach((b)=> b.addEventListener('click', undo));
          mount.querySelectorAll('[data-act="redo"]').forEach((b)=> b.addEventListener('click', redo));
          mount
            .querySelector('[data-act="autopack"]')
            .addEventListener("click", () => autopackUltra(0, true));
          mount
            .querySelector('[data-act="altpack"]')
            .addEventListener("click", () =>
              autopackUltra((Math.random() * 100) | 0, true)
            );
          mount
            .querySelector('[data-act="compare"]')
            .addEventListener("click", () => {
              state.compareOn = !state.compareOn;
              renderAll();
            });
          mount
            .querySelector('[data-act="stackAll"]')
            .addEventListener("click", stackAll);
          mount
            .querySelector('[data-act="prevVar"]')
            .addEventListener("click", () =>
              applyVariant(state.variants.index - 1)
            );
          mount
            .querySelector('[data-act="nextVar"]')
            .addEventListener("click", () =>
              applyVariant(state.variants.index + 1)
            );
          mount
            .querySelector('[data-act="reset"]')
            .addEventListener("click", async (ev) => {
              const btn = ev.currentTarget;
              const msg = (typeof t === 'function' ? (t('confirm_clear_all') || 'Wyczyścić wszystkie elementy?') : 'Wyczyścić wszystkie elementy?');
              const ok = await (typeof confirmPopover === 'function' ? confirmPopover({ anchor: btn, text: msg }) : Promise.resolve(window.confirm(msg)));
              if (!ok) return;
              pushHistory();
              state.items = [];
              state.selectedId = null;
              state.variants = { plans: [], index: 0 };
              renderAll();
            });
          mount
            .querySelector('[data-act="save"]')
            .addEventListener("click", saveLocal);
          mount
            .querySelector('[data-act="share"]')
            .addEventListener("click", shareLink);
          mount
            .querySelector('[data-act="rotR"]')
            .addEventListener("click", () => rotateSelected(+1));
          mount
            .querySelectorAll('[data-act="delete"]')
            .forEach((b) => b.addEventListener("click", async (ev) => {
              const btn = ev.currentTarget;
              const msg = (typeof t === 'function' ? ((t('deleteSel')||'Delete selected') + '?') : 'Delete selected?');
              const ok = await (typeof confirmPopover === 'function' ? confirmPopover({ anchor: btn, text: msg }) : Promise.resolve(window.confirm(msg)));
              if (!ok) return;
              deleteSelected();
            }));

          // 3D Camera preset buttons
          try {
            mount.querySelector('[data-act="camTop"]').addEventListener('click', () => animateCameraTo('top'));
            mount.querySelector('[data-act="camSide"]').addEventListener('click', () => animateCameraTo('side'));
            mount.querySelector('[data-act="camRear"]').addEventListener('click', () => animateCameraTo('rear'));
            mount.querySelector('[data-act="camRearLeft"]').addEventListener('click', () => animateCameraTo('rearLeft'));
            mount.querySelector('[data-act="camPersp"]').addEventListener('click', () => animateCameraTo('persp'));
            // Overview frames the whole scene (perspective)
            mount.querySelector('[data-act="camOverview"]').addEventListener('click', () => {
              threeCtx.state.top2d = false;
              threeSetCamera('persp');
              animateCameraTo('persp');
            });
            // Show whole (alias): if top2d then fit to hull, else perspective overview
            mount.querySelector('[data-act="camAll"]').addEventListener('click', () => {
              if (threeCtx.state.top2d) {
                const v = vehicle();
                const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
                const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
                threeSetCamera('ortho');
                threeFrameTopToBounds({ minX: -Lm/2, maxX: Lm/2, minZ: -Wm/2, maxZ: Wm/2 }, 1.08);
              } else {
                threeSetCamera('persp');
                animateCameraTo('persp');
              }
            });
            // Show loaded span: top2d frames to loaded bounds; persp focuses span along X
            mount.querySelector('[data-act="camLoaded"]').addEventListener('click', () => {
              if (threeCtx.state.top2d) {
                threeSetCamera('ortho');
                const b = computeItemsBoundsXZ();
                threeFrameTopToBounds(b, 1.1);
              } else {
                threeFocusLoaded(0.12);
              }
            });
            // Side section toggle (global clipping plane)
            const sectionBtn = mount.querySelector('[data-act="sectionToggle"]');
            sectionBtn.addEventListener('click', () => {
              const on = !threeCtx.state.sectionEnabled;
              threeSetSectionEnabled(on);
              if (sectionSlider) sectionSlider.style.display = on ? 'inline-block' : 'none';
            });
            if (sectionSlider) {
              sectionSlider.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value || '50') / 100;
                threeUpdateSectionPlane(v);
              });
            }
            // Layers: 1/2/3 and All
            mount.querySelector('[data-act="layer1"]').addEventListener('click', () => threeSetActiveLayer(1));
            mount.querySelector('[data-act="layer2"]').addEventListener('click', () => threeSetActiveLayer(2));
            mount.querySelector('[data-act="layer3"]').addEventListener('click', () => threeSetActiveLayer(3));
            mount.querySelector('[data-act="layerAll"]').addEventListener('click', () => threeSetActiveLayer(0));
            // Top view 2D: orthographic camera
            const topBtn = mount.querySelector('[data-act="top2d"]');
            topBtn.addEventListener('click', () => {
              threeCtx.state.top2d = !threeCtx.state.top2d;
              if (threeCtx.state.top2d) {
                topBtn.textContent = t('view_perspective');
                threeSetCamera('ortho');
              } else {
                topBtn.textContent = t('top2d');
                threeSetCamera('persp');
              }
            });
          } catch(_) {}

          // Brakujące akcje przycisków Piętrowanie +/− (obok wybranego elementu)
          mount
            .querySelector('[data-act="stack-+"]')
            ?.addEventListener("click", () => changeStack(+1));
          mount
            .querySelector('[data-act="stack--"]')
            ?.addEventListener("click", () => changeStack(-1));

          
