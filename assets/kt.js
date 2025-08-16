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
