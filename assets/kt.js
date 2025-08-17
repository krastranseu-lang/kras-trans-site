const qs=(s,c=document)=>c.querySelector(s), qsa=(s,c=document)=>Array.from(c.querySelectorAll(s));
const header=qs('#header');

// sticky zmiana tła (opcjonalnie, jeśli masz sentinel w hero – można pominąć)
function onScroll(){ header && header.classList.toggle('is-scrolled', window.scrollY>20); }
onScroll(); window.addEventListener('scroll', onScroll, {passive:true});

// mega-panels
let opened=null;
function closePanels(){ qsa('.nav__btn[data-panel]').forEach(b=>b.setAttribute('aria-expanded','false'));
  qsa('.panel').forEach(p=>{p.classList.remove('is-open');p.hidden=true}); opened=null; }
function openPanel(id){ closePanels(); const btn=qs(`.nav__btn[data-panel="${id}"]`), panel=qs(`#panel-${id}`);
  if(!btn||!panel) return; btn.setAttribute('aria-expanded','true'); panel.hidden=false; panel.classList.add('is-open'); opened=id; }
qsa('.nav__btn[data-panel]').forEach(btn=>{
  const id=btn.dataset.panel;
  btn.addEventListener('click',()=> opened===id ? closePanels() : openPanel(id));
  btn.addEventListener('mouseenter',()=> window.matchMedia('(min-width: 992px)').matches && openPanel(id));
});
document.addEventListener('click',e=>{ if(header && !header.contains(e.target)) closePanels(); });
header && header.addEventListener('mouseleave',()=> window.matchMedia('(min-width: 992px)').matches && closePanels());

// drawer mobile
const drawer=qs('#drawer'), hamburger=qs('#hamburger'), drawerClose=qs('#drawerClose');
function lockBody(b){document.body.style.overflow=b?'hidden':''}
function openDrawer(){ if(!drawer||!hamburger) return; drawer.hidden=false; drawer.classList.add('is-open'); hamburger.setAttribute('aria-expanded','true'); lockBody(true); closePanels(); }
function closeDrawer(){ if(!drawer||!hamburger) return; drawer.classList.remove('is-open'); hamburger.setAttribute('aria-expanded','false'); lockBody(false); setTimeout(()=>drawer.hidden=true,200); }
hamburger && hamburger.addEventListener('click', openDrawer);
drawerClose && drawerClose.addEventListener('click', closeDrawer);
qsa('.acc').forEach(acc=>{
  const btn=qs('.acc__btn',acc), panel=qs('.acc__panel',acc);
  btn && btn.addEventListener('click',()=>{ const open=btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded', String(!open)); panel && panel.classList.toggle('is-open', !open); });
});

// języki
const langWrap=qs('[data-lang]');
if(langWrap){
  const langBtn=langWrap.querySelector('button');
  langBtn && langBtn.addEventListener('click', ()=>{
    const expanded=langWrap.getAttribute('aria-expanded')==='true';
    langWrap.setAttribute('aria-expanded', String(!expanded));
    langBtn.setAttribute('aria-expanded', String(!expanded));
  });
  document.addEventListener('click', e=>{ if(!langWrap.contains(e.target)){ langWrap.setAttribute('aria-expanded','false'); langBtn && langBtn.setAttribute('aria-expanded','false'); }});
}

// theme
const themeBtn=qs('#themeToggle'), root=document.documentElement;
function applyTheme(t){ root.setAttribute('data-theme', t); }
const saved=localStorage.getItem('theme'); if(saved) applyTheme(saved);
themeBtn && themeBtn.addEventListener('click', ()=>{
  const cur=root.getAttribute('data-theme')||'auto';
  const next=cur==='dark'?'light':(cur==='light'?'auto':'dark');
  applyTheme(next); localStorage.setItem('theme', next);
});

// --- LEAD FIX: zamień **bold** i \n na <br> bez zmiany generatora ---
qsa('.lead').forEach(el=>{
  const raw = el.innerHTML || el.textContent || '';
  const withBr = raw.replace(/\\n/g,'<br>');
  const withBold = withBr.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  if(withBold !== raw) el.innerHTML = withBold;
});

// efekt znikania przycisku i nawigacja
document.addEventListener('click',e=>{
  const el=e.target.closest('a[data-disappear],button[data-disappear]');
  if(!el) return;
  if(el.dataset.firing){ e.preventDefault(); return; }
  el.dataset.firing='1';
  const rect=el.getBoundingClientRect();
  el.style.width=rect.width+'px';
  el.style.height=rect.height+'px';
  el.classList.add('bye');
  el.setAttribute('aria-disabled','true');
  const url=el.getAttribute('href')||el.dataset.href||'#';
  const target=el.getAttribute('target');
  const delay=parseInt(el.dataset.delay||'140',10);
  e.preventDefault();
  window.setTimeout(()=>{target==='_blank'?window.open(url,'_blank','noopener'):window.location.assign(url);},delay);
});
/* === Mobile bottom dock actions === */
document.getElementById('dock-menu')?.addEventListener('click', () => {
  // użyj istniejącego hamburgera/drawera
  const btn = document.getElementById('hamburger');
  if(btn){ btn.click(); }
});
document.getElementById('dock-home')?.addEventListener('click', () => { /* zwykły link */ });

/* === Offer rail tilt (max ~12° po trendzie) === */
(function(){
  const rail = document.getElementById('offer-rail');
  if(!rail) return;
  const MAX = 12; // deg
  const update = () => {
    const cards = rail.querySelectorAll('.offer-card');
    const mid = rail.getBoundingClientRect().left + (rail.clientWidth/2);
    cards.forEach(card => {
      const r = card.getBoundingClientRect();
      const c = r.left + r.width/2;
      const t = Math.max(-1, Math.min(1, (c - mid) / (window.innerWidth*0.4)));
      card.style.setProperty('--tilt', (-MAX * t).toFixed(2) + 'deg');
    });
  };
  rail.addEventListener('scroll', update, {passive:true});
  window.addEventListener('resize', update);
  update();
})();

/* === Big title fade/slide on scroll (~35vh) === */
(function(){
  const sec = document.getElementById('offer-reveal');
  if(!sec) return;
  const title = sec.querySelector('.split-hero__title');
  if(!title) return;
  const getTop = () => sec.getBoundingClientRect().top + window.scrollY;
  let startY = getTop(); // start of section
  const onScroll = () => {
    const sc = window.scrollY;
    const span = window.innerHeight * 0.35;
    const p = Math.max(0, Math.min(1, (sc - startY)/span));
    title.style.setProperty('--titleOpacity', (1 - 0.6*p).toFixed(3));
    title.style.setProperty('--titleShift', (40*p).toFixed(1) + 'px');
    title.style.setProperty('--titleScale', (1 - 0.06*p).toFixed(3));
  };
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', () => { startY = getTop(); onScroll(); });
  onScroll();
})();

/* === „Markdown-ish” parser dla bloków i leada === */
(function(){
  const toHTML = (txt) => {
    if(!txt) return '';
    const lines = txt.replace(/\r\n/g,'\n').split('\n');
    let html = '', inList = false;
    const flush = () => { if(inList){ html += '</ul>'; inList=false; } };
    for(const line of lines){
      const m = line.match(/^\s*(?:-|\u2022)\s+(.*)$/); // - lub •
      if(m){
        if(!inList){ html += '<ul>'; inList=true; }
        html += '<li>' + m[1] + '</li>';
      }else if(line.trim()===''){
        flush(); html += '<p></p>';
      }else{
        flush();
        let t = line
          .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
        html += '<p>'+ t +'</p>';
      }
    }
    flush();
    return html.replace(/<p><\/p>/g,'');
  };
  document.querySelectorAll('[data-md], [data-lead]').forEach(el=>{
    el.innerHTML = toHTML(el.textContent || '');
  });
})();
