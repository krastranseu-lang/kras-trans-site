          // ===================== STATE =====================
          const mount = document.getElementById("van-pack");
          let lang = (localStorage.getItem('vp_lang') || 'pl');
          try { document.documentElement.setAttribute('lang', lang); } catch(_) {}
          try { mount.setAttribute('data-lang', lang); } catch(_) {}
          // Theme init — AUTO (system) with optional MANUAL override
          const prefersLight = (window.matchMedia && matchMedia('(prefers-color-scheme: light)')) || null;
          const prefersDark  = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)')) || null;
          const THEME_KEY = 'vp_theme_mode'; // 'auto' | 'light' | 'dark'
          function getSystemTheme(){
            try {
              if (prefersDark && typeof prefersDark.matches === 'boolean' && prefersDark.matches) return 'dark';
              if (prefersLight && typeof prefersLight.matches === 'boolean' && prefersLight.matches) return 'light';
            } catch(_) {}
            // Fallback: assume dark (nasza domyślna paleta)
            return 'dark';
          }
          let themeMode = (localStorage.getItem(THEME_KEY) || 'auto');
          let theme = themeMode === 'auto' ? getSystemTheme() : themeMode;
          mount.setAttribute("data-theme", theme);
          // React to system theme changes only in AUTO mode
          try {
            const onMql = () => {
              if ((localStorage.getItem(THEME_KEY) || 'auto') !== 'auto') return;
              const th = getSystemTheme();
              setTheme(th);
              try { renderAll(); try { overlayLabels.updateAll(); } catch(_){} } catch(_){}
            };
            // Reaguj zarówno na light, jak i dark (niektóre silniki sygnalizują jeden kanał pewniej)
            const add = (mql) => {
              if (!mql) return;
              if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onMql);
              else if (typeof mql.addListener === 'function') mql.addListener(onMql);
            };
            add(prefersLight); add(prefersDark);
            // Safety net: when wracamy do karty, zsynchronizuj w AUTO
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState !== 'visible') return;
              if ((localStorage.getItem(THEME_KEY) || 'auto') !== 'auto') return;
              onMql();
            });
            // Synchronizacja między kartami (zmiana trybu w innej karcie)
            window.addEventListener('storage', (e) => {
              if (e.key !== THEME_KEY) return;
              const mode = e.newValue || 'auto';
              if (mode === 'auto') setTheme(getSystemTheme()); else setTheme(mode);
              try { renderAll(); try { overlayLabels.updateAll(); } catch(_){} } catch(_){}
            });
          } catch(_) {}

          const state = {
            vehicleIndex: 0,
            items: [], // {id,type,L,W,H,weight,stackable,stackCount,x,y,rot}
            selectedId: null,
            history: [],
            future: [],
            suggestions: [],
            clipboard: null,
            variants: { plans: [], index: 0 },
            viewMode: "2d",
            compareOn: false,
            stats: { analyzed: 0 },
          };

          // -------- Minimalny store/dispatcher (MVP porządkowania stanu) --------
          // Ujednolica mutacje i odświeżanie, ułatwi kolejne kroki (A/B, przekrój, overlay osi).
          const Store = (() => {
            const listeners = [];
            return {
              get() {
                return state;
              },
              set(patch = {}) {
                Object.assign(state, patch);
                renderAll();
                listeners.forEach((fn) => {
                  try {
                    fn(state);
                  } catch (_) {}
                });
              },
              subscribe(fn) {
                listeners.push(fn);
                return () => {
                  const i = listeners.indexOf(fn);
                  if (i > -1) listeners.splice(i, 1);
                };
              },
              mutate(label, fn) {
                try {
                  pushHistory();
                  fn(state);
                  renderAll();
                } catch (e) {
                  console.error("Store.mutate fail:", label, e);
                }
              },
            };
          })();

          function t(key, vars = {}) {
            const str =
              key.split(".").reduce((o, k) => o && o[k], I18N[lang]) || key;
            return str.replace(
              /\{(\w+)\}/g,
              (_, k) => vars[k] ?? "{" + k + "}"
            );
          }
          function vehicle() {
            return VEHICLES[state.vehicleIndex];
          }
