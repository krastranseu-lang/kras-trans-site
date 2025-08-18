/* ==========================================================================
   KRAS-TRANS • HOME.JS (2025)
   - „WOW”, ale CWV-safe: IO + RAF, throttle, bez zbędnych repaints
   - Logo launchpad (split+hide), Reel (arrows/drag/wheel/progress), 3D tilt
   - Section choreos (stagger), counters, hero parallax, smooth anchors
   - UTM capture, prefetch, scroll progress, a11y drobiazgi
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ Utilities ------------------------------ */
  const $  = (sel, ctx=document)=>ctx.querySelector(sel);
  const $$ = (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max)=>Math.max(min, Math.min(max, v));
  const lerp  = (a,b,t)=>a+(b-a)*t;
  const map   = (v, inMin, inMax, outMin, outMax)=> outMin + (outMax - outMin) * ((v - inMin) / (inMax - inMin));
  const on    = (el, ev, fn, opt)=> el && el.addEventListener(ev, fn, opt||false);
  const off   = (el, ev, fn, opt)=> el && el.removeEventListener(ev, fn, opt||false);
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const pointerFine = matchMedia('(pointer: fine)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ric = window.requestIdleCallback || function (cb) { return setTimeout(()=>cb({didTimeout:true,timeRemaining:()=>0}), 1); };
  const raf = window.requestAnimationFrame.bind(window);

  function throttle(fn, wait){
    let t=0, savedArgs, savedThis, pending=false;
    return function(...args){
      const now=performance.now();
      savedArgs=args; savedThis=this;
      if(!t || now - t >= wait){
        t=now; fn.apply(savedThis, savedArgs);
      } else if(!pending){
        pending=true;
        setTimeout(()=>{pending=false; t=performance.now(); fn.apply(savedThis, savedArgs);}, wait - (now - t));
      }
    };
  }

  /* ---------------------------- Global Nodes ----------------------------- */
  const header = $('.kt-header');
  const hero   = $('#hero');
  const launch = $('.logo-launchpad');

  /* ------------------------- Scroll Progress Bar ------------------------- */
  (function progressBar(){
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    document.body.appendChild(bar);
    const update = throttle(()=>{
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight || 1;
      const p = (h.scrollTop || window.scrollY) / max * 100;
      bar.style.width = p + '%';
    }, 16);
    on(window, 'scroll', update, {passive:true});
    update();
  })();

  /* ---------------------------- Logo Launchpad --------------------------- */
  (function logoLaunch(){
    if(!launch) return;
    let split=false, hidden=false;
    const SPLIT_AT = 20;   // px
    const HIDE_AT  = 160;  // px
    const run = throttle(()=>{
      const y = window.scrollY || document.documentElement.scrollTop;
      if(!split && y > SPLIT_AT){ launch.classList.add('split'); split=true; }
      else if(split && y <= SPLIT_AT){ launch.classList.remove('split'); split=false; }
      if(!hidden && y > HIDE_AT){ launch.classList.add('hide'); hidden=true; }
      else if(hidden && y <= HIDE_AT){ launch.classList.remove('hide'); hidden=false; }
    }, 16);
    on(window, 'scroll', run, {passive:true});
    run();
  })();

  /* -------------------------- Intersection Scenes ------------------------ */
  const io = new IntersectionObserver((entries)=>{
    for(const e of entries){
      if(e.isIntersecting){
        e.target.classList.add('in');
        if(e.target.__staggered!==true){
          // kaskadowe opóźnienia dla .tile3d
          const items = $$('.tile3d', e.target);
          items.forEach((el, i)=>{
            el.style.transitionDelay = (i*40) + 'ms';
          });
          e.target.__staggered = true;
        }
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });

  $$('[data-anim]').forEach(el=> io.observe(el));

  /* ------------------------------- Counters ------------------------------ */
  function animateCounter(el, to=100, dur=1200){
    if(reduceMotion){ el.textContent = String(to); return; }
    const start = performance.now();
    const from = Number(el.textContent.replace(/[^\d.]/g,'')) || 0;
    const fmt = (v)=> el.dataset.suffix ? Math.round(v)+el.dataset.suffix : Math.round(v);
    const step = (t)=>{
      const k = clamp((t - start) / dur, 0, 1);
      const e = 1 - Math.pow(1-k, 3); // easeOutCubic
      el.textContent = fmt( from + (to-from)*e );
      if(k<1) raf(step);
    };
    raf(step);
  }
  // Przykład: jeśli w treści pojawią się liczniki <strong data-counter="991">0</strong>
  const kpis = $$('[data-counter]');
  if(kpis.length){
    const ioKPI = new IntersectionObserver((ents)=>{
      ents.forEach(e=>{
        if(e.isIntersecting){
          const to = Number(e.target.dataset.counter) || 0;
          animateCounter(e.target, to, 1200);
          ioKPI.unobserve(e.target);
        }
      });
    }, {threshold: .5});
    kpis.forEach(el=> ioKPI.observe(el));
  }

  /* ------------------------------ Hero Parallax -------------------------- */
  (function heroParallax(){
    const pic = $('.hero-media img') || $('.hero-media');
    if(!hero || !pic) return;
    if(reduceMotion) return;
    let ticking=false;
    const maxTrans = 10; // px
    const onScroll = ()=>{
      if(ticking) return; ticking=true;
      raf(()=>{
        const rect = hero.getBoundingClientRect();
        const vis = clamp(1 - rect.top / (rect.height||1), 0, 1);
        const t = map(vis, 0, 1, 0, maxTrans);
        pic.style.transform = `translateY(${t}px) scale(1.02)`;
        ticking=false;
      });
    };
    on(window, 'scroll', onScroll, {passive:true});
    onScroll();
  })();

  /* ------------------------------ 3D Tilt Cards -------------------------- */
  (function tileTilt(){
    if(!pointerFine || reduceMotion) return;
    const MAX_R = 4; // deg
    const Z    = 10; // px elevate
    const tiles = $$('.tile3d');
    tiles.forEach(tile=>{
      let r;
      function enter(){ r = tile.getBoundingClientRect(); tile.style.willChange = 'transform'; }
      function leave(){ tile.style.transform = ''; tile.style.willChange='auto'; }
      function move(e){
        if(!r) r = tile.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top)  / r.height;
        const rx = lerp(MAX_R, -MAX_R, y);
        const ry = lerp(-MAX_R, MAX_R, x);
        tile.style.transform = `translateY(-6px) translateZ(0) rotateX(${rx}deg) rotateY(${ry}deg)`;
        tile.style.boxShadow = 'var(--shadow-2)';
      }
      on(tile, 'pointerenter', enter);
      on(tile, 'pointermove',  move);
      on(tile, 'pointerleave', leave);
    });
  })();

  /* -------------------------------- REEL --------------------------------- */
  (function reels(){
    const reels = $$('.reel');
    if(!reels.length) return;

    reels.forEach(reel=>{
      // Kontrolki
      const wrap = document.createElement('div');
      wrap.className = 'reel-controls';
      const prev = document.createElement('button');
      const next = document.createElement('button');
      prev.className = 'reel-prev'; prev.setAttribute('aria-label','Przewiń w lewo'); prev.textContent = '‹';
      next.className = 'reel-next'; next.setAttribute('aria-label','Przewiń w prawo'); next.textContent = '›';
      const prog = document.createElement('div');
      prog.className = 'reel-progress';
      const bar  = document.createElement('span');
      prog.appendChild(bar);
      wrap.appendChild(prev); wrap.appendChild(prog); wrap.appendChild(next);
      reel.parentElement.insertBefore(wrap, reel.nextSibling);

      function update(){
        const max = reel.scrollWidth - reel.clientWidth;
        const x = reel.scrollLeft;
        const p = max>0 ? (x/max)*100 : 0;
        bar.style.width = p + '%';
        prev.disabled = x<=2;
        next.disabled = x>=max-2;
        wrap.style.display = max>8 ? '' : 'none';
      }
      const step = ()=>{
        const card = reel.firstElementChild;
        const w = card ? card.getBoundingClientRect().width : reel.clientWidth * .8;
        return Math.max(120, Math.min(w + 12, reel.clientWidth*.9));
      };
      prev.addEventListener('click', ()=> reel.scrollBy({left:-step(), behavior:'smooth'}));
      next.addEventListener('click', ()=> reel.scrollBy({left:+step(), behavior:'smooth'}));
      on(reel, 'scroll', throttle(update, 16), {passive:true});

      // Przewijanie kółkiem pionowym → oś X (lepsze UX na desktop)
      on(reel, 'wheel', (e)=>{
        if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
          e.preventDefault();
          reel.scrollBy({left: e.deltaY, behavior:'auto'});
        }
      }, {passive:false});

      // Drag to scroll (desktop)
      if(!isTouch){
        let startX=0, sx=0, dragging=false;
        const down = (e)=>{ dragging=true; startX=e.clientX; sx=reel.scrollLeft; reel.classList.add('is-dragging'); };
        const move = (e)=>{ if(!dragging) return; reel.scrollLeft = sx - (e.clientX - startX); };
        const up   = ()=>{ dragging=false; reel.classList.remove('is-dragging'); };
        on(reel,'mousedown',down);
        on(window,'mousemove',move);
        on(window,'mouseup',up);
      }

      // Init / on resize
      const resize = throttle(update, 50);
      on(window, 'resize', resize);
      ric(update);
    });

    // Dodatkowe style dla kontrolek (wstrzyknięte inline, żeby nie dotykać CSS)
    const css = `
      .reel-controls{display:flex;align-items:center;gap:8px;margin-top:8px}
      .reel-prev,.reel-next{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:color-mix(in oklab, var(--surface) 90%, transparent);color:var(--txt);font-weight:700}
      .reel-prev:disabled,.reel-next:disabled{opacity:.4}
      .reel-progress{flex:1;height:6px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid var(--border)}
      .reel-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#2dd4bf,#2ac3ff)}
      .reel.is-dragging{cursor:grabbing}
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  })();

  /* --------------------------- Smooth Anchors ---------------------------- */
  (function smoothAnchors(){
    const links = $$('a[href^="#"]:not([href="#"])');
    if(!links.length) return;
    links.forEach(a=>{
      on(a,'click', (e)=>{
        const id = a.getAttribute('href').slice(1);
        const t = document.getElementById(id);
        if(!t) return;
        e.preventDefault();
        const headerH = header ? header.getBoundingClientRect().height : 0;
        const y = window.scrollY + t.getBoundingClientRect().top - (headerH + 10);
        window.scrollTo({top: Math.max(0, y), behavior:'smooth'});
        history.replaceState(null, '', '#'+id);
      });
    });
  })();

  /* ----------------------------- Prefetching ----------------------------- */
  (function prefetch(){
    const isSlow = (navigator.connection && navigator.connection.downlink && navigator.connection.downlink < 1.5) || false;
    const allow = !isSlow;
    if(!allow) return;

    const seen = new Set();
    const mk = (href)=>{
      if(seen.has(href)) return;
      seen.add(href);
      const l = document.createElement('link');
      l.rel = 'prefetch'; l.href = href; l.as = 'document'; l.crossOrigin='anonymous';
      document.head.appendChild(l);
    };

    // Hover → prefetch
    $$('a[href^="/"]').forEach(a=>{
      on(a,'mouseenter', ()=> mk(a.href));
    });

    // Idle → prefetch top CTA/Services
    ric(()=>{
      const list = [
        '/pl/wycena/','/pl/cennik/','/pl/uslugi/','/pl/transport-krajowy/','/pl/transport-miedzynarodowy/','/pl/transport-ekspresowy/'
      ];
      list.forEach(h=> mk(h));
    });
  })();

  /* ------------------------------ UTM Capture ---------------------------- */
  (function utm(){
    const q = new URLSearchParams(location.search);
    const keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    let touched=false;
    const pack = {};
    keys.forEach(k=>{
      const v = q.get(k);
      if(v){ pack[k]=v; touched=true; }
    });
    if(touched){
      try{ localStorage.setItem('__utm__', JSON.stringify({ts:Date.now(), ...pack})); }catch(e){}
    }
    // attach do formularzy, jeśli istnieją
    const forms = $$('form[data-lead="1"]');
    forms.forEach(f=>{
      const hide = document.createElement('input');
      hide.type='hidden'; hide.name='utm'; hide.value = JSON.stringify(pack);
      f.appendChild(hide);
    });
  })();

  /* ---------------------------- Scroll Spy (mini) ------------------------ */
  (function spy(){
    const secs = $$('.section[id]');
    const navLinks = $$('a[href^="#"]');
    if(!secs.length || !navLinks.length) return;
    const spyIO = new IntersectionObserver((ents)=>{
      ents.forEach(e=>{
        if(e.isIntersecting){
          const id = e.target.id;
          navLinks.forEach(a=>{
            if(a.getAttribute('href')==='#'+id) a.setAttribute('aria-current','true');
            else a.removeAttribute('aria-current');
          });
        }
      });
    }, {rootMargin:'-40% 0% -55% 0%', threshold:[0,1]});
    secs.forEach(s=> spyIO.observe(s));
  })();

  /* --------------------------- Adaptive Effects -------------------------- */
  (function adaptive(){
    // Ogranicz intensywność cieni/tiltu gdy CPU słaby (heurystyka)
    if(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4){
      document.documentElement.classList.add('low-power');
    }
  })();

  /* ----------------------- Randomize line loop speeds -------------------- */
  (function lines(){
    // delikatna losowość animacji linii, żeby strona „żyła”
    ric(()=>{
      const style = document.createElement('style');
      const d1 = 12 + Math.round(Math.random()*6);
      const d2 = 10 + Math.round(Math.random()*6);
      style.textContent = `
        .section::before{animation-duration:${d1}s}
        .section::after{animation-duration:${d2}s}
      `;
      document.head.appendChild(style);
    });
  })();

  /* ------------------------ Hero KPI auto detect ------------------------- */
  (function heroKPI(){
    // Jeżeli w hero-stats brak atrybutu data-counter, wstaw go z tekstu
    const stats = $$('.hero-stats strong');
    stats.forEach(s=>{
      if(!s.dataset.counter){
        const num = Number(String(s.textContent).replace(/[^\d.]/g,'')) || 0;
        if(num>0) s.dataset.counter = String(num);
      }
    });
  })();

  /* -------------------- Anchor focus fix (a11y Safari/iOS) ---------------- */
  (function focusFix(){
    on(window,'hashchange',()=>{
      const id = location.hash.slice(1);
      const el = document.getElementById(id);
      if(el){ el.setAttribute('tabindex','-1'); el.focus({preventScroll:true}); }
    });
  })();

  /* ------------------------------ Debug Hooks ---------------------------- */
  // Otwórz w konsoli: window.__homeDebug.toggleMotion()
  window.__homeDebug = {
    toggleMotion(){
      document.body.classList.toggle('debug-cis');
    }
  };

  /* -------------------------- Final micro‑tweaks ------------------------- */
  // Aktualizacja roku w stopce
  const y = $('[data-year]'); if(y) y.textContent = new Date().getFullYear();

  // Anchor do „Wycena” w nagłówku (jeżeli brak) → fallback do /pl/wycena/
  const cta = $('.btn-primary[href*="wycena"]'); if(!cta){ /* noop */ }

})();
