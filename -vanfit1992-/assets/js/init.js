          // ===================== INIT =====================
          function seedPresets() {
            state.items.push({
              id: uid(),
              type: "eur_pallet",
              L: 120,
              W: 80,
              H: 180,
              weight: 350,
              stackable: true,
              stackCount: 1,
              x: 0,
              y: 0,
              rot: 0,
              flags: {}
            });
            state.items.push({
              id: uid(),
              type: "eur_pallet",
              L: 120,
              W: 80,
              H: 180,
              weight: 350,
              stackable: true,
              stackCount: 1,
              x: 120,
              y: 0,
              rot: 0,
              flags: {}
            });
          }
  function firstTimeInit() {
    if (!loadFromHash()) loadLocal();
    renderPresets();
    applyDevice();
    renderAll();
    // Ensure the floor grid starts fitted to full cargo width
    try { fitCanvasToVehicleWidth(true); } catch(_) {}
    if (!state.items.length) {
      seedPresets();
      renderAll();
      try { fitCanvasToVehicleWidth(true); } catch(_) {}
    }
    try { render(); } catch(_) {}
  }

