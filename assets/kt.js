/*!
 * KRAS-TRANS UI JS — 1.0
 * - mega-menu (desktop), drawer (mobile) + focus trap
 * - języki (dropdown), theme toggle (dark/light)
 * - „hero title” rozsuwa się na boki przy scrollu sekcji ofert
 * - rail ofert: h-scroll, 3D tilt, „tap-hint” na dociągniętym kafelku
 * - mobile dock (Home / Wycena / Menu) — zawsze widoczny na tel.
 * - lekki formatter treści z arkusza: \n, **bold**, wypunktowania (- / •)
 */

(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const raf = (fn) => (window.requestAnimationFrame || setTimeout)(fn, 0);
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LANG = (document.documentElement.getAttribute('lang') || 'pl').toLowerCase();

  /* =========================
     THEME (dark/light)
     ========================= */
  const themeBtn = $('#themeToggle');
  const THEME_KEY = 'kt-theme';
  function applyTheme(val) {
    // val: 'light' | 'dark' | null
    if (val === 'light') document.body.setAttribute('data-theme', 'light');
    else document.body.removeAttribute('data-theme'); // dark (domyślnie)
    try { localStorage.setItem(THEME_KEY, val || 'dark'); } catch {}
  }
  (function initTheme(){
    try {
      const saved = localStorage.getItem(THEME_KEY);
      applyTheme(saved === 'light' ? 'light' : 'dark');
    } catch {
      applyTheme('dark');
    }
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const cur = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        applyTheme(cur === 'light' ? 'dark' : 'light');
      });
    }
  })();

  /* =========================
     LANG DROPDOWN
     ========================= */
  (function initLangDropdown(){
    const wrap = $('[data-lang]');
    if (!wrap) return;
    const btn = wrap.querySelector('button');
    const panel = $('#lang-panel');
    if (!btn || !panel) return;

    function close() { wrap.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-expanded','false'); }
    function toggle() {
      const exp = wrap.getAttribute('aria-expanded') === 'true';
      wrap.setAttribute('aria-expanded', String(!exp));
      btn.setAttribute('aria-expanded', String(!exp));
    }
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); });
    document.addEventListener('click', (e)=>{ if(!wrap.contains(e.target)) close(); });
    wrap.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ close(); btn.focus(); }});
  })();

  /* =========================
     MEGA MENU (desktop)
     ========================= */
  (function initMegaMenu(){
    const header = $('#header');
    const navBtns = $$('.nav__btn[data-panel]');
    if (!header || !navBtns.length) return;

    const panels = {
      services: $('#panel-services'),
      industries: $('#panel-industries'),
      resources: $('#panel-resources')
    };
    let opened = null;

    function openPanel(id, focusFirst=false){
      closePanels();
      const btn = $(`.nav__btn[data-panel="${id}"]`);
      const panel = $(`#panel-${id}`);
      if(!btn || !panel) return;
      btn.setAttribute('aria-expanded','true');
      panel.hidden = false;
      opened = id;
      document.addEventListener('keydown', onEsc);
      document.addEventListener('click', onDoc);
      if(focusFirst){
        const f = panel.querySelector('a,button'); f && f.focus();
      }
    }
    function closePanels(){
      navBtns.forEach(b=>b.setAttribute('aria-expanded','false'));
      Object.values(panels).forEach(p=>{ if(p){ p.hidden = true; } });
      opened = null;
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('click', onDoc);
    }
    function onEsc(e){ if(e.key==='Escape'){ closePanels(); } }
    function onDoc(e){
      const inHeader = header.contains(e.target);
      const onBtn = e.target.closest('.nav__btn[data-panel]');
      const onPanel = e.target.closest('.panel');
      if(!inHeader || (!onBtn && !onPanel)) closePanels();
    }
    navBtns.forEach(btn=>{
      const id = btn.dataset.panel;
      btn.addEventListener('click', ()=> opened===id ? closePanels() : openPanel(id));
      btn.addEventListener('mouseenter', ()=> window.matchMedia('(min-width: 900px)').matches && openPanel(id));
      btn.addEventListener('keydown', (e)=>{
        if(e.key==='ArrowDown'){ e.preventDefault(); openPanel(id, true); }
      });
    });
    header.addEventListener('mouseleave', ()=> window.matchMedia('(min-width: 900px)').matches && closePanels());
  })();

  /* =========================
     DRAWER (mobile) + accordions + focus trap
     ========================= */
  (function initDrawer(){
    const drawer = $('#drawer');
    const openBtn = $('#hamburger');
    const closeBtn = $('#drawerClose');
    if (!drawer || !openBtn || !closeBtn) return;

    let lastFocus = null;
    const focusSel = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

    function lockBody(lock){
      document.documentElement.style.overflow = lock ? 'hidden' : '';
      document.body.style.overflow = lock ? 'hidden' : '';
    }
    function trapFocus(node){
      const f = $$(focusSel, node);
      if(!f.length) return;
      const first = f[0], last = f[f.length - 1];
      function onKey(e){
        if(e.key!=='Tab') return;
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
      node.__trap = onKey;
      node.addEventListener('keydown', onKey);
    }
    function releaseFocus(node){
      if(node.__trap) node.removeEventListener('keydown', node.__trap);
      if (lastFocus) lastFocus.focus();
    }

    function open(){
      lastFocus = document.activeElement;
      drawer.hidden = false;
      raf(()=>{ drawer.classList.add('open'); });
      lockBody(true);
      trapFocus(drawer);
      openBtn.setAttribute('aria-expanded','true');
    }
    function close(){
      drawer.classList.remove('open');
      openBtn.setAttribute('aria-expanded','false');
      setTimeout(()=>{ drawer.hidden = true; releaseFocus(drawer); lockBody(false); }, 250);
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    drawer.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });

    // accordions
    $$('.acc', drawer).forEach(acc=>{
      const btn = acc.querySelector('.acc__btn');
      const panel = acc.querySelector('.acc__panel');
      if(!btn || !panel) return;
      acc.setAttribute('aria-expanded','false');
      btn.addEventListener('click', ()=>{
        const exp = acc.getAttribute('aria-expanded')==='true';
        acc.setAttribute('aria-expanded', String(!exp));
      });
    });

    // zamknij, gdy klikniemy poza panel (bez overlayu)
    drawer.addEventListener('click', (e)=>{
      const body = $('.drawer__body', drawer);
      const head = $('.drawer__head', drawer);
      if(!body.contains(e.target) && !head.contains(e.target)) close();
    });

    // chowaj drawer na desktopie, jeśli ktoś zmieni rozmiar
    window.addEventListener('resize', ()=>{
      if(window.matchMedia('(min-width: 860px)').matches) close();
    });
  })();

  /* =========================
     MOBILE DOCK (stały)
     ========================= */
  (function initDock(){
    if (window.matchMedia('(min-width: 860px)').matches) return; // tylko tel
    if ($('.mobile-dock')) return;

    const dock = document.createElement('nav');
    dock.className = 'mobile-dock';
    dock.innerHTML = `
      <button class="mobile-dock__btn" data-act="home" aria-label="Home">
        <svg class="mobile-dock__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10.5l9-7 9 7v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9z" stroke="currentColor" stroke-width="2"/><path d="M9 21v-6h6v6" stroke="currentColor" stroke-width="2"/></svg>
        <span class="mobile-dock__label">Home</span>
      </button>
      <button class="mobile-dock__btn mobile-dock__btn--primary" data-act="quote" aria-label="Wycena">
        <svg class="mobile-dock__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="mobile-dock__label">Wycena</span>
      </button>
      <button class="mobile-dock__btn" data-act="menu" aria-label="Menu">
        <svg class="mobile-dock__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="mobile-dock__label">Menu</span>
      </button>
    `;
    document.body.appendChild(dock);

    dock.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-act]');
      if(!btn) return;
      const act = btn.dataset.act;
      if (act === 'home') {
        window.location.href = `/${LANG}/`;
      } else if (act === 'quote') {
        const q = document.getElementById('quote');
        if (q) q.scrollIntoView({behavior:'smooth', block:'start'});
        else {
          // fallback: spróbuj linku do kontaktu z nagłówka/paneli
          const contactLink = $('a[href*="kontakt"], a[href*="contact"]');
          if (contactLink) window.location.href = contactLink.href;
        }
      } else if (act === 'menu') {
        const openBtn = $('#hamburger');
        openBtn && openBtn.click();
      }
    });
  })();

  /* =========================
     HERO TITLE — „rozsuń” na scroll sekcji ofert
     ========================= */
  (function initHeroTitleScroll(){
    const section = $('#offer-reveal');
    if (!section) return;
    const title = $('.split-hero__title', section);
    const L = $('.title-left', title);
    const R = $('.title-right', title);
    if (!title || !L || !R) return;

    let ticking = false;

    function update(){
      ticking = false;
      const rect = section.getBoundingClientRect();
      // progress w zakresie [-0.2, 1.2] dla płynności (0..1 używamy realnie)
      const vh = window.innerHeight || 1;
      const start = vh * 0.15; // kiedy zacząć (po ~15vh)
      const span  = vh * 0.35; // przez ile „wysuwać”
      const p = clamp((start - rect.top) / span, 0, 1);

      const shift = 22 * p; // % przesunięcia w bok
      const op    = 1 - p;  // wygaszanie
      L.style.transform = `translateX(${-2 - shift}%)`;
      R.style.transform = `translateX(${2 + shift}%)`;
      L.style.opacity = R.style.opacity = String(op);
    }

    function onScroll(){
      if (ticking) return;
      ticking = true;
      raf(update);
    }

    update();
    document.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', onScroll);
  })();

  /* =========================
     OFFER RAIL — 3D tilt + snap „tap-hint”
     ========================= */
  (function initOfferRail(){
    const rail = $('#offer-rail');
    if (!rail) return;
    const cards = $$('.offer-card', rail);
    if (!cards.length) return;

    const MAX_TILT = 12; // deg (trend)
    let focIdx = -1;
    let hintTimer = null;

    function setTilt(card, ev){
      if (prefersReduced) return;
      const r = card.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;   // 0..1
      const y = (ev.clientY - r.top)  / r.height;  // 0..1
      const ry = (x - 0.5) * (MAX_TILT * 2);       // rotateY
      const rx = (0.5 - y) * (MAX_TILT * 1.6);     // rotateX
      card.style.setProperty('--tiltX', rx.toFixed(2) + 'deg');
      card.style.setProperty('--tiltY', ry.toFixed(2) + 'deg');
    }
    function resetTilt(card){
      card.style.setProperty('--tiltX','0deg');
      card.style.setProperty('--tiltY','0deg');
    }

    cards.forEach(card=>{
      card.addEventListener('pointermove', (e)=> setTilt(card, e));
      card.addEventListener('pointerleave', ()=> resetTilt(card));
      card.addEventListener('touchstart', ()=> card.classList.add('is-focused'), {passive:true});
      card.addEventListener('touchend', ()=> card.classList.remove('is-focused'));
    });

    function updateFocus(){
      const cx = window.innerWidth / 2;
      let best = {idx:-1, dist:Infinity};
      cards.forEach((c, i)=>{
        const r = c.getBoundingClientRect();
        const mid = r.left + r.width / 2;
        const d = Math.abs(mid - cx);
        if (d < best.dist) best = {idx:i, dist:d};
      });
      if (best.idx !== focIdx) {
        if (focIdx >= 0 && cards[focIdx]) cards[focIdx].classList.remove('is-focused');
        focIdx = best.idx;
        cards[focIdx] && cards[focIdx].classList.add('is-focused');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(()=>{ cards[focIdx] && cards[focIdx].classList.remove('is-focused'); }, 900);
      }
    }

    // reaguj na przewijanie railsa i na przewijanie strony
    let ticking = false;
    const onAnyScroll = () => {
      if (ticking) return;
      ticking = true;
      raf(()=>{ ticking = false; updateFocus(); });
    };
    rail.addEventListener('scroll', onAnyScroll, {passive:true});
    document.addEventListener('scroll', onAnyScroll, {passive:true});
    window.addEventListener('resize', onAnyScroll);

    // inicjalne wybranie
    updateFocus();
  })();

  /* =========================
     FORMATTER treści z arkusza
     - zamienia \n na <br> / akapity
     - **bold** → <strong>
     - linie zaczynające się od "-" lub "•" → <ul><li>…</li></ul>
     ========================= */
  (function initContentFormatter(){
    function toHTML(text){
      if(!text) return '';
      let t = String(text).replace(/\r\n/g,'\n').trim();

      // wykryj listy
      const lines = t.split('\n');
      let out = [], buf = [];
      function flushUL(){
        if (!buf.length) return;
        out.push('<ul>');
        buf.forEach(item=>{
          const s = item.replace(/^[-•]\s?/, '').trim();
          out.push('<li>'+s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')+'</li>');
        });
        out.push('</ul>');
        buf = [];
      }
      for (const L of lines) {
        if (/^\s*[-•]\s+/.test(L)) { buf.push(L); continue; }
        flushUL();
        if (L.trim()==='') { out.push('<p></p>'); continue; }
        out.push('<p>'+L.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')+'</p>');
      }
      flushUL();

      // sklej puste <p></p> powstałe po podwójnych \n
      const html = out.join('').replace(/(<p>\s*<\/p>)+/g,'<br>');
      return html;
    }

    // lead: pozostawiamy <br>, bez <ul>
    $$( '[data-lead], .lead').forEach(el=>{
      const raw = el.textContent || '';
      el.innerHTML = raw
        .replace(/\r\n/g,'\n')
        .split('\n').map(s=>s.trim()).join('<br>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    });

    // markdown-like (sekcje, bloki)
    $$('[data-md], .prose').forEach(el=>{
      const raw = el.textContent || '';
      el.innerHTML = toHTML(raw);
    });
  })();

  /* =========================
     QUALITY OF LIFE: smooth anchor scroll (mobile)
     ========================= */
  (function initSmoothAnchors(){
    $$('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        const id = a.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
  })();

})();
