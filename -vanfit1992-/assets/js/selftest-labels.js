  // ===================== SELF TEST: Overlay Labels =====================
  function selfTestLabels() {
    try {
      const log = (...a) => console.log('[selfTest]', ...a);
      const pass = (name) => log(name + ': PASS');
      const fail = (name, msg) => log(name + ': FAIL', msg || '');

      // dims-rot
      try {
        const it = { id: 't_rot', type: 'test', L: 120, W: 80, H: 100, weight: 10, stackCount: 1, rot: 0 };
        const el0 = overlayLabels.buildLabel(it);
        const txt0 = el0.querySelector('.body')?.textContent || '';
        it.rot = 1;
        const el1 = overlayLabels.buildLabel(it);
        const txt1 = el1.querySelector('.body')?.textContent || '';
        if (txt0.includes('120×80×100') && txt1.includes('80×120×100')) pass('dims-rot'); else fail('dims-rot', `${txt0} | ${txt1}`);
      } catch (e) { fail('dims-rot', e?.message); }

      // auto-place: two boxes minimal collision; in crowd choose "-out"
      const backupItems = deepClone(state.items);
      try {
        const a = { id: 't_a1', type: 'test', L: 120, W: 80, H: 150, weight: 300, stackCount: 1, x: 0, y: 0, rot: 0 };
        const b = { id: 't_a2', type: 'test', L: 120, W: 80, H: 150, weight: 300, stackCount: 1, x: 120, y: 0, rot: 0 };
        state.items = [a, b];
        renderAll();
        overlayLabels.updateAll();
        const la = mount.querySelector('#labels .label[data-id="t_a1"]');
        const lb = mount.querySelector('#labels .label[data-id="t_a2"]');
        const ra = la?.getBoundingClientRect(); const rb = lb?.getBoundingClientRect();
        let inter = 0; if (ra && rb) {
          const x1 = Math.max(ra.left, rb.left), y1 = Math.max(ra.top, rb.top);
          const x2 = Math.min(ra.right, rb.right), y2 = Math.min(ra.bottom, rb.bottom);
          inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        }
        const area = (ra?.width || 1) * (ra?.height || 1);
        if (inter <= area * 0.20) pass('auto-place'); else fail('auto-place', `overlap=${inter.toFixed(1)} area=${area.toFixed(1)}`);

        // crowd test: force many boxes to increase overlap -> expect "-out"
        const crowd = [];
        let idn = 0;
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 6; x++) {
            crowd.push({ id: 't_c' + (++idn), type: 'crowd', L: 100, W: 80, H: 120, weight: 100, stackCount: 1, x: x*100, y: y*80, rot: 0 });
          }
        }
        const c = { id: 't_crowd', type: 'test', L: 90, W: 70, H: 100, weight: 80, stackCount: 1, x: 50, y: 50, rot: 0 };
        state.items = crowd.concat([c]);
        renderAll();
        overlayLabels.updateAll();
        const anchor = (c.label && c.label.anchor) || '';
        if (/-out$/.test(anchor)) pass('auto-place crowd'); else fail('auto-place crowd', anchor);
      } catch (e) { fail('auto-place', e?.message); }

      // contrast: light/dark backgrounds choose variant
      try {
        const light = overlayLabels.test_applyContrast_on('rgb(255,255,255)');
        const dark = overlayLabels.test_applyContrast_on('rgb(5,5,5)');
        const lightOk = (
          light.color === '#111' ||
          light.color === '#121212' ||
          light.color === 'rgb(17, 17, 17)' ||
          light.color === 'rgb(18, 18, 18)'
        );
        const darkOk = (
          dark.color === '#fff' ||
          dark.color === 'white' ||
          dark.color === 'rgb(255, 255, 255)'
        );
        if (lightOk && darkOk) pass('contrast'); else fail('contrast', `light=${light.color} dark=${dark.color}`);
      } catch (e) { fail('contrast', e?.message); }

      // icons: noStack/fragile render
      try {
        const it = { id: 't_icons', type: 'test', L: 120, W: 80, H: 100, weight: 10, stackCount: 1, flags: { noStack: true, fragile: true }, rot: 0 };
        const el = overlayLabels.buildLabel(it);
        const uses = Array.from(el.querySelectorAll('use')).map(u => u.getAttribute('href'));
        if (uses.includes('#i-nostack') && uses.includes('#i-fragile')) pass('icons'); else fail('icons', String(uses));
      } catch (e) { fail('icons', e?.message); }

      // tooltip-aria: aria-describedby open/close
      try {
        const id = 't_rot';
        const okOpen = overlayLabels.openTooltip(id);
        const lab = mount.querySelector(`#labels .label[data-id="${id}"]`);
        const has = lab?.getAttribute('aria-describedby') === 'labelTip';
        const okClose = overlayLabels.closeTooltip(id);
        const gone = !lab?.hasAttribute('aria-describedby');
        if (okOpen && okClose && has && gone) pass('tooltip-aria'); else fail('tooltip-aria');
      } catch (e) { fail('tooltip-aria', e?.message); }

      // selection: .is-selected reacts to selectionchange
      try {
        state.items = [{ id: 't_sel', type: 'test', L: 120, W: 80, H: 100, weight: 10, stackCount: 1, x: 0, y: 0, rot: 0 }];
        renderAll(); overlayLabels.updateAll();
        state.selectedId = 't_sel';
        dispatchSelectionChange();
        const selEl = mount.querySelector('#labels .label[data-id="t_sel"]');
        if (selEl && selEl.classList.contains('is-selected')) pass('selection'); else fail('selection');
      } catch (e) { fail('selection', e?.message); }

      // perf: 200 labels < 16 ms (build + measure only)
      try {
        const N = 200;
        const t0 = (performance && performance.now) ? performance.now() : Date.now();
        for (let i=0;i<N;i++) {
          const it = { id: 't_perf_' + i, type: 'test', L: 80 + (i%5)*10, W: 60 + (i%7)*10, H: 100, weight: 10, stackCount: 1, rot: (i%2) };
          const el = overlayLabels.buildLabel(it);
          overlayLabels.measureLabel(el);
        }
        const t1 = (performance && performance.now) ? performance.now() : Date.now();
        const dt = t1 - t0;
        if (dt < 16) pass('perf 200'); else fail('perf 200', `${dt.toFixed(1)} ms`);
      } catch (e) { fail('perf 200', e?.message); }

      // restore
      state.items = backupItems;
      renderAll(); overlayLabels.updateAll();
    } catch (e) {
      console.warn('[selfTest] unexpected', e);
    }
  }

