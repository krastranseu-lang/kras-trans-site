          // ===================== EPAL Pallet (blocky) =====================
          // createPallet({L=1200, W=800, H=144}) in millimeters.
          // Returns: { group: THREE.Group, box: THREE.Box3 }
          // - Geometry: 9 blocks + 3 bottom boards + 5 top boards (rough sizes)
          // - Pivot: base-center (x/z center, y at floor plane)
          function createPallet({ L = 1200, W = 800, H = 144, tTop = 22, tBot = 22, blockL = 145, blockW = 100 } = {}) {
            if (typeof THREE === 'undefined') throw new Error('THREE not available');
            const mm = (v) => (v || 0) * 0.001; // mm -> meters
            const grp = new THREE.Group();
            grp.name = 'EPAL-pallet';

            // Materials (matte wood variants)
            const matWood = new THREE.MeshStandardMaterial({ color: 0xB68C5A, roughness: 0.88, metalness: 0.03 });
            const matWoodDark = new THREE.MeshStandardMaterial({ color: 0x9C7A4F, roughness: 0.9, metalness: 0.02 });

            // Derived heights
            const blockH = Math.max(10, H - tTop - tBot); // mm
            const halfL = L / 2;
            const halfW = W / 2;

            // Helper to add a board (length along X, width along Z, thickness along Y)
            function addBoard(lenMM, thickMM, widthMM, cxMM, cyMM, czMM, mat) {
              const geo = new THREE.BoxGeometry(mm(lenMM), mm(thickMM), mm(widthMM));
              const mesh = new THREE.Mesh(geo, mat);
              mesh.position.set(mm(cxMM), mm(cyMM), mm(czMM));
              mesh.castShadow = true; mesh.receiveShadow = true;
              grp.add(mesh);
              return mesh;
            }

            // 1) Bottom deck: 3 boards spanning full length (equally split across width)
            const botY = tBot / 2; // center of thickness from floor
            const botW = W / 3;    // each board covers ~1/3 width
            for (let i = 0; i < 3; i++) {
              const cz = -halfW + (i + 0.5) * botW;
              addBoard(L, tBot, botW, 0, botY, cz, matWoodDark);
            }

            // 2) Blocks: 3 × 3 grid (rough placement with small edge margins)
            const marginX = 25, marginZ = 25; // mm, edge offsets
            const blkY = tBot + blockH / 2;
            const colX = [ -halfL + blockL / 2 + marginX, 0, halfL - blockL / 2 - marginX ];
            const rowZ = [ -halfW + blockW / 2 + marginZ, 0, halfW - blockW / 2 - marginZ ];
            for (const x of colX) {
              for (const z of rowZ) {
                addBoard(blockL, blockH, blockW, x, blkY, z, matWood);
              }
            }

            // 3) Top deck: 5 boards spanning full length (equally split across width)
            const topY = tBot + blockH + tTop / 2;
            const topW = W / 5;
            for (let i = 0; i < 5; i++) {
              const cz = -halfW + (i + 0.5) * topW;
              addBoard(L, tTop, topW, 0, topY, cz, matWoodDark);
            }

            // Compute local bounds (pivot is base-center -> y: [0..H])
            grp.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(grp);
            grp.userData.size_mm = { L, W, H };
            grp.userData.bounds = box.clone();
            grp.userData.pivot = 'base-center';
            return { group: grp, box };
          }

          // Optional helper: add a pallet to current 3D scene at floor level
          function threeAddPallet(opts = {}) {
            if (!threeCtx || !threeCtx.scene) throw new Error('3D scene not initialised');
            const res = createPallet(opts);
            // Base-center pivot -> y=0 places it on the floor
            res.group.position.set(0, 0, 0);
            threeCtx.scene.add(res.group);
            return res;
          }

          // Expose for quick testing in console
          try { window.createPallet = createPallet; window.threeAddPallet = threeAddPallet; } catch(_) {}

