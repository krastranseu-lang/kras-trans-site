          // ===================== DOM BUILD =====================
          mount.innerHTML = `
        <div class="vp-wrap" role="region" aria-label="Van Pack">
          <header id="toolbar" role="toolbar" aria-label="${t('tools_aria')}">
            <button id="zoomOut">−</button>
            <button id="zoomIn">+</button>
            <button id="toggleGrid" class="secondary">${t("grid")}</button>
            <button id="resetView" class="secondary">${t("reset_view")}</button>
            <button id="toggleSheet" class="secondary" title="${t('panels_title')}">${t('panels_title')} ▴▾</button>
            <span id="status" aria-live="polite">${t('status_ready')}</span>
            <!-- Settings (gear) -->
            <div class="hdr-settings">
              <button class="hdr-btn" id="settings-trigger" aria-label="${t('settings')||'Settings'}" title="${t('settings')||'Settings'}">⚙️</button>
              <div class="hdr-popover hdr-settings-pop" role="dialog" aria-labelledby="settings-trigger" id="settings-popover" hidden>
                <div class="settings-content" style="padding:8px 10px; color:var(--muted)">${t('settings_soon') || 'User settings — coming soon'}</div>
              </div>
            </div>
            <!-- Help / Feedback -->
            <div class="hdr-help" style="margin-left:6px">
              <button class="hdr-btn" id="help-trigger" aria-label="${t('help')||'Help'}" title="${t('help')||'Help'}">?</button>
              <div class="hdr-popover hdr-help-pop" role="dialog" aria-labelledby="help-trigger" id="help-popover" hidden style="min-width:360px;max-width:420px">
                <div class="help-wrap" style="display:flex;flex-direction:column;gap:8px">
                  <div id="fbTitle" style="font-weight:700">${t('help_title')||'Report an issue / Share feedback'}</div>
                  <div id="fbIntro" style="color:var(--muted);font-size:13px">${t('help_intro')||'Help us improve the app.'}</div>
                  <label style="display:flex;flex-direction:column;gap:4px">
                    <span id="fbCatLabel" style="font-size:12px;color:var(--muted)">${t('help_category')||'Category'}</span>
                    <select id="fbCat">
                      <option value="bug">${t('help_category_bug')||'Bug'}</option>
                      <option value="idea">${t('help_category_idea')||'Idea'}</option>
                      <option value="ux">${t('help_category_ux')||'UX/UI'}</option>
                    </select>
                  </label>
                  <label style="display:flex;flex-direction:column;gap:4px">
                    <span id="fbSubjLabel" style="font-size:12px;color:var(--muted)">${t('help_subject')||'Subject'}</span>
                    <input id="fbSubj" type="text" placeholder="${t('help_subject')||'Subject'}" />
                  </label>
                  <label style="display:flex;flex-direction:column;gap:4px">
                    <span id="fbMsgLabel" style="font-size:12px;color:var(--muted)">${t('help_message')||'Message'}</span>
                    <textarea id="fbMsg" rows="4" placeholder="${t('help_message')||'Describe the problem/idea'}"></textarea>
                  </label>
                  <label style="display:flex;flex-direction:column;gap:4px">
                    <span id="fbEmailLabel" style="font-size:12px;color:var(--muted)">${t('help_email_optional')||'Your e‑mail (optional)'}</span>
                    <input id="fbEmail" type="email" placeholder="name@example.com" />
                  </label>
                  <div>
                    <div id="fbAttLabel" style="font-size:12px;color:var(--muted);margin-bottom:4px">${t('help_attachments')||'Attachments'}</div>
                    <div id="fbDrop" style="border:1px dashed var(--line);border-radius:8px;padding:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap" tabindex="0" aria-label="${t('help_paste_hint')||'Paste screenshot (Ctrl/Cmd+V)'}">
                      <button class="btn secondary" id="fbAddFiles" type="button">${t('help_add_files')||'Add from disk…'}</button>
                      <input id="fbFiles" type="file" accept="image/*" multiple style="display:none" />
                      <span id="fbPasteHint" style="color:var(--muted);font-size:12px">${t('help_paste_hint')||'Paste a screenshot (Ctrl/Cmd+V)'}</span>
                      <div id="fbThumbs" style="display:flex;gap:6px;flex-wrap:wrap"></div>
                    </div>
                  </div>
                  <label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="fbAutoSS" type="checkbox" checked /> <span id="fbAutoLabel">${t('help_auto_screenshot')||'Attach automatic screenshot of current view'}</span></label>
                  <label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="fbMeta" type="checkbox" checked /> <span id="fbMetaLabel">${t('help_include_meta')||'Include anonymous technical data'}</span></label>
                  <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input id="fbConsent" type="checkbox" /> <span id="fbConsentLabel">${t('consent_label')||'I consent to processing the data I submit'}</span> · <a href="#" id="fbPrivacy" target="_blank" rel="noopener">${t('privacy')||'Privacy policy'}</a></label>
                  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
                    <button class="btn secondary" id="fbCancel" type="button">${t('help_cancel')||'Cancel'}</button>
                    <button class="btn" id="fbSend" type="button">${t('help_send')||'Send'}</button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Language Switcher -->
            <div class="hdr-lang">
              <button class="hdr-btn hdr-lang-btn" aria-label="${t('choose_language_aria')}" aria-haspopup="menu" aria-expanded="false" id="lang-trigger">
                <span class="hdr-flag">🇵🇱</span><span class="hdr-lang-code">PL</span>
                <svg class="hdr-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
              <div class="hdr-popover hdr-lang-pop" role="menu" aria-labelledby="lang-trigger" id="lang-popover" hidden>
                <ul class="hdr-lang-list" role="none">
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="pl"><span>🇵🇱</span><b>PL</b><em>Polski</em></button></li>
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="ru"><span>🇷🇺</span><b>RU</b><em>Русский</em></button></li>
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="uk"><span>🇺🇦</span><b>UA</b><em>Українська</em></button></li>
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="it"><span>🇮🇹</span><b>IT</b><em>Italiano</em></button></li>
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="fr"><span>🇫🇷</span><b>FR</b><em>Français</em></button></li>
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="de"><span>🇩🇪</span><b>DE</b><em>Deutsch</em></button></li>
                  <li role="none"><button role="menuitemradio" aria-checked="false" data-lang="en"><span>🇬🇧</span><b>EN</b><em>English</em></button></li>
                </ul>
              </div>
            </div>
            <div class="theme" aria-label="${t("theme")}" style="margin-left:8px;">
              <div class="toggle" id="themeToggle" role="button" aria-pressed="${
                theme !== "dark"
              }" tabindex="0" title="${t('toggle_theme_title')}">
                <div class="knob" id="themeKnob">${
                  theme === "dark" ? "☾" : (theme === "sepia" ? "📖" : "☀")
                }</div>
              </div>
            </div>
            <input type="checkbox" id="gridToggle" checked style="display:none" />
          </header>
          

          <!-- Welcome banner -->
          <div class="welcome-banner" id="welcomeBanner">
            <button class="close-btn" onclick="this.parentElement.style.display='none'">×</button>
            <div style="color: #065f46; font-size: 14px; line-height: 1.5;">${t("welcome_banner")}</div>
          </div>

          <div class="topbar">
            <div>
              <div class="brand">
                <span class="brand-name">${t("title_vanfit")}</span>
              </div>
              <div class="title">${t("heading")}</div>
              <div class="muted" style="color:var(--muted); font-size:.95rem">${t(
                "sub"
              )}</div>
            </div>
          </div>

          <div class="row" id="vehRow">
            <span id="addVehChipInline" class="chip click" style="background:transparent;border:1px dashed var(--line);"><span class="plus-green">➕</span> ${t("custom_vehicle")}</span>
            <label for="vehSel">${t("vehicle")}</label>
            <select id="vehSel"></select>
            <div class="chip" id="vehDims"></div>
            <div class="chip" id="vehPayload"></div>
            <div class="chip" id="vehPallets"></div>
            <div class="chip" id="vehLDM"></div>
          </div>
          <div id="vehDD" class="veh-dd" aria-label="${t("vehicle")}" role="menu" hidden></div>
          <div id="custDD" class="veh-dd" aria-label="${t("custom_vehicle")}" role="dialog" hidden></div>


          <!-- Własny pojazd – rozwijany panel + akcje w jednej linii -->
          <section class="expander" id="vehExpander" data-open="false">
            <header class="expander-head" role="button" tabindex="0" aria-expanded="false" title="${t('open_close_title')}">
              <div class="head-left" style="display:flex;align-items:center;gap:10px">
                <div class="head-actions" aria-label="${t('selected_actions_aria')}" style="display:flex;gap:8px">
                  <button class="btn secondary" data-act="stack-+">${t("stacking_plus")}</button>
                  <button class="btn secondary" data-act="stack--">${t("stacking_minus")}</button>
                  <button class="btn secondary" data-act="autopack">🤖 ${t("autopack")}</button>
                  <button class="btn secondary" data-act="altpack">🎲 ${t("try_another")}</button>
                </div>
              </div>
              <div class="spacer"></div>
              <span class="caret" aria-hidden="true"></span>
            </header>
            <!-- Body removed: inline vehicle inputs and create button no longer shown -->
          </section>
          

          <div class="grid">
            <div class="stage-card">
              <div class="stage-wrap">
                <svg class="board" tabindex="0" aria-label="Board"></svg>
                <!-- Overlay viewport: floor (canvas), overlay (svg), labels (div) -->
                <section id="viewport" tabindex="0" aria-hidden="true">
                  <canvas id="floor"></canvas>
                  <svg id="overlay" aria-hidden="true"></svg>
                  <div id="labels" aria-hidden="true"></div>
                </section>
                <!-- Three.js viewport (hidden until 3D mode) -->
                <section id="view3d" aria-label="${t("view_3d")}" tabindex="0" hidden></section>
                <canvas class="board3d" id="board3d" aria-label="Board 3D"></canvas>
                <div class="hud-layer" id="hudLayer"></div>
                <svg class="boardB" aria-label="Board B"></svg>
                <!-- Floating controls: view toggle (top-right) + reset (bottom-right) -->
                <div class="floating-view"><button class="glass-btn" id="view3D">3D</button></div>
                <div class="floating-reset">
                  <button class="glass-btn" data-act="undo">${t("undo")}</button>
                  <button class="glass-btn" data-act="reset">${t("reset")}</button>
                </div>
              </div>
              <div id="errBox" class="error" aria-hidden="true"></div>

              

              <!-- UNDERBAR just under cargo area -->
              <div class="underbar">
                <!-- Metrics on the left -->
                <div class="metrics-bar" style="flex:1;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
                  <div class="card">
                    <div style="display:flex;justify-content:space-between"><span>${t(
                      "volume_used"
                    )}</span><span id="volText"></span></div>
                    <progress id="volBar" value="0" max="100"></progress>
                  </div>
                  <div class="card">
                    <div style="display:flex;justify-content:space-between"><span>${t(
                      "weight_used"
                    )}</span><span id="kgText"></span></div>
                    <progress id="kgBar" value="0" max="100"></progress>
                  </div>
                  <span class="badge ok" id="fitBadge">${t("fits")}</span>
                  <span class="badge" id="leftBadge"></span>
                  <span class="tiny" id="axleInfo" style="display:block;margin-top:4px"></span>
                  <div id="warnList" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"></div>
                </div>
                <!-- Actions on the right -->
                <div class="actions-bar" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
                  <button class="btn secondary" data-act="redo">⟳ ${t(
                    "redo"
                  )}</button>
                  <button class="btn secondary" data-act="rotR">${
                    t("rotateR") || "↷ 90°"
                  }</button>
                  <button class="btn secondary" data-act="compare">🆚 ${t("ab_test") || 'A/B'}</button>
                  <button class="btn secondary" data-act="stackAll">🧱 ${t(
                    "stackAll"
                  )}</button>
                  <button class="btn secondary" data-act="prevVar">⬅ ${t(
                    "prev"
                  )}</button>
                  <span id="varLabel" class="chip" style="align-self:center">${t("variant")} 0/0</span>
                  <button class="btn secondary" data-act="nextVar">${t("next")} ➡</button>
                  <button class="btn secondary" id="sketch3D" title="${t('sketch_mode_title')}">✏️ ${t('sketch_mode')}</button>
                  <!-- 3D camera presets -->
                  <button class="btn secondary" data-act="camTop">${t("view_top")}</button>
                  <button class="btn secondary" data-act="camSide">${t("view_side")}</button>
                  <button class="btn secondary" data-act="camRear">${t("view_rear")}</button>
                  <button class="btn secondary" data-act="camRearLeft">${t("view_rear_left") || '3/4 rear-left'}</button>
                  <button class="btn secondary" data-act="camPersp">${t("view_perspective")}</button>
                  <!-- 3D modes -->
                  <button class="btn secondary" data-act="camOverview">${t("overview")}</button>
                  <button class="btn secondary" data-act="sectionToggle">${t("section")}</button>
                  <input type="range" id="sectionSlider" min="0" max="100" value="50" title="${t('section_pos_title')}" style="width:140px;display:none">
                  <button class="btn secondary" data-act="layer1" title="${t("layer")} 1">${t("layer")} 1</button>
                  <button class="btn secondary" data-act="layer2" title="${t("layer")} 2">${t("layer")} 2</button>
                  <button class="btn secondary" data-act="layer3" title="${t("layer")} 3">${t("layer")} 3</button>
                  <button class="btn secondary" data-act="layerAll" title="${t("all")}">${t("all")}</button>
                  <button class="btn secondary" data-act="top2d" title="${t("top2d")}">${t("top2d")}</button>
                  <button class="btn secondary" data-act="camAll" title="${t("show_all")}">${t("show_all")}</button>
                  <button class="btn secondary" data-act="camLoaded" title="${t("show_loaded")}">${t("show_loaded")}</button>
                  <button class="btn secondary tiny" data-act="stack-+" title="${t("stacking_plus")}">＋</button>
                  <button class="btn secondary tiny" data-act="stack--" title="${t("stacking_minus")}">−</button>
                  <button class="btn ghost" data-act="delete" title="${t("deleteSel")}">${t("deleteSel")}</button>
                </div>
              </div>
            </div>

            <aside class="side">
              <h4>${t("bulk_title")}</h4>
              <div class="bulk">
                <textarea id="bulkText" rows="4" placeholder="${t(
                  "bulk_hint"
                )}"></textarea>
                <div class="row" style="margin-top:8px">
                  <button class="btn" id="bulkAdd">${t("bulk_btn")}</button>
                  <span class="note">${t("keywords")}</span>
                </div>
                <div id="bulkOut" class="out" aria-live="polite"></div>
              </div>

              <h4>${t("quick_presets")}</h4>
              <div class="preset-list"></div>

              <!-- Custom item section removed as per request -->

              <div class="selected-panel" id="selPanel">
                <h4>${t("selected_item")}</h4>
                <!-- Przyciski zostały przeniesione nad sekcję "Własny pojazd" -->
              </div>

              <!-- Moved metrics and status into bottom bar -->

              <details>
                <summary>${t("loading_rules")}</summary>
                <ul style="margin:8px 0 0 18px; color:var(--muted)">
                  <li>Ciężkie sztuki bliżej środka (40–60% długości) i osi szerokości.</li>
                  <li>Unikaj przekroczeń szerokości i wysokości – to twarde ograniczenia.</li>
                  <li>Piętrowanie tylko gdy stabilne i nośność dolnej warstwy nie jest przekroczona.</li>
                  <li>Wysokie/wąskie elementy – nie przy samej burcie; dociśnij je innymi lub pasami.</li>
                  <li>LDM traktuj jako wskaźnik długości zajętej względem szerokości naczepy.</li>
                </ul>
              </details>

              <div class="actions">
                <button class="btn secondary" data-act="save">💾 ${t(
                  "save"
                )}</button>
                <button class="btn secondary" data-act="share">🔗 ${t(
                  "share"
                )}</button>
                <button class="btn" id="pdfExport">🖨️ ${t("export_pdf")}</button>
              </div>
              <div id="analyzedPanel" class="tiny" style="margin-top:6px; color:var(--muted)">
                <span id="analyzedLabel">${t('analyzed_items') || 'Items analyzed'}</span>: <b id="analyzedNum">0</b>
              </div>
            </aside>
          </div>
        </div>

        
        <div id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
      `;

      // Theme toggle (AUTO + MANUAL)
      const themeToggle = mount.querySelector("#themeToggle");
      const themeKnob = mount.querySelector("#themeKnob");
      // Button hover/press JS: add press class for crisper feel on pointerdown
      (function enhanceButtons(){
        try {
          const btns = mount.querySelectorAll('.btn, #toolbar button, .hdr-btn');
          btns.forEach(btn => {
            btn.addEventListener('pointerdown', () => btn.classList.add('is-pressing'));
            ['pointerup','pointerleave','pointercancel','blur'].forEach(ev => btn.addEventListener(ev, ()=> btn.classList.remove('is-pressing')));
          });
        } catch(_) {}
      })();
          function setTheme(th) {
            mount.setAttribute("data-theme", th);
            try {
              themeKnob.textContent = (th === 'dark') ? '☾' : (th === 'sepia' ? '📖' : '☀');
            } catch(_){}
            try { themeToggle?.setAttribute('aria-pressed', String(th !== 'dark')); } catch(_){}
          }
          // Enable MANUAL toggle: click = jasny/ciemny (zapis), Shift+klik = AUTO
          try {
            themeToggle?.removeAttribute('aria-disabled');
            themeToggle?.style?.removeProperty('pointer-events');
            const baseTitle = t('toggle_theme_title') || 'Przełącz motyw';
            function updateToggleTitle(){
              const mode = (localStorage.getItem(THEME_KEY) || 'auto');
              const cur = mount.getAttribute('data-theme') || 'dark';
              const tip = ' (klik: jasny/sepia/ciemny; Shift+klik: auto)';
              themeToggle?.setAttribute('title', baseTitle + (mode==='auto' ? ' — AUTO' : ' — MANUAL') + ` [${cur}]` + tip);
            }
            updateToggleTitle();
            themeToggle?.addEventListener('click', (e) => {
              if (e.shiftKey) {
                localStorage.setItem(THEME_KEY, 'auto');
                setTheme(prefersLight.matches ? 'light' : 'dark');
                updateToggleTitle();
                return;
              }
              // Manual cycle: light -> sepia -> dark -> light
              const now = mount.getAttribute('data-theme') || 'dark';
              const next = (now === 'light') ? 'sepia' : (now === 'sepia' ? 'dark' : 'light');
              localStorage.setItem(THEME_KEY, next);
              setTheme(next);
              updateToggleTitle();
            });
            themeToggle?.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); themeToggle?.click(); }
              if (e.key.toLowerCase?.() === 'a') { // A -> AUTO
                e.preventDefault();
                localStorage.setItem(THEME_KEY, 'auto');
                setTheme(prefersLight.matches ? 'light' : 'dark');
                updateToggleTitle();
              }
            });
          } catch(_) {}

          // Language switcher wiring
  (function(){
            const btn = mount.querySelector('#lang-trigger');
            const pop = mount.querySelector('#lang-popover');
            const FLAGS = { pl:'🇵🇱', ru:'🇷🇺', uk:'🇺🇦', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', en:'🇬🇧' };
            const CODEMAP = { uk: 'UA' };
            function updateButton(){
              try {
                btn.querySelector('.hdr-flag').textContent = FLAGS[lang] || '🏳️';
                btn.querySelector('.hdr-lang-code').textContent = (CODEMAP[lang] || lang || 'pl').toUpperCase();
                pop?.querySelectorAll('[role="menuitemradio"]').forEach(el=>{
                  const on = el.getAttribute('data-lang') === lang;
                  el.setAttribute('aria-checked', String(on));
                });
              } catch(_) {}
            }
            function setLang(code){
              if (!code) return;
              lang = code;
              localStorage.setItem('vp_lang', lang);
              try { document.documentElement.setAttribute('lang', lang); } catch(_) {}
              try { mount.setAttribute('data-lang', lang); } catch(_) {}
              updateButton();
              // Update texts that were created once
              try { const tl = mount.querySelector('.title'); if (tl) tl.textContent = t('heading'); } catch(_) {}
              try { const sb = mount.querySelector('.muted'); if (sb) sb.textContent = t('sub'); } catch(_) {}
              try { const wb = mount.querySelector('#welcomeBanner div'); if (wb) wb.textContent = t('welcome_banner'); } catch(_) {}
              // Toolbar button labels
              try { const tg = mount.querySelector('#toggleGrid'); if (tg) tg.textContent = t('grid'); } catch(_) {}
              try { const rv = mount.querySelector('#resetView'); if (rv) rv.textContent = t('reset_view'); } catch(_) {}
              // Settings button & popover text
              try { const sb = mount.querySelector('#settings-trigger'); if (sb) { sb.setAttribute('aria-label', t('settings')||'Settings'); sb.setAttribute('title', t('settings')||'Settings'); } } catch(_) {}
              try { const sc = mount.querySelector('#settings-popover .settings-content'); if (sc) sc.textContent = t('settings_soon') || sc.textContent; } catch(_) {}
              // Help/Feedback texts
              try { const hb = mount.querySelector('#help-trigger'); if (hb) { hb.setAttribute('aria-label', t('help')||'Help'); hb.setAttribute('title', t('help')||'Help'); } } catch(_) {}
              try {
                const hp = mount.querySelector('#help-popover'); if (hp){
                  const set = (sel, key)=>{ const el = hp.querySelector(sel); if (el) el.textContent = t(key)||el.textContent; };
                  set('#fbTitle','help_title'); set('#fbIntro','help_intro'); set('#fbCatLabel','help_category');
                  set('#fbSubjLabel','help_subject'); set('#fbMsgLabel','help_message'); set('#fbEmailLabel','help_email_optional'); set('#fbAttLabel','help_attachments'); set('#fbPasteHint','help_paste_hint');
                  set('#fbAutoLabel','help_auto_screenshot'); set('#fbMetaLabel','help_include_meta'); set('#fbConsentLabel','consent_label');
                  const add = hp.querySelector('#fbAddFiles'); if (add) add.textContent = t('help_add_files');
                  const send = hp.querySelector('#fbSend'); if (send) send.textContent = t('help_send');
                  const can = hp.querySelector('#fbCancel'); if (can) can.textContent = t('help_cancel');
                  const pr = hp.querySelector('#fbPrivacy'); if (pr) pr.textContent = t('privacy');
                  const subj = hp.querySelector('#fbSubj'); if (subj) subj.setAttribute('placeholder', t('help_subject'));
                  const msg = hp.querySelector('#fbMsg'); if (msg) msg.setAttribute('placeholder', t('help_message'));
                  const opt = [ ['option[value="bug"]','help_category_bug'], ['option[value="idea"]','help_category_idea'], ['option[value="ux"]','help_category_ux'] ];
                  opt.forEach(([sel,key])=>{ const el = hp.querySelector(sel); if (el) el.textContent = t(key)||el.textContent; });
                }
              } catch(_) {}
              // Analyzed counter label
              try { const al = mount.querySelector('#analyzedLabel'); if (al) al.textContent = t('analyzed_items'); } catch(_) {}
              // Status label
              try { const st = mount.querySelector('#status'); if (st) st.textContent = t('status_ready') || st.textContent; } catch(_) {}
              // Vehicle row labels
              try { const br = mount.querySelector('.brand-name'); if (br) br.textContent = t('title_vanfit'); } catch(_) {}
              try { const vehLbl = mount.querySelector('label[for="vehSel"]'); if (vehLbl) vehLbl.textContent = t('vehicle'); } catch(_) {}
            try { const chip = mount.querySelector('#addVehChipInline'); if (chip) chip.innerHTML = '<span class="plus-green">➕</span> ' + t('custom_vehicle'); } catch(_) {}
              // Side panel headers + bulk controls
              try {
                const sideH = mount.querySelectorAll('aside.side > h4');
                if (sideH[0]) sideH[0].textContent = t('bulk_title');
                if (sideH[1]) sideH[1].textContent = t('quick_presets');
                if (sideH[2]) sideH[2].textContent = t('custom_item');
                const selH = mount.querySelector('#selPanel h4'); if (selH) selH.textContent = t('selected_item');
                const sum = mount.querySelector('aside.side details > summary'); if (sum) sum.textContent = t('loading_rules');
                const bulkBtn = mount.querySelector('#bulkAdd'); if (bulkBtn) bulkBtn.textContent = t('bulk_btn');
                const bulkNote = mount.querySelector('.bulk .note'); if (bulkNote) bulkNote.textContent = t('keywords');
                const bulkTA = mount.querySelector('#bulkText'); if (bulkTA) bulkTA.setAttribute('placeholder', t('bulk_hint'));
                const cStackLbl = mount.querySelector('#cStack')?.closest('label')?.querySelector('span'); if (cStackLbl) cStackLbl.textContent = t('stackable');
              } catch(_) {}
              // Actions bar (buttons)
              try {
                const setBtn = (sel, label, prefix='')=>{ const el = mount.querySelector(sel); if (el) el.textContent = prefix + t(label); };
                setBtn("[data-act=\"undo\"]", 'undo', '⟲ ');
                setBtn("[data-act=\"redo\"]", 'redo', '⟳ ');
                const rotR = mount.querySelector('[data-act=\"rotR\"]'); if (rotR) rotR.textContent = t('rotateR') || t('rotate_right') || rotR.textContent;
                setBtn("[data-act=\"autopack\"]", 'autopack', '🤖 ');
                setBtn("[data-act=\"altpack\"]", 'try_another', '🎲 ');
                const cmp = mount.querySelector('[data-act=\"compare\"]'); if (cmp) cmp.textContent = '🆚 ' + (t('ab_test')||'A/B');
                setBtn("[data-act=\"stackAll\"]", 'stackAll', '🧱 ');
                setBtn("[data-act=\"prevVar\"]", 'prev', '⬅ ');
                const vl = mount.querySelector('#varLabel'); if (vl) { const m = vl.textContent.match(/(\d+\/\d+)/); const nn = m? m[1] : '0/0'; vl.textContent = `${t('variant')} ${nn}`; }
                setBtn("[data-act=\"nextVar\"]", 'next');
            const v3 = mount.querySelector('#view3D'); if (v3) v3.textContent = (state.viewMode === '3d') ? '2D' : '3D';
                const sk = mount.querySelector('#sketch3D'); if (sk) { sk.textContent = '✏️ ' + t('sketch_mode'); sk.setAttribute('title', t('sketch_mode_title')); }
                const rl = mount.querySelector('[data-act=\"camRearLeft\"]'); if (rl) rl.textContent = t('view_rear_left') || '3/4 rear-left';
                const m = [ ['camTop','view_top'], ['camSide','view_side'], ['camRear','view_rear'], ['camPersp','view_perspective'], ['camOverview','overview'], ['sectionToggle','section'] ];
                m.forEach(([act,key])=>{ const el = mount.querySelector(`[data-act=\"${act}\"]`); if (el) el.textContent = t(key); });
                const l1 = mount.querySelector('[data-act=\"layer1\"]'); if (l1) l1.textContent = `${t('layer')} 1`;
                const l2 = mount.querySelector('[data-act=\"layer2\"]'); if (l2) l2.textContent = `${t('layer')} 2`;
                const l3 = mount.querySelector('[data-act=\"layer3\"]'); if (l3) l3.textContent = `${t('layer')} 3`;
                const la = mount.querySelector('[data-act=\"layerAll\"]'); if (la) la.textContent = t('all');
                const top2d = mount.querySelector('[data-act=\"top2d\"]'); if (top2d) { top2d.textContent = t('top2d'); top2d.setAttribute('title', t('top2d')); }
                setBtn('[data-act=\"camAll\"]','show_all');
                setBtn('[data-act=\"camLoaded\"]','show_loaded');
                const delSel = mount.querySelector('[data-act=\"delete\"]'); if (delSel) delSel.textContent = t('deleteSel');
                const pdf = mount.querySelector('#pdfExport'); if (pdf) pdf.textContent = '🖨️ ' + t('export_pdf');
              } catch(_) {}
              // Metrics labels (volume/weight)
              try {
                const vtx = mount.querySelector('#volText'); if (vtx && vtx.parentElement?.firstElementChild) vtx.parentElement.firstElementChild.textContent = t('volume_used');
                const kgt = mount.querySelector('#kgText'); if (kgt && kgt.parentElement?.firstElementChild) kgt.parentElement.firstElementChild.textContent = t('weight_used');
              } catch(_) {}
              // Inline vehicle form labels
              try {
                const lbKg = mount.querySelector('label[for="vKg"]'); if (lbKg) lbKg.textContent = t('payload');
                const lbEP = mount.querySelector('label[for="vEP"]'); if (lbEP) lbEP.textContent = (t('eur_pallets')||'EP');
                const lbGrid = mount.querySelector('label[for="vGrid"]'); if (lbGrid) lbGrid.textContent = t('grid') + ' (cm)';
              } catch(_) {}
              // Rebuild presets to localize any item text
              try { renderPresets(); } catch(_) {}
              // Refresh static attributes/texts
              try {
                const tb = mount.querySelector('#toolbar'); if (tb) tb.setAttribute('aria-label', t('tools_aria'));
                const lt = mount.querySelector('#lang-trigger'); if (lt) lt.setAttribute('aria-label', t('choose_language_aria'));
                const th = mount.querySelector('#themeToggle'); if (th) { const mode = (localStorage.getItem('vp_theme_mode')||'auto'); const cur = mount.getAttribute('data-theme')||'dark'; th.setAttribute('title', (t('toggle_theme_title')||'Przełącz motyw') + (mode==='auto'?' — AUTO':' — MANUAL') + ` [${cur}]` + ' (klik: jasny/sepia/ciemny; Shift+klik: auto)'); }
                const sh = mount.querySelector('#toggleSheet'); if (sh) { sh.setAttribute('title', t('panels_title')); sh.firstChild && (sh.firstChild.nodeType===3) ? (sh.firstChild.nodeValue = t('panels_title') + ' ▴▾') : (sh.textContent = t('panels_title') + ' ▴▾'); }
                const hd = mount.querySelector('.expander-head'); if (hd) hd.setAttribute('title', t('open_close_title'));
                const ha = mount.querySelector('.head-actions'); if (ha) ha.setAttribute('aria-label', t('selected_actions_aria'));
                const ss = mount.querySelector('#sectionSlider'); if (ss) ss.setAttribute('title', t('section_pos_title'));
              } catch(_) {}
              try { renderAll(); overlayLabels.updateAll(); updateStatus(); } catch(_) {}
            }
            function openPop(){ if (pop && pop.hasAttribute('hidden')) { pop.removeAttribute('hidden'); btn?.setAttribute('aria-expanded','true'); } }
            function closePop(){ if (pop && !pop.hasAttribute('hidden')) { pop.setAttribute('hidden',''); btn?.setAttribute('aria-expanded','false'); } }
            btn?.addEventListener('click', (e)=>{
              e.stopPropagation();
              if (pop.hasAttribute('hidden')) openPop(); else closePop();
            });
            // Hover to open on non-mobile
            try {
              if (getDevice() !== 'mobile') {
                let hoverTimer = null;
                const scheduleClose = ()=>{ clearTimeout(hoverTimer); hoverTimer = setTimeout(()=> closePop(), 160); };
                const cancelClose   = ()=>{ clearTimeout(hoverTimer); };
                btn?.addEventListener('mouseenter', ()=>{ cancelClose(); openPop(); });
                pop?.addEventListener('mouseenter', ()=> cancelClose());
                btn?.addEventListener('mouseleave', ()=> scheduleClose());
                pop?.addEventListener('mouseleave', ()=> scheduleClose());
              }
            } catch(_) {}
            pop?.querySelectorAll('[data-lang]')?.forEach(el=> el.addEventListener('click', ()=>{
              setLang(el.getAttribute('data-lang'));
              closePop();
            }));
            document.addEventListener('pointerdown', (ev)=>{
              if (!pop || pop.hasAttribute('hidden')) return;
              const t = ev.target; if (!btn.contains(t) && !pop.contains(t)) { closePop(); }
            });
            updateButton();
          })();

          // Settings popover (header)
          (function(){
            const btn = mount.querySelector('#settings-trigger');
            const pop = mount.querySelector('#settings-popover');
            if (!btn || !pop) return;
            function openPop(){ if (pop.hasAttribute('hidden')) { pop.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); } }
            function closePop(){ if (!pop.hasAttribute('hidden')) { pop.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); } }
            btn.addEventListener('click', (e)=>{ e.stopPropagation(); if (pop.hasAttribute('hidden')) openPop(); else closePop(); });
            document.addEventListener('pointerdown', (ev)=>{
              if (!pop || pop.hasAttribute('hidden')) return;
              const t = ev.target; if (!btn.contains(t) && !pop.contains(t)) { closePop(); }
            });
          })();

          // Help / Feedback popover (header)
          (function(){
            const btn = mount.querySelector('#help-trigger');
            const pop = mount.querySelector('#help-popover');
            if (!btn || !pop) return;
            const thumbs = pop.querySelector('#fbThumbs');
            const fileInput = pop.querySelector('#fbFiles');
            const addBtn = pop.querySelector('#fbAddFiles');
            const sendBtn = pop.querySelector('#fbSend');
            const cancelBtn = pop.querySelector('#fbCancel');
            const autoSS = pop.querySelector('#fbAutoSS');
            const metaCb = pop.querySelector('#fbMeta');
            const drop = pop.querySelector('#fbDrop');
            const subj = pop.querySelector('#fbSubj');
            const msg = pop.querySelector('#fbMsg');
            const email = pop.querySelector('#fbEmail');
            const cat = pop.querySelector('#fbCat');
            const consent = pop.querySelector('#fbConsent');
            const privacy = pop.querySelector('#fbPrivacy');
            const MAX_FILES = 3; const MAX_SIZE = 5 * 1024 * 1024; // 5MB/plik
            const stateFb = { files: [] }; // {name,type,dataUrl,size}
            function openPop(){ if (pop.hasAttribute('hidden')) { pop.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); if (autoSS?.checked) captureCurrentView().then(f=> f && addFile(f)).catch(()=>{}); } }
            function closePop(){ if (!pop.hasAttribute('hidden')) { pop.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); } }
            btn.addEventListener('click', (e)=>{ e.stopPropagation(); if (pop.hasAttribute('hidden')) openPop(); else closePop(); });
            document.addEventListener('pointerdown', (ev)=>{
              if (!pop || pop.hasAttribute('hidden')) return;
              const t = ev.target; if (!btn.contains(t) && !pop.contains(t)) { closePop(); }
            });
            try { privacy.href = (window.PRIVACY_URL || '#'); } catch(_) {}
            function renderThumbs(){
              thumbs.innerHTML = '';
              for (let i=0;i<stateFb.files.length;i++){
                const f = stateFb.files[i];
                const box = document.createElement('div'); box.style.position='relative'; box.style.width='56px'; box.style.height='56px'; box.style.border='1px solid var(--line)'; box.style.borderRadius='8px'; box.style.overflow='hidden';
                const img = document.createElement('img'); img.src = f.dataUrl; img.alt = f.name; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
                const rm = document.createElement('button'); rm.type='button'; rm.textContent='×'; rm.style.position='absolute'; rm.style.top='-8px'; rm.style.right='-8px'; rm.style.width='24px'; rm.style.height='24px'; rm.style.borderRadius='12px'; rm.style.border='1px solid var(--line)'; rm.style.background='var(--card)'; rm.style.cursor='pointer';
                rm.addEventListener('click', ()=>{ stateFb.files.splice(i,1); renderThumbs(); });
                box.appendChild(img); box.appendChild(rm); thumbs.appendChild(box);
              }
            }
            function addFile(file){
              if (!file) return false;
              if (stateFb.files.length >= MAX_FILES) { toast('Max 3 files'); return false; }
              if (file.size && file.size > MAX_SIZE) { toast('File too large (>5MB)'); }
              const reader = new FileReader();
              reader.onload = ()=>{ stateFb.files.push({ name: file.name||('screenshot-'+Date.now()+'.jpg'), type: file.type||'image/jpeg', dataUrl: String(reader.result||''), size: file.size||0 }); renderThumbs(); };
              reader.readAsDataURL(file);
              return true;
            }
            addBtn?.addEventListener('click', ()=> fileInput?.click());
            fileInput?.addEventListener('change', ()=>{ const fs = Array.from(fileInput.files||[]); fs.forEach(f=> addFile(f)); fileInput.value=''; });
            function onPaste(e){
              try {
                const items = e.clipboardData?.items || []; let took = 0;
                for (const it of items){ if (it && it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { addFile(f); took++; } } }
                if (took) e.preventDefault();
              } catch(_) {}
            }
            drop?.addEventListener('paste', onPaste);
            pop?.addEventListener('paste', onPaste);
            drop?.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.style.background='var(--soft)'; });
            drop?.addEventListener('dragleave', ()=>{ drop.style.background='transparent'; });
            drop?.addEventListener('drop', (e)=>{ e.preventDefault(); drop.style.background='transparent'; const fs = Array.from(e.dataTransfer?.files||[]); fs.forEach(f=> addFile(f)); });

            function captureCurrentView(){
              return new Promise((resolve)=>{
                try {
                  // Prefer 3D if active
                  if (typeof threeCtx !== 'undefined' && threeCtx && threeCtx.renderer && state.viewMode === '3d') {
                    const url = threeCtx.renderer.domElement.toDataURL('image/jpeg', 0.9);
                    return resolve(dataUrlToFile(url, 'view3d.jpg'));
                  }
                } catch(_){}
                try {
                  const cv = mount.querySelector('#floor');
                  if (cv && cv.toDataURL) {
                    const url = cv.toDataURL('image/jpeg', 0.9);
                    return resolve(dataUrlToFile(url, 'view2d.jpg'));
                  }
                } catch(_){}
                resolve(null);
              });
            }
            function dataUrlToFile(dataUrl, filename){
              try { const arr = dataUrl.split(','), m = arr[0].match(/:(.*?);/), mime = m?m[1]:'image/jpeg'; const bstr = atob(arr[1]); let n=bstr.length; const u8 = new Uint8Array(n); while(n--){u8[n]=bstr.charCodeAt(n);} return new File([u8], filename, { type: mime }); } catch(_) { return null; }
            }
            function collectMeta(){
              const ua = (navigator.userAgentData && navigator.userAgentData.brands) ? navigator.userAgentData.brands.map(b=>b.brand+" "+b.version).join(', ') : navigator.userAgent;
              const dpr = window.devicePixelRatio||1; const lang = (localStorage.getItem('vp_lang')||document.documentElement.getAttribute('lang')||'pl');
              const vw = Math.round(window.innerWidth||0), vh = Math.round(window.innerHeight||0);
              return { lang, viewMode: state.viewMode, dpr, vw, vh, ua, when: new Date().toISOString(), app: 'VanFit' };
            }
            function toast(text){ try { const t = document.getElementById('toast'); if (!t) return; t.textContent = text; t.style.display='block'; setTimeout(()=> t.style.display='none', 2200); } catch(_) {}
            }
            async function onSend(){
              const to = (window.FEEDBACK_EMAIL_TO || 'krastranseu@gmail.com');
              const endpoint = (window.FEEDBACK_ENDPOINT || '');
              const subject = (subj?.value||'').trim();
              const body = (msg?.value||'').trim();
              const from = (email?.value||'').trim();
              const category = (cat?.value||'other');
              if (!subject || !body) { toast('Uzupełnij temat i opis / Fill subject & message'); return; }
              if (!consent?.checked) { toast('Zaznacz zgodę / Please accept consent'); return; }
              const meta = metaCb?.checked ? collectMeta() : {};
              const files = stateFb.files.map(f=> ({ name: f.name, type: f.type, dataUrl: f.dataUrl }));
              const payload = { to, subject: `[${category}] ${subject}`, message: body, from, meta, files };
              try {
                if (endpoint) {
                  const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
                  if (!res.ok) throw new Error('HTTP '+res.status);
                  toast(t('help_sent')||'Sent'); closePop(); return;
                }
                // Fallback: mailto (attachments not included)
                const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body+"\n\n"+JSON.stringify(meta))}`;
                window.location.href = mailto;
                toast(t('help_sent')||'Sent'); closePop();
              } catch(e){ toast(t('help_error')||('Error: '+(e?.message||''))); }
            }
            sendBtn?.addEventListener('click', onSend);
            cancelBtn?.addEventListener('click', closePop);
          })();

          // Cache DOM
          const board = mount.querySelector("svg.board");
          const board3d = mount.querySelector("#board3d");
          const hudLayer = mount.querySelector("#hudLayer");
          const boardB = mount.querySelector("svg.boardB");
          const stageWrap = mount.querySelector(".stage-wrap");
          const section = mount.querySelector("svg.section");
          const secLabel = mount.querySelector("#secLabel");
          const vehSel = mount.querySelector("#vehSel");
          const specsDims = mount.querySelector("#vehDims");
          const specsPayload = mount.querySelector("#vehPayload");
          const specsPallets = mount.querySelector("#vehPallets");
          const specsLDM = mount.querySelector("#vehLDM");
          const presetList = mount.querySelector(".preset-list");
          const volBar = mount.querySelector("#volBar");
          const kgBar = mount.querySelector("#kgBar");
          const volText = mount.querySelector("#volText");
          const kgText = mount.querySelector("#kgText");
          const fitBadge = mount.querySelector("#fitBadge");
          const leftBadge = mount.querySelector("#leftBadge");
          const selPanel = mount.querySelector("#selPanel");
          const errBox = mount.querySelector("#errBox");
          const varLabel = mount.querySelector("#varLabel");
          const view3DBtn = mount.querySelector("#view3D");
          const view3d = mount.querySelector("#view3d");
          const sectionSlider = mount.querySelector('#sectionSlider');
          const toggleSheetBtn = mount.querySelector('#toggleSheet');
          const pdfBtn = mount.querySelector('#pdfExport');
          const analyzedPanel = mount.querySelector('#analyzedPanel');
          const analyzedLabel = mount.querySelector('#analyzedLabel');
          const analyzedNum = mount.querySelector('#analyzedNum');

          // Bulk parser elements
          const bulkText = mount.querySelector("#bulkText");
          const bulkAdd = mount.querySelector("#bulkAdd");
          const bulkOut = mount.querySelector("#bulkOut");

          // Add vehicle form element (inline create button removed)
          // Analyzed counter helpers
          function updateAnalyzedUI(){
            try { if (analyzedNum) analyzedNum.textContent = String((state.stats && state.stats.analyzed) || 0); } catch(_) {}
          }
          function addAnalyzed(n){
            try {
              if (!state.stats) state.stats = { analyzed: 0 };
              const delta = Number(n)||0;
              state.stats.analyzed = Math.max(0, (state.stats.analyzed||0) + delta);
              updateAnalyzedUI();
            } catch(_) {}
          }
          try { window.addAnalyzed = addAnalyzed; window.updateAnalyzedUI = updateAnalyzedUI; } catch(_) {}
          try { updateAnalyzedUI(); } catch(_) {}
