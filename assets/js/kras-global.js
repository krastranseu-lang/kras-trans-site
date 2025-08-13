/* =========================================================
   ★ KRAS-TRANS • GLOBAL JS • 2025-08-13
   - Tematy: jasny/ciemny + ikonki
   - Lazy video (bez CLS)
   - Kafelki: przeróbka DOM tylko po idle
   ========================================================= */
const KRASCFG={THEME_KEY:'kras-theme', READING_KEY:'kras-reading'};
const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* THEME --------------------------------------------------- */
function applyTheme(mode){
  const root=document.documentElement;
  if(mode){ root.dataset.theme=mode; localStorage.setItem(KRASCFG.THEME_KEY,mode); }
  else { localStorage.removeItem(KRASCFG.THEME_KEY); root.removeAttribute('data-theme'); }
}
function initTheme(){
  applyTheme(localStorage.getItem(KRASCFG.THEME_KEY));
  const btn=$('#theme-toggle');
  if(btn){
    btn.addEventListener('click',()=>{
      const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
      applyTheme(cur==='dark'?'light':'dark');
    });
  }
}

/* HERO VIDEO ---------------------------------------------- */
function initHeroVideo(){
  const v=$('.hero video'); if(!v) return;
  const lazy=()=>{ v.load(); v.oncanplay=()=>{ v.classList.add('active'); v.play().catch(()=>{}); }; };
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(e=>{ if(e[0].isIntersecting){ lazy(); io.disconnect(); } },{threshold:.15});
    io.observe(v);
  } else { lazy(); }
}

/* MOBILE NAV (no wrap) ------------------------------------ */
function initNavScroll(){
  const nav=$('.nav'); if(!nav) return;
  let isDown=false,startX,scrollLeft;
  nav.addEventListener('mousedown',e=>{ isDown=true; startX=e.pageX-nav.offsetLeft; scrollLeft=nav.scrollLeft; });
  document.addEventListener('mouseup',()=> isDown=false);
  nav.addEventListener('mousemove',e=>{ if(!isDown) return; e.preventDefault(); const x=e.pageX-nav.offsetLeft; nav.scrollLeft=scrollLeft-(x-startX); });
}

/* FAQ focus on open --------------------------------------- */
function initFAQ(){
  $$('.faq details').forEach(d=>{
    d.addEventListener('toggle',()=>{ if(d.open){ d.scrollIntoView({block:'nearest', behavior:prefersReduced?'auto':'smooth'}); } });
  });
}

/* Idle cosmetic FX ---------------------------------------- */
function idle(fn){ if('requestIdleCallback' in window){ requestIdleCallback(fn, {timeout:1500}); } else { setTimeout(fn, 900); } }
document.addEventListener('DOMContentLoaded',()=>{
  initTheme(); initHeroVideo(); initNavScroll(); initFAQ();
  idle(()=> document.body.classList.add('fx-ready') );
});
