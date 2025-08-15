/* assets/js/kras-global.js
   Kras-Trans — global helpers (perf-safe, a11y-first)
   (c) 2025 Kras-Trans
*/
(() => {
  "use strict";

  // ---- tiny helpers ---------------------------------------------------------
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const raf = (fn) => (window.requestAnimationFrame||setTimeout)(fn,16);
  const clamp = (v,min,max) => Math.max(min, Math.min(max, v));
  const ls = {
    get: (k, d=null) => { try{ return JSON.parse(localStorage.getItem(k)); }catch{ return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    del: (k) => localStorage.removeItem(k)
  };

  // ========================================================================
  // THEME: auto / light / dark / reading (sepia) + hint bubble (once/day)
  // ========================================================================
  const THEME_KEY = "k_theme_mode";           // 'auto' | 'light' | 'dark' | 'reading'
  const THEME_TIP_KEY = "k_theme_tip_day";    // 'YYYYMMDD'
  const root = document.documentElement;

  const Theme = (() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    let mode = ls.get(THEME_KEY) || "auto";

    function systemIsDark(){ return mql.matches; }
    function current() {
      if (mode === "auto") return systemIsDark() ? "dark" : "light";
      return mode;
    }
    function apply() {
      root.setAttribute("data-theme", current());
      root.setAttribute("data-theme-mode", mode); // debug/analytics
      document.body.classList.toggle("reading-mode", current()==="reading");
      // A11y: update aria-pressed on toggle button if present
      const tbtn = $("#theme-toggle");
      if (tbtn) tbtn.setAttribute("aria-pressed", current()==="dark" ? "true" : "false");
    }
    function set(newMode){
      mode = newMode;
      ls.set(THEME_KEY, mode);
      apply();
    }
    function cycle(){
      // auto -> dark -> light -> reading -> auto
      const order = ["auto","dark","light","reading"];
      const next = order[(order.indexOf(mode)+1) % order.length];
      set(next);
      toast(`Motyw: ${label(next)}`);
    }
    function label(m){
      return m==="auto" ? "Auto" : (m==="light"?"Jasny":(m==="dark"?"Ciemny":"Tryb czytania"));
    }
    function ensureButton(){
      const btn = $("#theme-toggle");
      if (!btn) return;
      on(btn,"click", e => { e.preventDefault(); cycle(); });
      btn.title = "Zmień motyw (Auto/Jasny/Ciemny/Czytania)";
    }
    function timeOfDay(){
      const h = new Date().getHours();
      return (h>=21 || h<6) ? "night" : (h<12 ? "morning" : (h<18 ? "day":"evening"));
    }
    function tipBubble(){
      // show once per day
      const today = new Date().toISOString().slice(0,10).replace(/-/g,"");
      if (ls.get(THEME_TIP_KEY) === today) return;
      const t = timeOfDay();
      const suggest = (t==="night"||t==="evening") ? "ciemny" : "jasny";
      const txt = (t==="night"||t==="evening")
        ? "Jest ciemno – włącz motyw CIEMNY lub CZYTANIA"
        : "Dzień – spróbuj motywu JASNEGO lub CZYTANIA";
      const hint = document.createElement("div");
      hint.className = "theme-tip";
      hint.innerHTML = `
        <button class="theme-tip__close" aria-label="Zamknij">×</button>
        <strong>Podpowiedź</strong><br>${txt}
        <div class="theme-tip__actions">
          <button data-theme="dark">Ciemny</button>
          <button data-theme="light">Jasny</button>
          <button data-theme="reading">Czytania</button>
        </div>`;
      document.body.appendChild(hint);
      raf(()=>hint.classList.add("is-in"));
      on(hint, "click", e=>{
        if (e.target.matches("[data-theme]")) {
          set(e.target.getAttribute("data-theme"));
          close();
        }
        if (e.target.matches(".theme-tip__close")) close();
      });
      function close(){
        hint.classList.remove("is-in");
        setTimeout(()=>hint.remove(), 200);
      }
      ls.set(THEME_TIP_KEY, today);
    }

    // react on system change if mode==auto
    on(mql, "change", () => { if (mode==="auto") apply(); });

    return { apply, set, cycle, ensureButton, tipBubble };
  })();

  // ========================================================================
  // BACKGROUND CANVAS (lightweight, motion-safe)
  // ========================================================================
  function initCanvas() {
    const c = $("#bg-canvas");
    if (!c) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = c.getContext("2d");
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let w=0,h=0, points=[], rafId=0;

    function resize(){
      const rect = c.getBoundingClientRect();
      w = Math.floor(rect.width);
      h = Math.floor(rect.height);
      c.width = w * DPR;
      c.height = h * DPR;
      ctx.scale(DPR,DPR);
      spawn();
    }
    function spawn(){
      const count = Math.round((w*h)/22000); // gęstość
      points = new Array(count).fill(0).map(()=>({
        x: Math.random()*w,
        y: Math.random()*h,
        vx: (Math.random()-.5)*0.4,
        vy: (Math.random()-.5)*0.4
      }));
    }
    function step(){
      ctx.clearRect(0,0,w,h);
      ctx.lineWidth = 1;
      for (let i=0;i<points.length;i++){
        const p = points[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x<0||p.x>w) p.vx*=-1;
        if (p.y<0||p.y>h) p.vy*=-1;
        // dots
        ctx.fillStyle = "rgba(255,145,64,.35)";
        ctx.fillRect(p.x, p.y, 1, 1);
        // lines to neighbors
        for (let j=i+1;j<points.length;j++){
          const q = points[j];
          const dx=p.x-q.x, dy=p.y-q.y, d=dx*dx+dy*dy;
          if (d<9000){
            const a = 1 - d/9000;
            ctx.strokeStyle = `rgba(255,145,64,${0.08*a})`;
            ctx.beginPath();
            ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
          }
        }
      }
      rafId = requestAnimationFrame(step);
    }
    const ro = new ResizeObserver(()=>resize());
    ro.observe(c);
    resize(); step();
    on(window,"pagehide",()=>{ cancelAnimationFrame(rafId); });
  }

  // ========================================================================
  // MOBILE H-SCROLL + DRAG on .cards--scroll
  // ========================================================================
  function initHScroll(){
    $$(".cards--scroll").forEach(scroller=>{
      let isDown=false, startX=0, startScroll=0;
      scroller.style.webkitOverflowScrolling = "touch";
      scroller.setAttribute("role","region");
      scroller.setAttribute("aria-label", scroller.getAttribute("aria-label")||"Przewijana lista");
      on(scroller,"pointerdown", e=>{
        isDown=true; scroller.setPointerCapture(e.pointerId);
        scroller.classList.add("is-dragging");
        startX = e.clientX; startScroll = scroller.scrollLeft;
      });
      on(scroller,"pointermove", e=>{
        if (!isDown) return;
        scroller.scrollLeft = startScroll - (e.clientX - startX);
      });
      const end = e=>{ isDown=false; scroller.classList.remove("is-dragging"); };
      on(scroller,"pointerup", end);
      on(scroller,"pointercancel", end);
    });
  }

  // ========================================================================
  // EQUALIZE heights within containers [data-equalize="true"]
  // ========================================================================
  function equalizeHeights(){
    $$('[data-equalize="true"]').forEach(wrap=>{
      const items = $$('.card, [data-equalize-item]', wrap);
      items.forEach(i=>i.style.height="auto");
      // w prostocie siła: równamy do najwyższego w tym wierszu
      let max = 0;
      items.forEach(i=>{ max = Math.max(max, i.offsetHeight); });
      items.forEach(i=> i.style.height = max+"px");
    });
  }
  const eqObserver = new ResizeObserver(()=>equalizeHeights());

  // ========================================================================
  // Smooth anchors (offset sticky header)
  // ========================================================================
  function headerOffset(){ return ($(".site-header")?.offsetHeight||0) + 8; }
  function initSmoothAnchors(){
    on(document,"click", e=>{
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (id.length<2) return;
      const tgt = $(id);
      if (!tgt) return;
      e.preventDefault();
      const top = tgt.getBoundingClientRect().top + window.scrollY - headerOffset();
      window.scrollTo({top, behavior:"smooth"});
      history.replaceState(null,"", id);
    });
  }

  // ========================================================================
  // Lazy for video/iframe with data-src
  // ========================================================================
  function initLazyMedia(){
    const io = new IntersectionObserver((entries,obs)=>{
      entries.forEach(en=>{
        if (!en.isIntersecting) return;
        const el = en.target;
        const src = el.getAttribute("data-src");
        if (src) { el.setAttribute("src", src); el.removeAttribute("data-src"); }
        if (el.tagName==="VIDEO") { el.load(); }
        obs.unobserve(el);
      });
    }, {rootMargin:"600px 0px"});
    $$("video[data-src], iframe[data-src]").forEach(el=>io.observe(el));
  }

  // ========================================================================
  // AJAX form (lead) with progress spinner
  // ========================================================================
  function initAjaxForms(){
    $$("form[data-ajax='true']").forEach(form=>{
      on(form,"submit", async e=>{
        e.preventDefault();
        const btn = form.querySelector("[data-progress]") || form.querySelector("button[type=submit]");
        if (btn) btn.classList.add("is-busy");
        try{
          const fd = new FormData(form);
          const res = await fetch(form.getAttribute("action") || "/lead", {
            method:"POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify(Object.fromEntries(fd.entries()))
          });
          const ok = res.ok;
          toast(ok ? "Dziękujemy! Skontaktujemy się wkrótce." : "Błąd – spróbuj ponownie.");
          if (ok) form.reset();
        }catch(err){
          toast("Błąd sieci – spróbuj ponownie.");
        }finally{
          if (btn) btn.classList.remove("is-busy");
        }
      });
    });
  }

  // ========================================================================
  // Bottom dock visibility on scroll
  // ========================================================================
  function initDock(){
    const dock = $(".bottom-bar");
    if (!dock) return;
    let lastY = window.scrollY;
    on(window,"scroll", ()=>{
      const y = window.scrollY;
      const up = y < lastY;
      dock.classList.toggle("is-hidden", !up && y>80);
      lastY = y;
    }, {passive:true});
  }

  // ========================================================================
  // Mobile menu toggle
  // ========================================================================
  function initMenuToggle(){
    const btn = $("#menu-toggle");
    const nav = $("#site-nav");
    if (!btn || !nav) return;
    on(btn, "click", () => {
      const open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ========================================================================
  // CTA: helper bubble with steps (once per session)
  // ========================================================================
  function initQuoteHelper(){
    const el = document.querySelector('[data-cta="quote"]') || document.getElementById("cta-quote");
    if (!el) return;
    if (sessionStorage.getItem("k_quote_tip")) return;
    const tip = document.createElement("div");
    tip.className = "cta-tip";
    tip.innerHTML = `
      <div class="cta-tip__arrow"></div>
      <strong>Jak to działa?</strong>
      <ol>
        <li>Kliknij <em>„Wyceń transport teraz”</em>.</li>
        <li>Wpisz trasę i dane ładunku.</li>
        <li>Wyślij – oddzwonimy i potwierdzimy odbiór.</li>
      </ol>
      <small>Darmowa wycena • Bez ukrytych opłat • Szybki kontakt</small>
      <button class="cta-tip__close" aria-label="Zamknij">OK</button>
    `;
    document.body.appendChild(tip);
    // pozycjonowanie przy przycisku
    const r = el.getBoundingClientRect();
    tip.style.left = (r.left + r.width/2) + "px";
    tip.style.top = (r.top + window.scrollY - 16) + "px";
    raf(()=> tip.classList.add("is-in"));
    on(tip, "click", e=>{
      if (e.target.matches(".cta-tip__close")) close();
    });
    function close(){ tip.classList.remove("is-in"); setTimeout(()=>tip.remove(), 200); }
    sessionStorage.setItem("k_quote_tip","1");
    // reposition on resize
    on(window,"resize", ()=> {
      const r = el.getBoundingClientRect();
      tip.style.left = (r.left + r.width/2) + "px";
      tip.style.top = (r.top + window.scrollY - 16) + "px";
    });
  }

  // ========================================================================
  // Toast (small notifications)
  // ========================================================================
  function toast(msg, ms=2600){
    let box = $("#toast");
    if (!box){
      box = document.createElement("div");
      box.id = "toast";
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add("is-in");
    clearTimeout(box._t);
    box._t = setTimeout(()=> box.classList.remove("is-in"), ms);
  }

  // ========================================================================
  // INIT on DOMContentLoaded
  // ========================================================================
  on(document, "DOMContentLoaded", () => {
    Theme.apply();
    Theme.ensureButton();
    setTimeout(()=>Theme.tipBubble(), 1800);

    initCanvas();
    initHScroll();
    equalizeHeights();
    initSmoothAnchors();
    initLazyMedia();
    initAjaxForms();
    initDock();
    initQuoteHelper();
    initMenuToggle();

    // equalize again on resizes
    eqObserver.observe(document.body);
  });

})();
/* Lang switcher */
(function () {
  const root = document.getElementById('lang-switcher');
  if (!root) return;
  const btn = root.querySelector('#langBtn');
  const menu = root.querySelector('#langMenu');

  function open(v) {
    root.dataset.open = v ? '1' : '0';
    btn.setAttribute('aria-expanded', v ? 'true' : 'false');
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    open(root.dataset.open !== '1');
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') open(false);
  });
})();
