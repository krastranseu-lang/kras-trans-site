          // ============ 3D Drag/Snap/Collision ==========
          function threePlaneIntersect(ev){
            const r = threeCtx.raycaster; const el = threeCtx.renderer?.domElement; if (!el) return null;
            const rect = el.getBoundingClientRect();
            const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            const ny = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            r.setFromCamera({ x: nx, y: ny }, threeCtx.camera);
            const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
            const out = new THREE.Vector3();
            const ok = r.ray.intersectPlane(plane, out);
            return ok ? out : null;
          }

          function threeStartDrag(ev, info){
            if (!info || !info.id) return;
            const it = state.items.find(x => String(x.id) === String(info.id));
            if (!it) return;
            const v = vehicle();
            const d = dims2D(it);
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const gl = d.l * CM_TO_M; const gw = d.w * CM_TO_M;
            const cx = (-Lm/2) + (it.x || 0)*CM_TO_M + gl/2;
            const cz = (-Wm/2) + (it.y || 0)*CM_TO_M + gw/2;
            const pt = threePlaneIntersect(ev);
            let off = { x: 0, z: 0 };
            if (pt) off = { x: pt.x - cx, z: pt.z - cz };
            threeCtx.drag = { id: info.id, meshType: info.meshType, target: info.target, instIndex: info.instIndex, offset: off, start: { x: cx, z: cz }, moved: false };
            try { if (threeCtx.controls) threeCtx.controls.enabled = false; } catch(_) {}
          }

          function threeCandidateFromCenterMeters(it, cx, cz){
            const v = vehicle();
            const d = dims2D(it);
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const gl = d.l * CM_TO_M; const gw = d.w * CM_TO_M;
            let nx = ((cx + Lm/2) - gl/2) / CM_TO_M;
            let ny = ((cz + Wm/2) - gw/2) / CM_TO_M;
            const gsn = computeSnapGrid(nx, ny, 1);
            nx = gsn.x; ny = gsn.y;
            const wsn = computeSnapWalls(nx, ny, d.l, d.w, v, 1.0);
            nx = wsn.x; ny = wsn.y;
            if (!wsn.snapped){
              const esn = computeSnapEdges(nx, ny, d.l, d.w, state.items, it.id, v, 1.0);
              if (esn.snapped) { nx = esn.x; ny = esn.y; }
            }
            return { x: nx, y: ny, l: d.l, w: d.w };
          }

          function threeBox3ForItem(it){
            const v = vehicle();
            const d = dims2D(it);
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const gl = d.l * CM_TO_M; const gw = d.w * CM_TO_M; const gh = (it.H * (it.stackCount||1)) * CM_TO_M;
            const x0 = (-Lm/2) + (it.x||0)*CM_TO_M;
            const z0 = (-Wm/2) + (it.y||0)*CM_TO_M;
            const min = new THREE.Vector3(x0, 0, z0);
            const max = new THREE.Vector3(x0 + gl, gh, z0 + gw);
            return new THREE.Box3(min, max);
          }

          function threeBox3ForCandidate(it, cand){
            const v = vehicle();
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const gl = (cand.l||0) * CM_TO_M; const gw = (cand.w||0) * CM_TO_M; const gh = (it.H * (it.stackCount||1)) * CM_TO_M;
            const x0 = (-Lm/2) + (cand.x||0)*CM_TO_M;
            const z0 = (-Wm/2) + (cand.y||0)*CM_TO_M;
            return new THREE.Box3(new THREE.Vector3(x0,0,z0), new THREE.Vector3(x0+gl, gh, z0+gw));
          }

          function threeCandidateValid(it, cand){
            const v = vehicle();
            if (outOfBounds(cand, v)) return false;
            const bC = threeBox3ForCandidate(it, cand);
            for (const other of (state.items||[])){
              if (!other || String(other.id) === String(it.id) || other.overflow) continue;
              const bO = threeBox3ForItem(other);
              if (bC.intersectsBox(bO)) return false;
            }
            return true;
          }

          function threeApplyCenterToVisual(it, cx, cz){
            const d = dims2D(it);
            const gh = (it.H * (it.stackCount||1)) * CM_TO_M;
            const cy = gh / 2;
            if (threeCtx.drag?.meshType === 'inst'){
              const inst = threeCtx.drag.target;
              const index = threeCtx.drag.instIndex;
              const obj = threeCtx.dummy || new THREE.Object3D();
              obj.position.set(cx, cy, cz); obj.rotation.set(0,0,0); obj.updateMatrix();
              try { inst.setMatrixAt(index, obj.matrix); inst.instanceMatrix.needsUpdate = true; } catch(_) {}
            } else {
              const mesh = threeCtx.meshes.items.get(String(it.id));
              if (mesh) { mesh.position.set(cx, cy, cz); }
            }
            try { threeUpdateGizmo({ cx, cz }); } catch(_) {}
          }

          function threeUpdateDrag(ev){
            const drag = threeCtx.drag; if (!drag) return;
            const it = state.items.find(x => String(x.id) === String(drag.id)); if (!it) return;
            const v = vehicle();
            const d = dims2D(it);
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M;
            const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const gl = d.l * CM_TO_M; const gw = d.w * CM_TO_M;
            const pt = threePlaneIntersect(ev); if (!pt) return;
            let cx = pt.x - (drag.offset?.x||0);
            let cz = pt.z - (drag.offset?.z||0);
            const cand = threeCandidateFromCenterMeters(it, cx, cz);
            if (!threeCandidateValid(it, cand)) return;
            it.x = cand.x; it.y = cand.y;
            cx = (-Lm/2) + it.x*CM_TO_M + gl/2; cz = (-Wm/2) + it.y*CM_TO_M + gw/2;
            threeApplyCenterToVisual(it, cx, cz);
            threeCtx.drag.moved = true;
          }

          function threeEndDrag(ev){
            const drag = threeCtx.drag; if (!drag) { try { if (threeCtx.controls) threeCtx.controls.enabled = true; } catch(_) {} return; }
            const moved = !!drag.moved; threeCtx.drag = null;
            try { if (threeCtx.controls) threeCtx.controls.enabled = true; } catch(_) {}
            if (moved) { try { pushHistory(); } catch(_) {} try { recalc(); } catch(_) {} }
          }

          function threeEnsureGizmo(){
            if (!threeCtx.init) return null;
            if (threeCtx.gizmo) return threeCtx.gizmo;
            const grp = new THREE.Group();
            const mat = new THREE.LineBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.9 });
            const geo = new THREE.BufferGeometry();
            const L = 0.6; const arr = new Float32Array([
              -L/2, 0.002, 0,   L/2, 0.002, 0,
               0,   0.002, -L/2,  0,  0.002, L/2
            ]);
            geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            const lines = new THREE.LineSegments(geo, mat);
            grp.add(lines);
            grp.visible = false;
            threeCtx.scene.add(grp);
            threeCtx.gizmo = grp;
            return grp;
          }

          function threeUpdateGizmo(opt){
            try { threeEnsureGizmo(); } catch(_) {}
            const g = threeCtx.gizmo; if (!g) return;
            const id = String(state.selectedId || '');
            const it = (state.items||[]).find(x => String(x.id) === id && !x.overflow);
            if (!it || state.viewMode !== '3d') { g.visible = false; return; }
            const v = vehicle(); const d = dims2D(it);
            const Lm = (v?.inner_cm?.L || 0) * CM_TO_M; const Wm = (v?.inner_cm?.W || 0) * CM_TO_M;
            const gl = d.l * CM_TO_M; const gw = d.w * CM_TO_M;
            let cx, cz;
            if (opt && typeof opt.cx === 'number' && typeof opt.cz === 'number') { cx = opt.cx; cz = opt.cz; }
            else { cx = (-Lm/2) + (it.x||0)*CM_TO_M + gl/2; cz = (-Wm/2) + (it.y||0)*CM_TO_M + gw/2; }
            g.position.set(cx, 0.001, cz);
            g.visible = true;
          }
