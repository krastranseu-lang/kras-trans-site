/* KRAS-TRANS • site.js (global)
   - Scroll progress + section dots
   - Counter animation (data-counter)
   - Reel (horizontal scroll + drag)
   - Theme toggle
   - Hero LCP preload hook
   - A11y niceties
*/
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

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

    // dot highlighting using IntersectionObserver
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

  /* --------- Hook: hero preload link from img#heroLCP --------- */
  function syncHeroPreload() {
    const img = $('#heroLCP');
    const pre = $('#heroPreload');
    if (img && pre) {
      pre.setAttribute('href', img.getAttribute('src') || '');
      const ss = img.getAttribute('srcset') || '';
      if (ss) pre.setAttribute('imagesrcset', ss);
      pre.setAttribute('fetchpriority', 'high');
    }
  }

  /* --------- a11y niceties --------- */
  function initA11y() {
    // open details by hash #faq etc.
    if (location.hash) {
      try {
        const el = document.querySelector(location.hash);
        if (el && 'open' in el) el.open = true;
      } catch(_){}
    }
  }

  /* --------- mark sections as ready when SSR present --------- */
  function markSSRReady() {
    $$('.section[aria-busy="true"]').forEach(sec => {
      // jeśli w środku jest h2/h1/kafle z tekstem — zdejmij aria-busy
      if (sec.textContent.trim().length > 0) sec.setAttribute('aria-busy','false');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initProgress();
    enableReels();
    animateCounters();
    themeToggle();
    syncHeroPreload();
    initA11y();
    markSSRReady();
  });
})();
