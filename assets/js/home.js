/* ======================================================================
   KRAS-TRANS • HOME.JS (v3)
   - 2 tryby animacji: Calm/Vivid (persist w localStorage: kt:animMode)
   - LCP: dynamic sizes + fetchpriority=high (#heroLCP)
   - Reel: momentum drag + klawisze ←/→ + progress
   - IO: „in” klasowanie, FAQ/accordion, glow/pulse
   - RO: compact layout toggle dla ciasnych kontenerów
   - Smooth anchors, Prefetch, UTM capture, Scroll-progress, KPI
   ====================================================================== */
(function(){
  'use strict';

  /* ----------------------- Shortcuts / helpers ------------------------- */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt||false);
  const raf = window.requestAnimationFrame.bind(window);
  const ric = window.requestIdleCallback || (cb=>setTimeout(()=>cb({timeRemaining:()=>0}),1));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pointerFine = matchMedia('(pointer:fine)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------- Anim mode (Calm / Vivid) -------------------- */
  (function animMode(){
    const KEY='kt:animMode';
    const root=document.documentElement;
    const cur = localStorage.getItem(KEY) || root.getAttribute('data-anim-mode') || 'calm';
    root.setAttribute('data-anim-mode', cur);
    const calm=$('#animCalm'), vivid=$('#animVivid');
    function set(m){
      root.setAttribute('data-anim-mode', m);
      localStorage.setItem(KEY, m);
      [calm,vivid].forEach(b=>b && b.classList.remove('active'));
      if(m==='calm' && calm){ calm.classList.add('active'); calm.setAttribute('aria-pressed','true'); vivid && vivid.setAttribute('aria-pressed','false');}
      if(m==='vivid'&& vivid){ vivid.classList.add('active'); vivid.setAttribute('aria-pressed','true'); calm && calm.setAttribute('aria-pressed','false');}
    }
    calm && on(calm,'click',()=>set('calm'));
    vivid && on(vivid,'click',()=>set('vivid'));
  })();

  /* ----------------------- LCP sizes/fetchpriority --------------------- */
  (function lcpSizes(){
    const img = $('#heroLCP'); if(!img) return;
    const set = ()=>{
      const vw = Math.max(320, Math.min(1600, window.innerWidth||1024));
      img.sizes = (vw<700) ? '100vw' : 'min(1280px, 100vw)';
      if(!img.dataset.fp){ img.setAttribute('fetchpriority','high'); img.dataset.fp='1'; }
    };
    set(); on(window,'resize', ()=>raf(set), {passive:true});
  })();

  /* ----------------------- Intersection choreographies ----------------- */
  (function scenes(){
    const io = new IntersectionObserver((ents)=>{
      ents.forEach(e=>{
        if(e.isIntersecting){
          e.target.classList.add('in');
          if(e.target.dataset.anim?.startsWith('stagger')){
            const tiles = $$('.tile3d', e.target);
            tiles.forEach((el, i)=> el.style.transitionDelay = (i*40) + 'ms');
          }
          io.unobserve(e.target);
        }
      });
    }, {rootMargin:'0px 0px -10% 0px', threshold:0.15});
    $$('[data-anim]').forEach(el=> io.observe(el));
  })();

  /* ----------------------- FAQ accordion (a11y polish) ----------------- */
  (function faq(){
    $$('.qa summary').forEach(s=> on(s,'click',()=>{
      const p=s.parentElement; if(!p.open){ // close others in section
        $$('.qa[open]', p.parentElement).forEach(d=> d!==p && (d.open=false));
      }
    }));
  })();

  /* ----------------------- Reel: momentum + keyboard + progress -------- */
  (function reels(){
    const reels = $$('.reel'); if(!reels.length) return;
    reels.forEach(reel=>{
      // Controls UI
      const wrap = document.createElement('div'); wrap.className='reel-controls';
      const prev = Object.assign(document.createElement('button'),{className:'reel-prev', ariaLabel:'Prev', textContent:'‹'});
      const next = Object.assign(document.createElement('button'),{className:'reel-next', ariaLabel:'Next', textContent:'›'});
      const prog = document.createElement('div'); prog.className='reel-progress'; const bar=document.createElement('span'); prog.appendChild(bar);
      wrap.appendChild(prev); wrap.appendChild(prog); wrap.appendChild(next);
      reel.parentElement.insertBefore(wrap, reel.nextSibling);

      const step = ()=>{
        const card = reel.firstElementChild;
        const w = card ? card.getBoundingClientRect().width : reel.clientWidth * .8;
        return Math.max(120, Math.min(w+12, reel.clientWidth*.9));
      };
      prev.onclick = ()=> reel.scrollBy({left:-step(), behavior:'smooth'});
      next.onclick = ()=> reel.scrollBy({left:+step(), behavior:'smooth'});

      // Momentum drag
      let dragging=false,startX=0,sx=0,vel=0,last=0,af=null;
      const loop = ()=>{
        if(Math.abs(vel) < 0.1){ cancelAnimationFrame(af); af=null; return; }
        reel.scrollLeft += vel; vel *= 0.95; af = requestAnimationFrame(loop);
      };
      const down = (e)=>{ dragging=true; startX=(e.touches?e.touches[0].clientX:e.clientX); sx=reel.scrollLeft; vel=0; last=startX; reel.classList.add('is-dragging'); };
      const move = (e)=>{ if(!dragging) return; const x=(e.touches?e.touches[0].clientX:e.clientX); reel.scrollLeft = sx - (x - startX); vel = (last - x); last = x; };
      const up   = ()=>{ dragging=false; reel.classList.remove('is-dragging'); cancelAnimationFrame(af); af = requestAnimationFrame(loop); };
      on(reel,'mousedown',down); on(window,'mousemove',move); on(window,'mouseup',up);
      on(reel,'touchstart',down,{passive:true}); on(window,'touchmove',move,{passive:true}); on(window,'touchend',up,{passive:true});

      // Keyboard
      reel.tabIndex = 0;
      on(reel,'keydown',(e)=>{
        if(e.key==='ArrowRight'){ reel.scrollBy({left:+step(),behavior:'smooth'}); }
        if(e.key==='ArrowLeft'){  reel.scrollBy({left:-step(),behavior:'smooth'}); }
      });

      // Progress
      const update = ()=>{
        const max = reel.scrollWidth - reel.clientWidth;
        const x = reel.scrollLeft;
        const p = max>0 ? (x/max)*100 : 0;
        bar.style.width = p + '%';
        prev.disabled = x<=2; next.disabled = x>=max-2;
        wrap.style.display = max>8 ? '' : 'none';
      };
      on(reel,'scroll', ()=>raf(update), {passive:true});
      on(window,'resize', ()=>raf(update), {passive:true});
      ric(update);
    });
  })();

  /* ----------------------- ResizeObserver: compact ---------------------- */
  (function adapt(){
    if(!('ResizeObserver' in window)) return;
    const ro = new ResizeObserver((ents)=>{
      ents.forEach(e=>{
        const compact = e.contentRect.width < 700;
        e.target.classList.toggle('is-compact', compact);
      });
    });
    $$('.container').forEach(c=> ro.observe(c));
  })();

  /* ----------------------- KPI counters -------------------------------- */
  (function kpi(){
    const list = $$('[data-counter]');
    if(!list.length) return;
    const io = new IntersectionObserver((ents)=>{
      ents.forEach(e=>{
        if(!e.isIntersecting) return;
        const el=e.target; const to=Number(el.dataset.counter)||0;
        if(reduceMotion){ el.textContent=String(to); return; }
        const start = performance.now(); const dur=1200; const from=Number(el.textContent.replace(/[^\d.]/g,''))||0;
        const fmt = v => Math.round(v);
        const tick = t=>{
          const k = clamp((t-start)/dur,0,1); const e1=1-Math.pow(1-k,3);
          el.textContent = fmt(from + (to-from)*e1); if(k<1) raf(tick);
        }; raf(tick); io.unobserve(el);
      });
    },{threshold:.5});
    list.forEach(el=> io.observe(el));
  })();

  /* ----------------------- Smooth anchors -------------------------------- */
  (function anchors(){
    const links = $$('a[href^="#"]:not([href="#"])');
    links.forEach(a=>{
      on(a,'click',(e)=>{
        const id=a.getAttribute('href').slice(1); const t=document.getElementById(id);
        if(!t) return; e.preventDefault();
        const headerH = document.querySelector('.kt-topbar')?.getBoundingClientRect().height || 0;
        const y = window.scrollY + t.getBoundingClientRect().top - (headerH + 10);
        window.scrollTo({top: Math.max(0,y), behavior:'smooth'});
        history.replaceState(null,'','#'+id);
      });
    });
  })();

  /* ----------------------- Prefetch on hover ----------------------------- */
  (function prefetch(){
    const seen=new Set();
    const mk = href=>{
      if(seen.has(href)) return; seen.add(href);
      const l=document.createElement('link'); l.rel='prefetch'; l.href=href; l.as='document'; l.crossOrigin='anonymous';
      document.head.appendChild(l);
    };
    $$('a[href^="/"]').forEach(a=> on(a,'mouseenter',()=>mk(a.href)));
  })();

  /* ----------------------- UTM capture ----------------------------------- */
  (function utm(){
    const q = new URLSearchParams(location.search);
    const keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    const pack={}; let touched=false;
    keys.forEach(k=>{ const v=q.get(k); if(v){ pack[k]=v; touched=true; }});
    if(touched){ try{ localStorage.setItem('__utm__', JSON.stringify({ts:Date.now(), ...pack})); }catch{} }
  })();

  /* ----------------------- Scroll progress ------------------------------- */
  (function progress(){
    const bar=document.createElement('div'); bar.className='progress-bar'; document.body.appendChild(bar);
    const fn = ()=>{
      const h = document.documentElement; const max = h.scrollHeight - h.clientHeight || 1;
      const p = (h.scrollTop || window.scrollY) / max * 100; bar.style.width = p+'%';
    };
    on(window,'scroll', ()=>raf(fn), {passive:true}); fn();
  })();

  /* ----------------------- Year in footer -------------------------------- */
  (function year(){ const y=$('[data-year]'); if(y) y.textContent = new Date().getFullYear(); })();

})();
