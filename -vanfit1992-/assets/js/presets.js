          // ===================== PRESETS =====================
          function renderPresets() {
            presetList.innerHTML = "";
            PRESETS.forEach((p) => {
              const row = document.createElement("div");
              row.className = "preset";
              const left = document.createElement("div");
              const title = p.id === 'Pal_Przemyslowa' ? (I18N[lang]?.industrial_pallet || p.label) : p.label;
              left.innerHTML = `<div style=\"font-weight:600\">${title}</div><small>${p.dims.L}×${p.dims.W}×${p.dims.H} • ${p.weight} kg</small>`;
            const right = document.createElement("div");
            right.className = "qty";
            right.innerHTML = `<label>${t('qty')}</label><input type="number" min="1" value="1"> <button class=\"btn secondary\">${t('add')}</button>`;
              right.querySelector("button").addEventListener("click", () => {
                const n = Math.max(1, +right.querySelector("input").value || 1);
                pushHistory();
                for (let i = 0; i < n; i++) {
                  addItemFromPreset(p, { autoPlace: true });
                }
                // Auto‑pack automatically when adding multiple items
                if (n > 1) {
                  autopackUltra(0, true);
                } else {
                  renderAll();
                }
                try { addAnalyzed(n); } catch(_) {}
              });
              row.appendChild(left);
              row.appendChild(right);
              presetList.appendChild(row);
            });
          }
