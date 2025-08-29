          // ===================== AUTOPACK / VARIANTS =====================
          function computePlan(items, v, seed) {
            for (const it of items) {
              if (
                Math.min(it.W, it.L) > v.inner_cm.W &&
                Math.max(it.W, it.L) > v.inner_cm.W
              )
                return {
                  placed: [],
                  unplaced: items,
                  free: [{ x: 0, y: 0, w: v.inner_cm.L, h: v.inner_cm.W }],
                };
              if (it.H > v.inner_cm.H)
                return {
                  placed: [],
                  unplaced: items,
                  free: [{ x: 0, y: 0, w: v.inner_cm.L, h: v.inner_cm.W }],
                };
            }
            let free = [{ x: 0, y: 0, w: v.inner_cm.L, h: v.inner_cm.W }],
              placed = [],
              unplaced = [];
            items.sort((a, b) =>
              seed % 3 === 0
                ? Math.max(b.W, b.L) - Math.max(a.W, a.L) ||
                  Math.min(b.W, b.L) - Math.min(a.W, a.L)
                : Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.W - a.W
            );
            for (const it of items) {
              let best = null;
              let chosenRot = 0;
              for (const o of seed % 2 ? [1, 0] : [0, 1]) {
                const tmp = { ...it, rot: o };
                const { l, w } = dims2D(tmp);
                const spot = bestFreeRect(free, l, w);
                if (spot) {
                  const waste = spot.w * spot.h - l * w;
                  if (!best || waste < best.waste) {
                    best = { rect: spot, waste, l, w };
                    chosenRot = o;
                  }
                }
              }
              if (!best) {
                unplaced.push(it);
                continue;
              }
              it.rot = chosenRot;
              it.x = best.rect.x;
              it.y = best.rect.y;
              placed.push(it);
              free = guillotineSplitAndNormalize(free, best.rect, {
                l: best.l,
                w: best.w,
              });
            }
            if (unplaced.length) {
              const out = shelfPack(unplaced, v, placed, free);
              placed = out.placed;
              unplaced = out.unplaced;
              free = out.free;
            }
            return { placed, unplaced, free };
          }

          function autopackUltra(seed = 0, allowAutoStack = true) {
            pushHistory();
            const v = vehicle();
            const items = state.items.map((it) => ({ ...it }));
            const totalKg = items.reduce((s, it) => s + weightItem(it), 0);
            if (totalKg > v.payload_kg) {
              showError(`Za ciężko o ${Math.round(totalKg - v.payload_kg)} kg`);
            }

            const seeds = [0, 1, 2, 3, 4].map((s) => (s + seed) % 7);
            const plans = seeds.map((s) => computePlan(deepClone(items), v, s));
            const scored = plans
              .map((p, i) => ({
                i,
                un: p.unplaced.length,
                waste: p.free.reduce((a, r) => a + r.w * r.h, 0),
              }))
              .sort((a, b) => a.un - b.un || a.waste - b.waste);
            state.variants = {
              plans: plans.map((p) => {
                const placed = p.placed.map((x) => ({ ...x, overflow: false }));
                const unplaced = p.unplaced.map((x) => ({ ...x, overflow: true }));
                return placed.concat(unplaced);
              }),
              index: scored[0].i,
            };
            applyVariant(scored[0].i, { noHistory: true });
            const bestPlan = plans[scored[0].i];
            if (bestPlan.unplaced.length && allowAutoStack) {
              stackAll();
              autopackUltra(seed + 1, false);
            }
          }

          function applyVariant(idx, opts = {}) {
            if (!state.variants.plans.length) return;
            if (!opts.noHistory) pushHistory();
            state.variants.index = Math.max(
              0,
              Math.min(state.variants.plans.length - 1, idx)
            );
            state.items = deepClone(state.variants.plans[state.variants.index]);
            renderAll();
          }

          function updateVariantLabel() {
            varLabel.textContent = `${t("variant")} ${
              state.variants.plans.length ? state.variants.index + 1 : 0
            }/${state.variants.plans.length || 0}`;
          }

          function bestFreeRect(free, l, w) {
            let best = null;
            for (const r of free) {
              if (l <= r.w && w <= r.h) {
                const areaWaste = r.w * r.h - l * w;
                const shortSide = Math.min(r.w - l, r.h - w);
                const score = areaWaste * 1e6 + shortSide;
                if (!best || score < best.score) {
                  best = { rect: r, score };
                }
              }
            }
            return best ? best.rect : null;
          }

          function guillotineSplitAndNormalize(free, usedRect, box) {
            const out = [];
            for (const r of free) {
              if (r !== usedRect) {
                out.push(r);
                continue;
              }
              const r1 = { x: r.x + box.l, y: r.y, w: r.w - box.l, h: box.w };
              const r2 = { x: r.x, y: r.y + box.w, w: r.w, h: r.h - box.w };
              if (r1.w > 0 && r1.h > 0) out.push(r1);
              if (r2.w > 0 && r2.h > 0) out.push(r2);
            }
            return normalizeFree(out);
          }

          function normalizeFree(list) {
            list = list.filter(
              (a, i) =>
                !list.some(
                  (b, j) =>
                    j !== i &&
                    a.x >= b.x &&
                    a.y >= b.y &&
                    a.x + a.w <= b.x + b.w &&
                    a.y + a.h <= b.y + b.h
                )
            );
            list = list.map((r) => ({
              x: snap(r.x),
              y: snap(r.y),
              w: snap(r.w),
              h: snap(r.h),
            }));
            return list;
          }

          function shelfPack(unplaced, v, placed, free) {
            let y = 0,
              shelfH = 0,
              x = 0;
            unplaced.sort((a, b) => Math.max(b.W, b.L) - Math.max(a.W, a.L));
            const rest = [];
            for (const it of unplaced) {
              const { l, w } = dims2D(it);
              if (w > v.inner_cm.W || l > v.inner_cm.L) {
                rest.push(it);
                continue;
              }
              if (x + l <= v.inner_cm.L) {
                it.x = x;
                it.y = y;
                x += l;
                shelfH = Math.max(shelfH, w);
                placed.push(it);
              } else if (y + shelfH + w <= v.inner_cm.W) {
                y += shelfH;
                x = 0;
                shelfH = 0;
                it.x = 0;
                it.y = y;
                x = l;
                shelfH = Math.max(shelfH, w);
                placed.push(it);
              } else {
                rest.push(it);
              }
            }
            free = [
              { x: x, y: y, w: v.inner_cm.L - x, h: shelfH },
              {
                x: 0,
                y: y + shelfH,
                w: v.inner_cm.L,
                h: v.inner_cm.W - (y + shelfH),
              },
            ].filter((r) => r.w > 0 && r.h > 0);
            return { placed, unplaced: rest, free };
          }

          function placeNewItem(it) {
            const v = vehicle();
            const free = computeFreeRectsFromPlaced(v, state.items);
            for (const rot of [0, 1]) {
              const { l, w } = dims2D({ ...it, rot });
              const spot = bestFreeRect(free, l, w);
              if (spot) {
                it.rot = rot;
                it.x = snap(spot.x);
                it.y = snap(spot.y);
                return true;
              }
            }
            it.x = 0;
            it.y = 0;
            it.rot = 0;
            return false;
          }

          function computeFreeRectsFromPlaced(v, items) {
            let free = [{ x: 0, y: 0, w: v.inner_cm.L, h: v.inner_cm.W }];
            const placed = items.map((it) => ({
              x: it.x,
              y: it.y,
              w: dims2D(it).l,
              h: dims2D(it).w,
            }));
            for (const p of placed) {
              const next = [];
              for (const r of free) {
                if (
                  !(
                    p.x >= r.x + r.w ||
                    p.x + p.w <= r.x ||
                    p.y >= r.y + r.h ||
                    p.y + p.h <= r.y
                  )
                ) {
                  const left = { x: r.x, y: r.y, w: p.x - r.x, h: r.h };
                  const right = {
                    x: p.x + p.w,
                    y: r.y,
                    w: r.x + r.w - (p.x + p.w),
                    h: r.h,
                  };
                  const top = { x: r.x, y: r.y, w: r.w, h: p.y - r.y };
                  const bottom = {
                    x: r.x,
                    y: p.y + p.h,
                    w: r.w,
                    h: r.y + r.h - (p.y + p.h),
                  };
                  [left, right, top, bottom].forEach((q) => {
                    if (q.w > 0 && q.h > 0) next.push(q);
                  });
                } else next.push(r);
              }
              free = normalizeFree(next);
            }
            return free;
          }
