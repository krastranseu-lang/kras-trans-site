  // ===================== SELF TEST: 2D Keys & Rulers =====================
  function selfTest2D(){
    try {
      const log = (n, ok, msg='') => console.log(`[${ok?'PASS':'FAIL'} ${n}]${msg? ' '+msg:''}`);
      const vp = mount.querySelector('#viewport');
      const v = vehicle();
      // Backup
      const backup = deepClone({ items: state.items, sel: state.selectedId });
      // Helper to dispatch key
      const key = (k, opt={}) => vp.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, shiftKey: !!opt.shift }));
      // Ensure focusable
      try { vp.focus(); } catch(_) {}

      // Setup a clean scene
      state.items = [];
      const a = { id: 'k_a', type: 'test', L: 120, W: 80, H: 100, weight: 10, stackCount: 1, x: 10, y: 10, rot: 0 };
      state.items.push(a);
      state.selectedId = a.id; renderAll();

      // 1) viewport tabbable
      log('tabindex', vp.getAttribute('tabindex') === '0');

      // 2) ArrowRight +1 cm
      const x0 = a.x; key('ArrowRight');
      log('arrow +1', a.x === x0 + 1);

      // 3) Shift+ArrowDown +5 cm
      const y0 = a.y; key('ArrowDown', { shift: true });
      log('shift +5', a.y === y0 + 5);

      // 4) Clamp to bounds (force to right wall)
      a.x = v.inner_cm.L - dims2D(a).l; renderAll(); key('ArrowRight');
      log('clamp bounds', a.x === v.inner_cm.L - dims2D(a).l);

      // 5) Rotate R toggles 0<->1
      a.rot = 0; renderAll(); key('r');
      log('rotate 0->90', (a.rot % 2) === 1);
      key('r'); log('rotate 90->0', (a.rot % 2) === 0);

      // 6) Rotate with collision -> revert
      const b = { id: 'k_b', type: 'test', L: 120, W: 80, H: 100, weight: 10, stackCount: 1, x: 0, y: 0, rot: 0 };
      state.items = [b, { ...a, id: 'k_sel', x: 100, y: 0, rot: 0 }];
      state.selectedId = 'k_sel'; renderAll();
      const beforeRot = state.items.find(x=>x.id==='k_sel').rot;
      key('R');
      const afterRot = state.items.find(x=>x.id==='k_sel').rot;
      log('rotate collision revert', beforeRot === afterRot);

      // 7) Delete selected
      key('Delete');
      log('delete selected', !state.items.some(x=>x.id==='k_sel'));

      // 8) Escape cancels selection and drag
      state.items = [a]; state.selectedId = a.id; renderAll();
      // simulate drag
      drag = { id: a.id, pre: { x: a.x, y: a.y }, offXcm: 0, offYcm: 0 };
      key('Escape');
      log('escape clears selection', !state.selectedId && drag === null);

      // 9) Rulers ticks + labels every 10 cm
      try { updateRulers(); } catch(_) {}
      const overlay = mount.querySelector('#overlay');
      const tx = overlay.querySelectorAll('#rulerX .rulerTick').length;
      const ty = overlay.querySelectorAll('#rulerY .rulerTick').length;
      const has10 = Array.from(overlay.querySelectorAll('#rulerX text')).some(t=>/\b10\b/.test(t.textContent||''));
      log('rulers ticks', tx>0 && ty>0);
      log('rulers labels 10cm', has10);

      // 10) Collision flash on blocked move
      state.items = [ { id:'c1', type:'t', L:120, W:80, H:100, stackCount:1, x:0, y:0, rot:0 }, { id:'c2', type:'t', L:120, W:80, H:100, stackCount:1, x:120, y:0, rot:0 } ];
      state.selectedId = 'c2'; renderAll();
      // try to move left into c1 (should snap collide and flash)
      key('ArrowLeft');
      const flash = mount.querySelector('#overlay #gCollisionFlash');
      log('collision flash', !!flash);

      // restore
      state.items = backup.items; state.selectedId = backup.sel; renderAll();
    } catch (e) {
      console.warn('[selfTest2D] unexpected', e);
    }
  }

