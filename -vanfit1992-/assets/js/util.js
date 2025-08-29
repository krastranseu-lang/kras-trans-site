          // ===================== UTIL =====================
          function getDevice(){
            const w = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
            if (w < 768) return 'mobile';
            if (w < 1024) return 'tablet';
            return 'desktop';
          }
          function tuneRendererForDevice(dev){
            if (!threeCtx || !threeCtx.renderer) return;
            const dpr = window.devicePixelRatio || 1;
            if (dev === 'desktop') {
              threeCtx.renderer.setPixelRatio(Math.min(2, dpr));
              threeCtx.renderer.localClippingEnabled = !!threeCtx.state.sectionEnabled;
            } else if (dev === 'tablet') {
              threeCtx.renderer.setPixelRatio(1);
              threeCtx.renderer.localClippingEnabled = false;
            } else { // mobile
              threeCtx.renderer.setPixelRatio(1);
              threeCtx.renderer.localClippingEnabled = false;
            }
          }
          function applyDevice(){
            const dev = getDevice();
            mount.setAttribute('data-device', dev);
            if (dev === 'mobile') {
              if (state.viewMode !== '2d') {
                state.viewMode = '2d';
                if (view3DBtn) view3DBtn.textContent = '3D';
              }
            }
            try { if (threeCtx && threeCtx.init) tuneRendererForDevice(dev); } catch(_) {}
          }
          const uid = () => "it" + Math.random().toString(36).slice(2, 8);
          const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
          function dispatchSelectionChange(){
            try { mount.dispatchEvent(new Event('selectionchange')); } catch(_) {}
          }

          function cm3ToM3(c) {
            return c / 1_000_000;
          }
          function volItem(it) {
            return cm3ToM3(it.L * it.W * it.H) * it.stackCount;
          }
          function weightItem(it) {
            return (it.weight || 0) * it.stackCount;
          }
          function dims2D(it) {
            const rotated = it.rot % 2 !== 0;
            return rotated ? { l: it.W, w: it.L } : { l: it.L, w: it.W };
          }
          
          // Inline popover confirm near an anchor element. Returns Promise<boolean>.
          function confirmPopover(opts){
            return new Promise((resolve)=>{
              try {
                const anchor = (opts && (opts.anchor || opts.el)) || null;
                const text = (opts && opts.text) || '';
                const okText = (opts && opts.okText) || 'OK';
                const cancelText = (opts && opts.cancelText) || (typeof t === 'function' ? (t('help_cancel') || 'Cancel') : 'Cancel');
                // Remove existing
                try { document.querySelectorAll('.vp-confirm').forEach(n=> n.remove()); } catch(_) {}
                const box = document.createElement('div');
                box.className = 'vp-confirm';
                box.setAttribute('role','dialog');
                box.style.position = 'absolute';
                box.style.zIndex = '9999';
                box.style.background = 'var(--card)';
                box.style.border = '1px solid var(--line)';
                box.style.borderRadius = '10px';
                box.style.boxShadow = '0 12px 28px rgba(0,0,0,.25)';
                box.style.padding = '10px';
                box.style.display = 'flex';
                box.style.alignItems = 'center';
                box.style.gap = '10px';
                const msg = document.createElement('div'); msg.textContent = text; msg.style.maxWidth = '280px';
                const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px'; actions.style.marginLeft = '8px';
                const btnCancel = document.createElement('button'); btnCancel.className='btn secondary'; btnCancel.type='button'; btnCancel.textContent = cancelText;
                const btnOk = document.createElement('button'); btnOk.className='btn'; btnOk.type='button'; btnOk.textContent = okText;
                actions.appendChild(btnCancel); actions.appendChild(btnOk);
                box.appendChild(msg); box.appendChild(actions);
                document.body.appendChild(box);
                function place(){
                  const r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth/2, top: window.innerHeight/2, width:0, height:0 };
                  const bw = box.offsetWidth || 320; const bh = box.offsetHeight || 52;
                  let left = r.left + (r.width/2) - (bw/2);
                  let top = r.bottom + 8;
                  if (left + bw > window.innerWidth - 8) left = window.innerWidth - bw - 8;
                  if (left < 8) left = 8;
                  if (top + bh > window.innerHeight - 8) top = r.top - bh - 8; // try above
                  if (top < 8) top = 8;
                  box.style.left = Math.round(left + window.scrollX) + 'px';
                  box.style.top = Math.round(top + window.scrollY) + 'px';
                }
                place();
                const onCancel = ()=>{ cleanup(); resolve(false); };
                const onOk = ()=>{ cleanup(); resolve(true); };
                btnCancel.addEventListener('click', onCancel);
                btnOk.addEventListener('click', onOk);
                function onDoc(e){
                  const t = e.target; if (!box.contains(t)) { onCancel(); }
                }
                function onKey(e){ if (e.key === 'Escape') onCancel(); }
                setTimeout(()=>{ document.addEventListener('pointerdown', onDoc, { capture:true }); document.addEventListener('keydown', onKey); }, 0);
                function cleanup(){
                  try { document.removeEventListener('pointerdown', onDoc, { capture:true }); } catch(_) {}
                  try { document.removeEventListener('keydown', onKey); } catch(_) {}
                  try { box.remove(); } catch(_) {}
                }
              } catch(_) { resolve(window.confirm(opts && opts.text || '')); }
            });
          }
          
