<script id="kras-global-js">
/* =========================================================
   KRAS‑TRANS • GLOBAL JS v5 • 2025‑08‑12
   – bubble nudge (mobile), dock safe‑area, lower CLS, cards mobile‑2
   ========================================================= */
const CFG={FX_DELAY:2000, PARTICLES:true, PARTICLES_DENSITY:54, INTERACTIVE_LINES:true, PARALLAX_SIDES:true, THEME_KEY:'kras-theme', READ_KEY:'kras-reading'};
const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Theme / Reading ---------- */
function applyTheme(mode){
  const root=document.documentElement;
  if(mode){ root.dataset.theme=mode; localStorage.setItem(CFG.THEME_KEY,mode); }
  else { localStorage.removeItem(CFG.THEME_KEY); root.removeAttribute('data-theme'); }
  const dark=(mode?mode==='dark':matchMedia('(prefers-color-scheme: dark)').matches);
  ['d-theme'].forEach(id=>{ const b=document.getElementById(id); b&&b.setAttribute('aria-checked',dark?'true':'false'); });
}
function initTheme(){ applyTheme(localStorage.getItem(CFG.THEME_KEY)); $$('.switch').forEach(sw=>sw.addEventListener('click',()=>{const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'); applyTheme(cur==='dark'?'light':'dark'); })); }
function applyReading(on){ document.body.classList.toggle('reading',!!on); localStorage.setItem(CFG.READ_KEY,on?'1':'0'); }
function initReading(){ const btn=$('#reading-toggle'); const saved=localStorage.getItem(CFG.READ_KEY)==='1'; applyReading(saved); btn&&btn.addEventListener('click',()=>{const v=!document.body.classList.contains('reading'); applyReading(v); btn.setAttribute('aria-pressed',v?'true':'false');}); }

/* ---------- FX: lines / particles / parallax ---------- */
function getAccentHex(){ const p=document.createElement('i'); p.style.color=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'hsl(22 90% 55%)'; document.body.appendChild(p); const rgb=getComputedStyle(p).color; p.remove(); const m=rgb.match(/\d+/g)||[255,90,0]; const hx=v=>('0'+(+v).toString(16)).slice(-2); return `#${hx(m[0])}${hx(m[1])}${hx(m[2])}`; }
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.defer=true; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
function initParallaxSides(){ if(prefersReduced||!CFG.PARALLAX_SIDES) return; let ticking=false,lastY=0,doc=document.documentElement; const onScroll=()=>{ lastY = doc.scrollTop || document.body.scrollTop || 0; if(!ticking){ requestAnimationFrame(()=>{ const h=(doc.scrollHeight-doc.clientHeight)||1, p=lastY/h; const y=(p-.5)*30; document.documentElement.style.setProperty('--parallaxY', y.toFixed(2)+'px'); ticking=false; }); ticking=true; } }; addEventListener('scroll', onScroll, {passive:true}); onScroll(); }
function initInteractiveLines(){ if(!document.body.classList.contains('bg-lines') || prefersReduced || !CFG.INTERACTIVE_LINES) return; document.body.classList.add('fx-pointer'); addEventListener('mousemove', e=>{ document.body.style.setProperty('--mx', (e.clientX/innerWidth*100).toFixed(2)+'%'); document.body.style.setProperty('--my', (e.clientY/innerHeight*100).toFixed(2)+'%'); }, {passive:true}); }
function ensureParticlesHost(){ let el=document.getElementById('particles-js'); if(!el){ el=document.createElement('div'); el.id='particles-js'; Object.assign(el.style,{position:'fixed',zIndex:'-1',top:0,left:0,width:'100vw',height:'100vh',pointerEvents:'none'}); document.body.appendChild(el); } return el; }
function initParticles(){ if(!CFG.PARTICLES||prefersReduced) return; const color=getAccentHex(); ensureParticlesHost(); loadScript('https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js').then(()=>{ if(!window.particlesJS) return; window.particlesJS('particles-js',{ particles:{ number:{ value:CFG.PARTICLES_DENSITY, density:{enable:true, value_area:800} }, color:{value:color}, shape:{type:'circle',stroke:{width:0,color:color}}, opacity:{value:.42}, size:{value:4,random:true}, line_linked:{enable:true,distance:150,color:color,opacity:.33,width:1}, move:{enable:true,speed:2.4,direction:'none',out_mode:'out'} }, interactivity:{ detect_on:'window', events:{ onhover:{enable:true,mode:'repulse'}, onclick:{enable:true,mode:'push'}, resize:true }, modes:{ repulse:{distance:140,duration:.35}, push:{particles_nb:3} } }, retina_detect:true }); }).catch(()=>{}); }

/* ---------- Content helpers ---------- */
function decorateSections(){
  const map=[{rx:/faq|pytania/i,add:'sec--faq --dots --sep-inset'},{rx:/fleet|flota|pojazd/i,add:'sec--fleet --wave'},{rx:/dostaw|delivery|uslug|service/i,add:'sec--delivery --line'},{rx:/zauf|opinie|reviews/i,add:'sec--trust --dots --sep-inset'}];
  $$('section').forEach((sec,i)=>{ const idc=(sec.id||'')+' '+(sec.className||''); map.forEach(m=>{ if(m.rx.test(idc)) sec.classList.add(...m.add.split(' ')); }); if(!sec.classList.contains('--line')&&!sec.classList.contains('--dots')&&!sec.classList.contains('--wave')) sec.classList.add(['--line','--dots','--wave'][i%3]); });
}
/* CTA grouping + puls ważnych */
function enhanceCTAs(){
  $$('section .text').forEach(box=>{
    const btns=[...box.querySelectorAll('.btn,.btn-ghost')];
    if(btns.length>=2 && !box.querySelector('.cta-row')){
      const row=document.createElement('div'); row.className='cta-row'; btns.slice(0,3).forEach(b=>row.appendChild(b));
      box.insertBefore(row, box.firstElementChild?.nextElementSibling || null);
    }
  });
  $$('[data-important="true"],.cta-important').forEach(el=> el.classList.add('btn--pulse'));
}
/* FAQ scroll into view (bez zmian layoutu) */
function enhanceFAQ(){ $$('.faq details').forEach(d=> d.addEventListener('toggle',()=>{ if(d.open) d.scrollIntoView({block:'nearest', behavior:prefersReduced?'auto':'smooth'}); })); }
/* Cards: wymuś min. 2 kolumny na małych tel (czytelnie) */
function enforceCardsMobile(){
  const mq=matchMedia('(max-width:560px)');
  const set=()=>{ $$('.cards').forEach(g=> g.style.gridTemplateColumns = mq.matches ? 'repeat(2, minmax(0,1fr))' : '' ); };
  mq.addEventListener?.('change',set); set();
}

/* ---------- HERO behaviors ---------- */
function initHero(){
  const sec = document.getElementById('kras-hero'); if(!sec) return;
  const vid = sec.querySelector('.vid'); const cta=$('#ctaMain',sec); const nudge=$('#ctaNudge',sec);
  const coach=$('#coachBar',sec); const steps=$$('.step',coach); const isMob=matchMedia('(max-width:700px)').matches;

  // lazy video
  const lazy=()=>{ if(!vid) return; const delay=isMob ? 6000 : 700; setTimeout(()=>{ vid.load(); vid.oncanplay=()=>{ vid.classList.add('active'); vid.play().catch(()=>{}); }; },delay); };
  if('IntersectionObserver' in window){ const io=new IntersectionObserver(e=>{ if(e[0].isIntersecting){ lazy(); io.disconnect(); } },{threshold:.2}); io.observe(sec); } else lazy();

  // bubble style na mobile – ustaw od razu (brak CLS)
  if(nudge && isMob){ /* osadzony dymek pod CTA */
    nudge.style.left = '0'; nudge.style.top = 'auto'; nudge.style.transform = 'none'; nudge.style.marginTop='10px';
  }

  // FAB sidebar
  const fab=$('#khFab',sec), sb=$('#khSidebar',sec); fab && fab.addEventListener('click',()=> sb.classList.toggle('open'));

  // parallax w obrębie hero (transform, bez wpływu na layout)
  if(!prefersReduced && 'IntersectionObserver' in window){
    let ticking=false; const setY=()=>{ const r=sec.getBoundingClientRect(), vh=innerHeight||1; const p=(r.top+r.height/2)/vh; const y=(0.5-Math.min(Math.max(p,0),1))*22; sec.style.setProperty('--parY', y.toFixed(2)+'px'); ticking=false; };
    const onScroll=()=>{ if(!ticking){ requestAnimationFrame(setY); ticking=true; } };
    const watch=new IntersectionObserver((en)=>{ if(en[0].isIntersecting){ addEventListener('scroll',onScroll,{passive:true}); onScroll(); } else { removeEventListener('scroll',onScroll); sec.style.removeProperty('--parY'); } },{threshold:0});
    watch.observe(sec);
  }

  // coach auto-rotacja do czasu interakcji
  if(coach){ let i=0, loop=setInterval(()=>{ i=(i+1)%steps.length; steps.forEach((s,j)=> s.classList.toggle('active', j===i)); },2600);
    const stop=()=>{ nudge && (nudge.style.display='none'); clearInterval(loop); steps.forEach((s,j)=> s.classList.toggle('active', j===2)); };
    cta && cta.addEventListener('mouseenter', ()=> nudge && (nudge.style.display='none')); cta && cta.addEventListener('click', stop);
  }

  // wejście kart (transform only)
  const g=$('#gridSteps',sec); if('IntersectionObserver' in window && g){ const cards=$$('.k',g); const go=new IntersectionObserver(e=>{ if(e[0].isIntersecting){ cards.forEach((el,idx)=> setTimeout(()=> el.classList.add('active'), idx*200)); go.disconnect(); } },{threshold:.2}); go.observe(g); }
}

/* ---------- Boot ---------- */
(function BOOT(){
  initTheme(); initReading(); decorateSections(); enhanceCTAs(); enhanceFAQ(); enforceCardsMobile();
  // Efekty po załadowaniu (transform/opacity – zero CLS)
  const startFX=()=>{ if(!prefersReduced){ initParallaxSides(); initInteractiveLines(); initParticles(); } };
  addEventListener('load', ()=>{ if('requestIdleCallback' in window){ requestIdleCallback(startFX,{timeout:CFG.FX_DELAY}); } else { setTimeout(startFX, CFG.FX_DELAY); } });
  // Hero po DOM ready
  if(document.readyState!=='loading') initHero(); else addEventListener('DOMContentLoaded', initHero);
})();

/* ===== PATCH v5.2 — wyższa stabilność mobile ===== */

/* 1) Particles OFF na mobile (FCP/LCP) */
try{ if (matchMedia('(max-width: 900px)').matches) { CFG.PARTICLES = false; } }catch(e){}

/* 2) Auto-densyfikacja kafelków na szerokich telefonach (gdy nie oznaczono ręcznie) */
(function autoDenseCards(){
  const widePhone = matchMedia('(max-width:600px) and (min-width:414px)').matches;
  if (!widePhone) return;
  document.querySelectorAll('.cards:not([data-grid])').forEach(g=>{
    const items = Array.from(g.children).filter(n=>n.nodeType===1);
    if (!items.length) return;
    const short = items.every(el => (el.textContent||'').trim().length <= 120);
    if (short) g.setAttribute('data-grid','dense'); // minimalny reflow; preferuj opt‑in w HTML
  });
})();

/* ===== PATCH v5.3 — desktop FP i CLS ===== */

/* 1) Particles i interaktywne linie – opóźnij na desktop (czas 1.8 s).
      Efekty startują PO wyrenderowaniu treści, tylko transform/opacity. */
(function delayDesktopFX(){
  const desktop = matchMedia('(min-width: 1024px)').matches;
  if (!desktop) return;
  const start = () => {
    try{
      // zostawiamy Twoje initInteractiveLines/initParticles – tylko odpalamy później
      setTimeout(()=>{ 
        if (typeof initInteractiveLines === 'function') initInteractiveLines();
        if (typeof initParticles === 'function') initParticles();
      }, 1800);
    }catch(e){}
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start, {timeout: 2000}); else start();
})();

/* 2) Auto‑dense dla szerokich telefonów (zachowane z v5.2) */
(function autoDenseCards(){
  const widePhone = matchMedia('(max-width:600px) and (min-width:414px)').matches;
  if (!widePhone) return;
  document.querySelectorAll('.cards:not([data-grid])').forEach(g=>{
    const items = Array.from(g.children).filter(n=>n.nodeType===1);
    if (!items.length) return;
    const short = items.every(el => (el.textContent||'').trim().length <= 120);
    if (short) g.setAttribute('data-grid','dense');
  });
})();

</script>
