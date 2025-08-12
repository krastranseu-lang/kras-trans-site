/* =========================================================
   ★ KRAS-TRANS • GLOBAL JS v4 • 2025-08-12
   Motyw, tryb czytania, parallax boki, interaktywne linie,
   particles (lazy + kolor marki), auto‑CTA, FAQ UX, kompresja mobile,
   autoprzypisanie „charakterów” sekcji i separatorów.
   ========================================================= */

/* ---------- [A] KONFIG ---------- */
const KRASCFG = {
  FX_DELAY: 2000,             // ⏱️ opóźnienie „ciężkich” efektów (ms)
  PARTICLES: true,            // pyłki w tle
  PARTICLES_DENSITY: 54,      // gęstość
  INTERACTIVE_LINES: true,    // spotlight na .bg-lines
  PARALLAX_SIDES: true,       // boczny glow vs scroll
  THEME_STORAGE_KEY: 'kras-theme',
  READING_STORAGE_KEY: 'kras-reading'
};

/* ---------- [B] UTIL ---------- */
const $  = (s, c=document)=> c.querySelector(s);
const $$ = (s, c=document)=> Array.from(c.querySelectorAll(s));
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function getAccentHex(){
  const probe = document.createElement('i');
  probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent') || 'hsl(22 90% 55%)';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color; document.body.removeChild(probe);
  const m = rgb.match(/\d+/g)||[255,170,0];
  const toHex = v => ('0'+Number(v).toString(16)).slice(-2);
  return `#${toHex(m[0])}${toHex(m[1])}${toHex(m[2])}`;
}
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.defer=true; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }

/* ---------- [C] MOTYW (manual + auto) ---------- */
function applyTheme(mode){
  const root = document.documentElement;
  if(mode){ root.dataset.theme = mode; localStorage.setItem(KRASCFG.THEME_STORAGE_KEY, mode); }
  else{ localStorage.removeItem(KRASCFG.THEME_STORAGE_KEY); root.removeAttribute('data-theme'); }
  const dark = (mode ? mode==='dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  ['m-theme','d-theme'].forEach(id=>{ const b=document.getElementById(id); if(b) b.setAttribute('aria-checked', dark?'true':'false'); });
}
function initThemeSwitches(){
  applyTheme(localStorage.getItem(KRASCFG.THEME_STORAGE_KEY));
  $$('.switch').forEach(sw => sw.addEventListener('click', ()=>{
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
    applyTheme(cur==='dark' ? 'light' : 'dark');
  }));
}

/* ---------- [D] TRYB CZYTANIA (papier) ---------- */
function applyReadingMode(on){
  document.body.classList.toggle('reading', !!on);
  localStorage.setItem(KRASCFG.READING_STORAGE_KEY, on ? '1' : '0');
}
function initReadingToggle(){
  // Podłącz dowolny przycisk z id="reading-toggle"
  const btn = $('#reading-toggle');
  const saved = localStorage.getItem(KRASCFG.READING_STORAGE_KEY)==='1';
  applyReadingMode(saved);
  btn && btn.addEventListener('click', ()=>{
    const newVal = !document.body.classList.contains('reading');
    applyReadingMode(newVal);
    btn.setAttribute('aria-pressed', newVal?'true':'false');
  });
}

/* ---------- [E] PARALLAX BOCZNY ---------- */
function initParallaxSides(){
  if(prefersReduced || !KRASCFG.PARALLAX_SIDES) return;
  let ticking=false, lastY=0, doc=document.documentElement;
  const onScroll=()=>{
    lastY = doc.scrollTop || document.body.scrollTop || 0;
    if(!ticking){
      requestAnimationFrame(()=>{
        const h=(doc.scrollHeight-doc.clientHeight)||1, p=lastY/h;
        const y=(p-.5)*30; // -15..15 px
        document.documentElement.style.setProperty('--parallaxY', y.toFixed(2)+'px');
        ticking=false;
      });
      ticking=true;
    }
  };
  addEventListener('scroll', onScroll, {passive:true}); onScroll();
}

/* ---------- [F] INTERACTIVE LINES (bg-lines spotlight) ---------- */
function initInteractiveLines(){
  const body = document.body;
  if(!body.classList.contains('bg-lines') || prefersReduced || !KRASCFG.INTERACTIVE_LINES) return;
  body.classList.add('fx-pointer');
  const move = e=>{
    const x=(e.clientX/innerWidth*100).toFixed(2)+'%';
    const y=(e.clientY/innerHeight*100).toFixed(2)+'%';
    body.style.setProperty('--mx', x); body.style.setProperty('--my', y);
  };
  addEventListener('mousemove', move, {passive:true});
}

/* ---------- [G] PARTICLES (auto‑DIV, lazy, kolor marki) ---------- */
function ensureParticlesContainer(){
  let host = document.getElementById('particles-js');
  if(!host){
    host = document.createElement('div');
    host.id='particles-js';
    Object.assign(host.style,{position:'fixed',zIndex:'-1',top:0,left:0,width:'100vw',height:'100vh',pointerEvents:'none'});
    document.body.appendChild(host);
  }
  return host;
}
function initParticles(){
  if(!KRASCFG.PARTICLES || prefersReduced) return;
  const color=getAccentHex(); ensureParticlesContainer();
  loadScript('https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js').then(()=>{
    if(!window.particlesJS) return;
    window.particlesJS('particles-js', {
      particles:{
        number:{ value:KRASCFG.PARTICLES_DENSITY, density:{ enable:true, value_area:800 } },
        color:{ value:color },
        shape:{ type:'circle', stroke:{ width:0, color:color } },
        opacity:{ value:.42 },
        size:{ value:4, random:true },
        line_linked:{ enable:true, distance:150, color:color, opacity:.33, width:1 },
        move:{ enable:true, speed:2.4, direction:'none', random:false, straight:false, out_mode:'out', bounce:false }
      },
      interactivity:{
        detect_on:'window',
        events:{ onhover:{ enable:true, mode:'repulse' }, onclick:{ enable:true, mode:'push' }, resize:true },
        modes:{ repulse:{ distance:140, duration:.35 }, push:{ particles_nb:3 }, bubble:{ distance:240, size:30, duration:2, opacity:.8, speed:3 } }
      },
      retina_detect:true
    });
  }).catch(()=>{});
}

/* ---------- [H] „MĄDRE” KLASY SEKCJI + SEPARATORY ---------- */
function decorateSections(){
  const map = [
    { rx:/faq|pytania|questions/i,         add:'sec--faq --dots --sep-inset' },
    { rx:/flota|fleet|pojazd/i,            add:'sec--fleet --wave' },
    { rx:/dostaw|delivery|uslug|service/i, add:'sec--delivery --line' },
    { rx:/zauf|trust|opinie|reviews/i,     add:'sec--trust --dots --sep-inset' }
  ];
  $$('section').forEach((sec, i)=>{
    const idc = (sec.id||'')+' '+(sec.className||'');
    map.forEach(m=>{ if(m.rx.test(idc)) sec.classList.add(...m.add.split(' ')); });
    if(!sec.classList.contains('--line') && !sec.classList.contains('--dots') && !sec.classList.contains('--wave')){
      sec.classList.add(['--line','--dots','--wave'][i%3]);
    }
  });
}

/* ---------- [I] AUTO‑CTA + PULSE ---------- */
function enhanceCTAs(){
  $$('section .text').forEach(box=>{
    const btns = [...box.querySelectorAll('.btn, .btn-ghost')];
    if(btns.length>=2 && !box.querySelector('.cta-row')){
      const row = document.createElement('div'); row.className='cta-row';
      btns.slice(0,3).forEach(b=> row.appendChild(b));            // max 3 w rzędzie
      box.insertBefore(row, box.firstElementChild?.nextElementSibling || null);
    }
  });
  // Najważniejsze CTA (np. data-important) → mignij 3x
  $$('[data-important="true"], .cta-important').forEach(el=> el.classList.add('btn--pulse'));
}

/* ---------- [J] FAQ UX ---------- */
function enhanceFAQ(){
  $$('.faq details').forEach(d=>{
    d.addEventListener('toggle', ()=>{
      if(d.open){ d.scrollIntoView({block:'nearest', behavior:prefersReduced?'auto':'smooth'}); }
    });
  });
}

/* ---------- [K] KOMPRESJA MOBILE ---------- */
function compactMobile(){
  const mq = matchMedia('(max-width: 640px)');
  const run = ()=> document.body.classList.toggle('is-compact', mq.matches);
  mq.addEventListener?.('change', run); run();
}

/* ---------- [L] BOOT ---------- */
(function KRAS_BOOT(){
  initThemeSwitches();
  initReadingToggle();
  compactMobile();
  decorateSections();
  enhanceCTAs();
  enhanceFAQ();

  // „cięższe” efekty po bezpiecznym opóźnieniu
  const startFX = ()=>{
    document.documentElement.classList.add('fx-ready');
    if(!prefersReduced){
      if(KRASCFG.PARALLAX_SIDES) initParallaxSides();
      if(KRASCFG.INTERACTIVE_LINES) initInteractiveLines();
      if(KRASCFG.PARTICLES) initParticles();
    }
  };
  window.addEventListener('load', ()=>{
    if('requestIdleCallback' in window){
      requestIdleCallback(()=> startFX(), {timeout: KRASCFG.FX_DELAY});
    }else{
      setTimeout(startFX, KRASCFG.FX_DELAY);
    }
  });
})();
