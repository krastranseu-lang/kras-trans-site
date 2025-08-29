          // ===================== VEHICLE UI =====================
              // Localize Polish vehicle names to current language for display
              function localizeVehName(name){
                let s = String(name||'');
                const L = lang;
                const rep = (re, out)=> s = s.replace(re, out);
                switch (L) {
                  case 'en':
                    rep(/\bChłodnia\b/g,'Refrigerated trailer');
                    rep(/^Bus\b/,'Van');
                    rep(/\bSolówka\b/g,'Rigid truck');
                    rep(/^Naczepa 13,6/g,'Semi-trailer 13,6');
                    rep(/\bTIR\b/g,'Curtainsider / box trailer');
                    rep(/^Mega\b/g,'Mega trailer');
                    break;
                  case 'de':
                    rep(/\bChłodnia\b/g,'Kühlauflieger');
                    rep(/^Bus\b/,'Transporter');
                    rep(/\bSolówka\b/g,'Solofahrzeug');
                    rep(/^Naczepa 13,6/g,'Sattelauflieger 13,6');
                    rep(/\bTIR\b/g,'Planen-/Kofferauflieger');
                    rep(/^Mega\b/g,'Mega-Trailer');
                    break;
                  case 'fr':
                    rep(/\bChłodnia\b/g,'Semi-remorque frigorifique');
                    rep(/^Bus\b/,'Fourgon');
                    rep(/\bSolówka\b/g,'Porteur');
                    rep(/^Naczepa 13,6/g,'Semi-remorque 13,6');
                    rep(/\bTIR\b/g,'Rideaux coulissants / fourgon');
                    rep(/^Mega\b/g,'Remorque Mega');
                    break;
                  case 'it':
                    rep(/\bChłodnia\b/g,'Semirimorchio frigo');
                    rep(/^Bus\b/,'Furgone');
                    rep(/\bSolówka\b/g,'Motrice (rigido)');
                    rep(/^Naczepa 13,6/g,'Semirimorchio 13,6 m');
                    rep(/\bTIR\b/g,'Tautliner / box');
                    rep(/^Mega\b/g,'Trailer Mega');
                    break;
                  case 'ru':
                    rep(/\bChłodnia\b/g,'Рефрижераторный');
                    rep(/^Bus\b/,'Бус');
                    rep(/\bSolówka\b/g,'Соло-грузовик');
                    rep(/^Naczepa 13,6/g,'Полуприцеп 13,6');
                    rep(/\bTIR\b/g,'Шторный / фургон');
                    rep(/^Mega\b/g,'Мега-прицеп');
                    break;
                  case 'uk':
                    rep(/\bChłodnia\b/g,'Рефрижераторний');
                    rep(/^Bus\b/,'Бус');
                    rep(/\bSolówka\b/g,'Соло-вантажівка');
                    rep(/^Naczepa 13,6/g,'Напівпричіп 13,6');
                    rep(/\bTIR\b/g,'Шторний / фургон');
                    rep(/^Mega\b/g,'Мега-причіп');
                    break;
                  default: break;
                }
                return s;
              }
              function renderVehSelect() {
            const groups = [ ...new Set(VEHICLES.map((v) => v.group || "Pojazd")) ];
            vehSel.innerHTML = "";
              groups.forEach((g) => {
                const og = document.createElement("optgroup");
                // Reuse group label translator from dropdown builder if available
              try { og.label = (function(g){
                const lo = String(g||'').toLowerCase();
                if (lo.includes('bus')) return t('vehicle_cat_bus35');
                if (lo.includes('solów') || lo.includes('solow')) return t('vehicle_cat_rigid');
                if (lo.includes('13,6')) return t('vehicle_cat_trailer_136');
                if (lo.includes('firanka') || lo.includes('sztywka') || lo.includes('box')) return t('vehicle_cat_tautliner_box');
                if (lo.includes('mega')) return t('vehicle_cat_mega');
                if (lo.includes('chłod') || lo.includes('chlod')) return t('vehicle_cat_reefer');
                return g;
              })(g); } catch(_) { og.label = g; }
              VEHICLES.filter((v) => (v.group || "Pojazd") === g).forEach(
                (v) => {
                  const opt = document.createElement("option");
                  opt.value = String(VEHICLES.indexOf(v));
                  const name = localizeVehName(v.name_pl);
                  const ep = v.europallets ? `${v.europallets} ${t('eur_pallets') || 'EP'}` : '';
                  opt.textContent = name + (ep ? ` • ${ep}` : "");
                  og.appendChild(opt);
                }
              );
                vehSel.appendChild(og);
              });
            vehSel.value = String(state.vehicleIndex);
              vehSel.onchange = async () => {
                if (state.items.length) {
                  const ok = await (typeof confirmPopover === 'function' ? confirmPopover({ anchor: vehSel, text: t('confirm_change_vehicle') }) : Promise.resolve(window.confirm(t('confirm_change_vehicle'))));
                  if (!ok) {
                    vehSel.value = String(state.vehicleIndex);
                    return;
                  }
                }
                pushHistory();
                state.vehicleIndex = +vehSel.value;
                state.items = [];
                state.selectedId = null;
                state.variants = { plans: [], index: 0 };
                renderAll();
                // Reset view fit for new vehicle
                VIEW_TOUCHED = false;
                try { fitCanvasToVehicleWidth(true); } catch(_) {}
              };
            // Dopasuj szerokość selecta do treści
            try { resizeVehSelectToContent(); } catch(_) {}

            // Mega‑menu (dropdown) pod wierszem "Pojazd"
            try {
              const dd = mount.querySelector('#vehDD');
              function groupEmoji(g){
                g = String(g||'').toLowerCase();
                if (g.includes('bus')) return '🚌';
                if (g.includes('solów') || g.includes('solow')) return '🚚';
                if (g.includes('chłod') || g.includes('chlod')) return '❄️🚛';
                return '🚛';
              }
              function vehGroupLabel(g){
                const lo = String(g||'').toLowerCase();
                if (lo.includes('bus')) return t('vehicle_cat_bus35');
                if (lo.includes('solów') || lo.includes('solow')) return t('vehicle_cat_rigid');
                if (lo.includes('13,6')) return t('vehicle_cat_trailer_136');
                if (lo.includes('firanka') || lo.includes('sztywka') || lo.includes('box')) return t('vehicle_cat_tautliner_box');
                if (lo.includes('mega')) return t('vehicle_cat_mega');
                if (lo.includes('chłod') || lo.includes('chlod')) return t('vehicle_cat_reefer');
                return g;
              }
              function buildPickerHTML(){
                const byGroup = new Map();
                for (const v of VEHICLES){
                  const g = v.group || 'Pojazd';
                  if (!byGroup.has(g)) byGroup.set(g, []);
                  byGroup.get(g).push(v);
                }
                const cols = [];
                for (const [g, list] of byGroup.entries()){
                  const items = list.map(v => {
                    const idx = VEHICLES.indexOf(v);
                    const ep = v.europallets ? `${v.europallets} ${t('eur_pallets') || 'EP'}` : '';
                    const nm = localizeVehName(v.name_pl);
                    return `<div class=\"veh-opt\" data-vi=\"${idx}\"><span>${nm}</span><small>${ep}</small></div>`;
                  }).join('');
                  cols.push(`<div class="veh-col"><h5>${groupEmoji(g)} ${vehGroupLabel(g)}</h5>${items}</div>`);
              }
                return `<div class="veh-picker">${cols.join('')}</div>`;
              }
              function openVehDD(){
                if (!dd) return; dd.innerHTML = buildPickerHTML();
                const row = mount.querySelector('#vehRow');
                const wrap = mount.querySelector('.vp-wrap');
                if (!row || !wrap) return;
                const r = row.getBoundingClientRect();
                const w = wrap.getBoundingClientRect();
                dd.style.left = (r.left - w.left) + 'px';
                dd.style.top = (r.bottom - w.top + 6) + 'px';
                dd.style.minWidth = Math.max(360, r.width) + 'px';
                dd.style.display = 'block'; dd.hidden = false;
                dd.querySelectorAll('.veh-opt').forEach(el => {
                  el.addEventListener('click', async () => {
                    const idx = +el.getAttribute('data-vi');
                    if (state.items.length) {
                      const ok = await (typeof confirmPopover === 'function' ? confirmPopover({ anchor: el, text: t('confirm_change_vehicle') }) : Promise.resolve(window.confirm(t('confirm_change_vehicle'))));
                      if (!ok) return;
                    }
                    pushHistory(); state.vehicleIndex = idx; state.items = []; state.selectedId = null; state.variants = { plans: [], index: 0 }; renderAll(); closeVehDD();
                  });
                });
                setTimeout(()=>{
                  const onDoc = (e)=>{ if (!dd.contains(e.target) && !row.contains(e.target)) { closeVehDD(); document.removeEventListener('pointerdown', onDoc); } };
                  document.addEventListener('pointerdown', onDoc);
                },0);
              }
              function closeVehDD(){ if (!dd) return; dd.style.display='none'; dd.hidden = true; }
              const vehLabel = mount.querySelector('label[for="vehSel"]');
              // Wyłącz natywne menu i otwieraj nasze (klik, wciśnięcie)
              ['click','mousedown','pointerdown'].forEach(type=> vehSel.addEventListener(type, (e)=>{ e.preventDefault(); openVehDD(); }));
              vehLabel?.addEventListener('click', (e)=>{ e.preventDefault(); openVehDD(); });
              // Otwórz/Zamknij na hoverze tylko wokół selecta (nie cały wiersz)
              let hoverTimer = null;
              const scheduleClose = ()=>{ clearTimeout(hoverTimer); hoverTimer = setTimeout(()=>{ closeVehDD(); }, 180); };
              const cancelClose = ()=>{ clearTimeout(hoverTimer); };
              vehSel?.addEventListener('mouseenter', ()=>{ cancelClose(); openVehDD(); });
              vehSel?.addEventListener('mouseleave', ()=>{ scheduleClose(); });
              dd?.addEventListener('mouseenter', ()=> cancelClose());
              dd?.addEventListener('mouseleave', ()=> scheduleClose());
            } catch(_) {}
          }

          // Autosizer dla selecta "Pojazd" – dopasowuje szerokość do wybranego tekstu
          function resizeVehSelectToContent(){
            const s = vehSel; if (!s) return;
            const opt = s.options[s.selectedIndex];
            const text = (opt && opt.textContent) ? opt.textContent : '';
            const meas = document.createElement('span');
            meas.style.position = 'absolute';
            meas.style.visibility = 'hidden';
            meas.style.whiteSpace = 'pre';
            const st = getComputedStyle(s);
            meas.style.font = `${st.fontWeight} ${st.fontSize} / ${st.lineHeight} ${st.fontFamily}`;
            meas.textContent = ' ' + text + ' ';
            mount.appendChild(meas);
            const w = Math.ceil(meas.getBoundingClientRect().width + 38); // padding + strzałka
            meas.remove();
            s.style.width = Math.min(Math.max(160, w), Math.round(window.innerWidth*0.7)) + 'px';
          }

          function createVehicleWith(L,W,H,Kg,EP,Grid){
            const id = "custom_" + Date.now();
            const name = `Custom ${L / 100}×${W / 100}×${H / 100} m`;
            Store.mutate("createVehicle", (s) => {
              VEHICLES.push({ id, group: "Custom", name_pl: name, inner_cm: { L, W, H }, payload_kg: Kg, europallets: EP, grid_cm: Grid });
              s.vehicleIndex = VEHICLES.length - 1; s.items = []; s.selectedId = null; s.variants = { plans: [], index: 0 };
            });
          }

          // Inline create button was removed; creation is handled via custom vehicle dialog.

          function renderSpecs() {
            const v = vehicle();
            const capVol =
              (v.inner_cm.L * v.inner_cm.W * v.inner_cm.H) / 1_000_000;
            specsDims.textContent = `${t("dims_label")}: ${v.inner_cm.L}×${
              v.inner_cm.W
            }×${v.inner_cm.H} cm`;
            specsPayload.textContent = `${t("payload")}: ${v.payload_kg} kg`;
            specsPallets.textContent = `${t("pallets")}: ${v.europallets}`;
            specsLDM.textContent = `${t("ldm")}: ~${(
              v.inner_cm.L / 100
            ).toFixed(1)} (max) • ${capVol.toFixed(1)} m³`;
          }
