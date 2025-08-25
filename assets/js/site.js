/* KRAS-TRANS • site.js (global: progress, counters, reel, theme, header like Squarespace) */
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const throttle = (fn, d=100) => {
    let t=0; return (...a)=>{ const n=Date.now(); if(n-t>d){ t=n; fn(...a); } };
  };

  /* --------- Progress bar + dots --------- */
  function initProgress() {
    const bar = $('.progress__bar');
    const dots = $$('.progress__dots li');
    if (!bar) return;

    function onScroll() {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? (h.scrollTop / max) : 0;
      bar.style.transform = `scaleX(${p})`;
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();

    // dot highlighting
    const sections = $$('.section[id]');
    const map = new Map();
    sections.forEach((sec, i) => map.set(sec.id, dots[i]));
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const d = map.get(e.target.id);
        if (!d) return;
        if (e.isIntersecting) d.classList.add('is-active'); else d.classList.remove('is-active');
      });
    }, { rootMargin: '-40% 0px -50% 0px', threshold: 0.1 });
    sections.forEach(s => io.observe(s));
  }

  /* --------- Counter animation --------- */
  function animateCounters() {
    const els = $$('[data-counter]');
    const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.forEach(el => {
      const target = String(el.getAttribute('data-counter') || el.textContent || '0').replace(/[^\d.,]/g,'');
      let num = parseFloat(target.replace(',','.'));
      if (!isFinite(num)) return;
      if (prefersReduce) { el.textContent = target; return; }

      const start = performance.now(), dur = 900;
      const from = 0;
      (function tick(t){
        const e = Math.min(1, (t - start) / dur);
        const val = Math.round((from + (num - from) * e) * 100) / 100;
        el.textContent = val.toLocaleString();
        if (e < 1) requestAnimationFrame(tick);
      })(start);
    });
  }

  /* --------- Reel (horizontal cards) --------- */
  function enableReels() {
    $$('.reel').forEach(reel => {
      let isDown=false, startX=0, scrollL=0;
      reel.addEventListener('pointerdown', e => {
        isDown=true; startX=e.clientX; scrollL=reel.scrollLeft; reel.setPointerCapture(e.pointerId);
      });
      reel.addEventListener('pointermove', e => { if(!isDown) return; reel.scrollLeft = scrollL - (e.clientX - startX); });
      ['pointerup','pointercancel','mouseleave'].forEach(ev=>reel.addEventListener(ev, ()=>{ isDown=false; }));
    });
  }

  /* --------- Theme toggle --------- */
  function themeToggle() {
    const btn = $('[data-action="theme-toggle"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const dark = document.documentElement.classList.toggle('theme-dark');
      try { localStorage.setItem('theme', dark?'dark':'auto'); } catch(_){}
    });
    try {
      const pref = localStorage.getItem('theme');
      if (pref === 'dark') document.documentElement.classList.add('theme-dark');
    } catch(_){}
  }

  /* --------- Hook: hero preload from img#heroLCP --------- */
  function syncHeroPreload() {
    const img = $('#heroLCP'); const pre = $('#heroPreload');
    if (img && pre) {
      pre.setAttribute('href', img.getAttribute('src') || '');
      const ss = img.getAttribute('srcset') || '';
      if (ss) pre.setAttribute('imagesrcset', ss);
      pre.setAttribute('fetchpriority', 'high');
    }
  }

  function initA11y() {
    if (location.hash) {
      try {
        const el = document.querySelector(location.hash);
        if (el && 'open' in el) el.open = true;
      } catch(_){}
    }
  }

  function markSSRReady() {
    $$('.section[aria-busy="true"]').forEach(sec => {
      if (sec.textContent.trim().length > 0) sec.setAttribute('aria-busy','false');
    });
  }

  /* --------- Squarespace-like header --------- */
  function initHeaderSquarespace() {
    const header = $('#site-header.sq');
    if (!header) return;
    let lastY = window.scrollY;

    const mega = $('#mega');
    const panelsWrap = mega ? $('.mega__panels', mega) : null;
    const primary = $('#primaryNav .nav__list');
    const toggle = $('#menuToggle');
    const drawer = $('#mobileMenu');
    const closeMob = $('#closeMobile');
    const dockMenu = $('#dockMenu');
    const mobileList = $('#mobileList');
    const promo = $('#promoBar');

    header.dataset.mega = 'closed';
    if (mobileList && primary && mobileList.children.length === 0) {
      mobileList.innerHTML = primary.innerHTML;
    }

    // active link
    if (primary) {
      const path = location.pathname.replace(/\/?index\.html$/, '').replace(/\/$/, '');
      primary.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        const lp = href.replace(/\/?index\.html$/, '').replace(/\/$/, '');
        if (lp === path) a.setAttribute('aria-current','page');
      });
    }

    // promo bar close
    if (promo) {
      try {
        if (localStorage.getItem('promoBarClosed')==='1') promo.hidden = true;
      } catch(_){}
      const promoClose = $('[data-action="promo-close"]', promo);
      if (promoClose) {
        promoClose.addEventListener('click', () => {
          promo.hidden = true;
          try { localStorage.setItem('promoBarClosed','1'); } catch(_){ }
        });
      }
    }

    // sticky & shrink
    const onScroll = throttle(() => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const dir = y - lastY;
      header.classList.toggle('is-sticky', y > 0);
      header.classList.toggle('is-shrunk', y > 80);
      if (dir > 0 && y > 80) header.classList.add('is-hidden');
      if (dir < 0) header.classList.remove('is-hidden');
      lastY = y;
    }, 100);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive:true });

    // Hover intent timings
    const OPEN_MS = 140, CLOSE_MS = 380;
    let openTimer = 0, closeTimer = 0, currentId = null, lastFocus = null;

    function closeMega() {
      if (!mega) return;
      mega.dataset.state = 'closed';
      mega.setAttribute('aria-hidden', 'true');
      header.style.setProperty('--mega-h', '0px');
      header.dataset.mega = 'closed';
      currentId = null;
      // aria-expanded reset
      if (primary) {
        primary.querySelectorAll('[aria-expanded="true"]').forEach(el => el.setAttribute('aria-expanded','false'));
      }
      if (lastFocus) { try { lastFocus.focus(); } catch(_){} }
    }

    function openMega(id) {
      if (!mega || !panelsWrap) return;
      // aktywuj panel pasujący po data-panel lub id
      const sel = `.mega__section[data-panel="${id}"], .mega__section#panel-${id}`;
      panelsWrap.querySelectorAll('.mega__section').forEach(sec => sec.hidden = true);
      const panel = panelsWrap.querySelector(sel);
      if (!panel) { closeMega(); return; }
      panel.hidden = false;

      // oblicz wysokość do animacji
      const h = panel.scrollHeight;
      header.style.setProperty('--mega-h', h + 'px');
      mega.dataset.state = 'open';
      mega.setAttribute('aria-hidden', 'false');
      header.dataset.mega = 'open';
      header.classList.remove('is-hidden');
      currentId = id;
      const focusable = panel.querySelector('a,button,input,select,textarea');
      lastFocus = document.activeElement;
      if (focusable) focusable.focus();
    }

    function armOpen(id, triggerEl) {
      clearTimeout(closeTimer); clearTimeout(openTimer);
      openTimer = setTimeout(() => {
        if (primary) {
          primary.querySelectorAll('[aria-expanded="true"]').forEach(el => el.setAttribute('aria-expanded','false'));
        }
        if (triggerEl) triggerEl.setAttribute('aria-expanded','true');
        openMega(id);
      }, OPEN_MS);
    }
    function armClose() {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      closeTimer = setTimeout(closeMega, CLOSE_MS);
    }

    // Delegacja na top-nav: elementy z data-panel
    if (primary && mega) {
      primary.addEventListener('pointerenter', e => {
        const li = (e.target.closest('li[data-panel]'));
        if (!li) return;
        const id = li.getAttribute('data-panel');
        armOpen(id, li.querySelector('a,button'));
      });
      primary.addEventListener('pointerleave', () => armClose());

      // focus z klawiatury
      primary.addEventListener('focusin', e => {
        const li = e.target.closest('li[data-panel]');
        if (!li) return;
        const id = li.getAttribute('data-panel');
        armOpen(id, li.querySelector('a,button'));
      });
      primary.addEventListener('focusout', () => armClose());

      // interakcje na panelu, by nie zamykać podczas wejścia kursora
      mega.addEventListener('pointerenter', () => { clearTimeout(closeTimer); });
      mega.addEventListener('pointerleave', () => armClose());
      document.addEventListener('click', e => {
        if (mega && mega.dataset.state === 'open' && !header.contains(e.target)) closeMega();
      });
    }

    // MOBILE drawer
    function openDrawer() {
      drawer.hidden = false;
      requestAnimationFrame(() => drawer.setAttribute('data-open','true'));
      toggle.setAttribute('aria-expanded','true');
      document.body.classList.add('nav-open');
      header.classList.remove('is-hidden');
    }
    function closeDrawer() {
      drawer.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded','false');
      document.body.classList.remove('nav-open');
      setTimeout(() => { drawer.hidden = true; }, 280);
    }
    if (toggle) {
      toggle.addEventListener('click', () => {
        const exp = toggle.getAttribute('aria-expanded') === 'true';
        exp ? closeDrawer() : openDrawer();
      });
    }
    if (closeMob) closeMob.addEventListener('click', closeDrawer);
    if (dockMenu) dockMenu.addEventListener('click', e => { e.preventDefault(); openDrawer(); });
    if (drawer) {
      drawer.addEventListener('click', e => {
        if (e.target === drawer) closeDrawer();
      });
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeMega();
        if (drawer && drawer.getAttribute('data-open') === 'true') closeDrawer();
      }
      if (e.key === 'Tab' && mega && mega.dataset.state === 'open') {
        const focusable = mega.querySelectorAll('a,button,input,select,textarea');
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Jeśli CMS nie poda data-panel, a w mega są sekcje, przypnij wg kolejności:
    if (primary && panelsWrap) {
      const liWithNoId = primary.querySelectorAll('li:not([data-panel])');
      const sections = $$('.mega__section', panelsWrap);
      liWithNoId.forEach((li, i) => {
        const section = sections[i];
        const id = (section ? section.getAttribute('data-panel') : null) || ('auto-'+i);
        if (!li.hasAttribute('data-panel') && section) {
          li.setAttribute('data-panel', id);
          section.setAttribute('data-panel', id);
          section.id = section.id || ('panel-'+id);
        }
      });
    }
  }


  document.addEventListener('DOMContentLoaded', () => {
    initProgress();
    enableReels();
    animateCounters();
    themeToggle();
    syncHeroPreload();
    initA11y();
    markSSRReady();
    initHeaderSquarespace();
  });
})();
