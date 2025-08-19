/* ==========================================================
   Kras-Trans Header JS (vanilla) – CMS fetch, mega, lang, theme
   ========================================================== */
(function(){
  "use strict";

  // ---- DOM ----
  const $header   = document.getElementById('kt-header');
  const $navList  = document.getElementById('kt-nav-list');
  const $mega     = document.getElementById('kt-mega');
  const $megaBox  = document.getElementById('kt-mega-inner');
  const $lang     = document.getElementById('kt-lang');
  const $langBtn  = document.getElementById('kt-lang-btn');
  const $langList = document.getElementById('kt-lang-list');
  const $themeBtn = document.getElementById('kt-theme');
  const $cta      = document.getElementById('kt-cta');
  const $ctaLbl   = document.getElementById('kt-cta-label');
  const $burger   = document.getElementById('kt-burger');
  const $mDrawer  = document.getElementById('kt-mobile');
  const $mClose   = document.getElementById('kt-mobile-close');
  const $mNav     = document.getElementById('kt-mobile-nav');

  if(!$header) return;

  // ---- CONFIG ----
  const CMS_URL     = $header.dataset.cmsUrl;           // pełny URL z key
  const DEF_LANG    = ($header.dataset.defaultLang || 'pl').toLowerCase();
  const LOGO_SRC    = $header.dataset.logoSrc || '/assets/media/logo-firma-transportowa-kras-trans.png';
  const LANGS       = ['pl','en','de','fr','it','ru','ua'];
  const SERVICE_PARENTS = new Set(['usługi','uslugi','services','leistungen','servizi','услуги','послуги']);

  // ---- STATE ----
  let DATA = null;
  let CUR_LANG = detectLang();
  let hoverTimers = {open:null, close:null};
  let currentRoot = null;

  // ---- Utils ----
  function detectLang(){
    const m = location.pathname.match(/^\/([a-z]{2})\b/i);
    const l = m ? m[1].toLowerCase() : DEF_LANG;
    return LANGS.includes(l) ? l : DEF_LANG;
  }
  function byLang(rows, lang){ return (rows||[]).filter(r => (r.lang||'').toLowerCase()===lang && (r.enabled!==false && String(r.enabled).toLowerCase()!=='false')); }
  function groupBy(arr, key){ const m=new Map(); (arr||[]).forEach(o=>{ const k=(o[key]||'').toString(); if(!m.has(k)) m.set(k, []); m.get(k).push(o); }); return m; }
  function txt(s){ return document.createTextNode(String(s||'')); }
  function safeHref(h){
    h = String(h||'').trim();
    if(!h) return '#';
    try{
      const u = new URL(h, location.origin);
      if(u.origin !== location.origin) return h; // external – zostaw
      return u.pathname + (u.search||'') + (u.hash||'');
    }catch(e){ return '#'; }
  }
  function setAttr(el, obj){ Object.entries(obj).forEach(([k,v])=> el.setAttribute(k, v)); }
  function clear(el){ while(el.firstChild) el.removeChild(el.firstChild); }
  function chunk(array, n){
    const out=[]; const size=Math.ceil(array.length/n) || 1;
    for(let i=0;i<array.length;i+=size) out.push(array.slice(i,i+size));
    return out;
  }
  function openMegaFor(rootLabel){
    if(!DATA) return;
    const langNav = byLang(DATA.nav, CUR_LANG);
    const kids = langNav.filter(i => (i.parent||'').trim().toLowerCase() === rootLabel.trim().toLowerCase());
    if(!kids.length){ closeMega(); return; }
    buildMega(rootLabel, kids);
    $mega.hidden = false;
    currentRoot = rootLabel;
    // mark expanded
    [...$navList.querySelectorAll('li')].forEach(li=>{
      li.setAttribute('aria-expanded', String(li.dataset.root===rootLabel));
    });
  }
  function closeMega(){
    $mega.hidden = true;
    currentRoot = null;
    [...$navList.querySelectorAll('li')].forEach(li=> li.setAttribute('aria-expanded','false'));
  }

  // ---- Builders ----
  function buildTopNav(){
    clear($navList);
    const langNav = byLang(DATA.nav, CUR_LANG);
    const roots = langNav.filter(i => !(i.parent||'').trim()).sort((a,b)=> (a.order||0)-(b.order||0));
    roots.forEach(root=>{
      const li = document.createElement('li');
      li.dataset.root = root.label;
      li.setAttribute('aria-expanded','false');

      const a  = document.createElement('a');
      a.href   = safeHref(root.href);
      a.appendChild(txt(root.label||''));
      // caret jeśli ma dzieci
      const hasChildren = langNav.some(i => (i.parent||'').trim().toLowerCase() === (root.label||'').trim().toLowerCase());
      if(hasChildren){
        a.setAttribute('aria-haspopup','true');
        a.addEventListener('click', (e)=>{ e.preventDefault(); });
        const c = document.createElementNS('http://www.w3.org/2000/svg','svg');
        c.setAttribute('viewBox','0 0 24 24'); c.classList.add('caret');
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d','M7 10l5 5 5-5');
        c.appendChild(p); a.appendChild(c);

        // hover intent
        a.addEventListener('pointerenter', ()=> {
          clearTimeout(hoverTimers.close);
          hoverTimers.open = setTimeout(()=> openMegaFor(root.label), 140);
        });
        a.addEventListener('focus', ()=> openMegaFor(root.label));
      }else{
        // zwykły link
        a.addEventListener('pointerenter', ()=> { clearTimeout(hoverTimers.open); hoverTimers.close = setTimeout(closeMega, 260); });
      }

      li.appendChild(a);
      $navList.appendChild(li);
    });

    // zamykanie przy wyjeździe
    $header.addEventListener('mouseleave', ()=>{
      clearTimeout(hoverTimers.open);
      hoverTimers.close = setTimeout(closeMega, 260);
    });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMega(); });
    document.addEventListener('click', (e)=>{ if(!$header.contains(e.target)) closeMega(); });
  }

  function buildMega(rootLabel, children){
    clear($megaBox);
    // kolejność
    children.sort((a,b)=> (a.order||0)-(b.order||0));

    // podział na 4 kolumny (równomiernie)
    const cols = chunk(children, 4);
    cols.forEach((list, idx)=>{
      const col = document.createElement('div'); col.className='kt-col';

      if(idx===0){
        const h = document.createElement('h5'); h.appendChild(txt(rootLabel)); col.appendChild(h);
      }else{
        const h = document.createElement('h5'); h.appendChild(txt('\u00A0')); col.appendChild(h);
      }

      const ul = document.createElement('ul');
      list.forEach(item=>{
        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.href    = safeHref(item.href);
        a.appendChild(txt(item.label||''));
        li.appendChild(a);
        ul.appendChild(li);
      });
      col.appendChild(ul);
      $megaBox.appendChild(col);
    });

    // CTA w docku dla grup usług
    if(SERVICE_PARENTS.has(rootLabel.trim().toLowerCase())){
      const ctaCol = document.createElement('div'); ctaCol.className = 'kt-col';
      const h = document.createElement('h5'); h.appendChild(txt('\u00A0')); ctaCol.appendChild(h);
      const ul = document.createElement('ul'); ctaCol.appendChild(ul);
      const li = document.createElement('li');
      const a  = document.createElement('a');
      a.href   = $cta.getAttribute('href') || '#';
      a.style.background = 'rgba(25,227,193,.14)';
      a.style.border = '1px solid rgba(25,227,193,.35)';
      a.style.borderRadius = '12px';
      a.appendChild(txt($ctaLbl.textContent||''));
      li.appendChild(a); ul.appendChild(li);
      $megaBox.appendChild(ctaCol);
    }
  }

  function buildLang(){
    clear($langList);
    LANGS.forEach(code=>{
      const li = document.createElement('li');
      li.setAttribute('role','option');
      li.setAttribute('aria-selected', String(code===CUR_LANG));
      const img = document.createElement('img');
      img.src = `/assets/flags/${code}.svg`; img.width=18; img.height=18; img.alt='';
      const span = document.createElement('span'); span.textContent = code.toUpperCase();
      li.appendChild(img); li.appendChild(span);
      li.addEventListener('click', ()=> switchLang(code));
      $langList.appendChild(li);
    });
    // aktualizacja przycisku
    $langBtn.querySelector('.kt-flag').src = `/assets/flags/${CUR_LANG}.svg`;
    $langBtn.querySelector('.kt-lang-code').textContent = CUR_LANG.toUpperCase();
  }

  function switchLang(code){
    if(!DATA){ return; }
    CUR_LANG = code;
    // wylicz ścieżkę home (Routes lub hreflang)
    let url = null;
    if(DATA.hreflang && DATA.hreflang.home && DATA.hreflang.home[code]){
      url = DATA.hreflang.home[code];
    }else if(DATA.routes){
      const r = (DATA.routes||[]).find(o => (o.slugKey||'')==='home');
      if(r && r[code]!==undefined){
        const slug = (r[code]||'').trim();
        url = `/${code}/${slug ? slug+'/' : ''}`;
      }
    }
    if(!url){ url = `/${code}/`; }
    location.href = url;
  }

  function buildMobile(){
    clear($mNav);
    const langNav = byLang(DATA.nav, CUR_LANG);
    const roots = langNav.filter(i => !(i.parent||'').trim()).sort((a,b)=> (a.order||0)-(b.order||0));

    roots.forEach(root=>{
      const kids = langNav.filter(i => (i.parent||'').trim().toLowerCase() === (root.label||'').trim().toLowerCase());
      if(kids.length){
        const det = document.createElement('details');
        const sum = document.createElement('summary'); sum.textContent = root.label||''; det.appendChild(sum);
        kids.sort((a,b)=> (a.order||0)-(b.order||0)).forEach(k=>{
          const a = document.createElement('a'); a.href=safeHref(k.href); a.textContent = k.label||''; det.appendChild(a);
        });
        $mNav.appendChild(det);
      }else{
        const a = document.createElement('a'); a.href=safeHref(root.href); a.textContent=root.label||''; $mNav.appendChild(a);
      }
    });
  }

  function hydrateCTA(){
    const STR = toStringsMap(DATA.strings);
    const label = STR('cta_quote_primary', CUR_LANG) || 'Wycena transportu';
    $ctaLbl.textContent = label;

    // Spróbuj znaleźć link „Wycena” w nav
    const langNav = byLang(DATA.nav, CUR_LANG);
    let q = langNav.find(x=> /(wycena|quote)/i.test(x.label||''));
    if(!q){
      // fallback slug '/{lang}/wycena/'
      q = { href: `/${CUR_LANG}/wycena/` };
    }
    $cta.setAttribute('href', safeHref(q.href));
  }

  function toStringsMap(arr){
    const map = {};
    (arr||[]).forEach(r=>{
      const k = String(r.key || r.Key || '').trim(); if(!k) return;
      map[k] = {
        pl:r.pl||r.PL||'', en:r.en||r.EN||'', de:r.de||r.DE||'', fr:r.fr||r.FR||'',
        it:r.it||r.IT||'', ru:r.ru||r.RU||'', ua:r.ua||r.UA||r.uk||r.UK||''
      };
    });
    return function T(key, lang){ const p = map[key]||{}; return p[lang] || p.pl || ''; }
  }

  // ---- Events UI ----
  $langBtn.addEventListener('click', ()=>{
    const open = $langBtn.getAttribute('aria-expanded')==='true';
    $langBtn.setAttribute('aria-expanded', String(!open));
    $langList.hidden = open;
  });
  document.addEventListener('click', (e)=>{
    if(!$lang.contains(e.target)){ $langBtn.setAttribute('aria-expanded','false'); $langList.hidden = true; }
  });

  $themeBtn.addEventListener('click', ()=>{
    try{
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur==='dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('kt-theme', next);
      window.dispatchEvent(new Event('kt:themechange'));
    }catch(e){}
  });

  $burger.addEventListener('click', ()=>{ $mDrawer.hidden=false; document.documentElement.style.overflow='hidden'; });
  $mClose.addEventListener('click', ()=>{ $mDrawer.hidden=true; document.documentElement.style.overflow=''; });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ $mDrawer.hidden=true; document.documentElement.style.overflow=''; } });

  // ---- Fetch CMS ----
  async function fetchCMS(){
    // prosty cache w sessionStorage (5 min)
    const CK = 'kt-cms-cache';
    try{
      const raw = sessionStorage.getItem(CK);
      if(raw){
        const obj = JSON.parse(raw);
        if(Date.now() - (obj.t||0) < 5*60*1000){ return obj.data; }
      }
    }catch(e){}

    const ctrl = new AbortController();
    const to = setTimeout(()=> ctrl.abort(), 12000);
    const res = await fetch(CMS_URL, {signal:ctrl.signal, credentials:'omit'});
    clearTimeout(to);
    if(!res.ok) throw new Error('cms http '+res.status);
    const data = await res.json();
    try{ sessionStorage.setItem(CK, JSON.stringify({t:Date.now(), data})); }catch(e){}
    return data;
  }

  function minimalFallback(){
    // prosty fallback gdy CMS nie działa
    DATA = { nav: [
      {lang:CUR_LANG,label:'Home',href:`/${CUR_LANG}/`,parent:'',order:0,enabled:true},
      {lang:CUR_LANG,label:'Kontakt',href:`/${CUR_LANG}/kontakt/`,parent:'',order:90,enabled:true},
    ], strings:[], routes:[], hreflang:{} };
    buildTopNav(); buildLang(); hydrateCTA(); buildMobile();
  }

  // ---- Init ----
  (async function init(){
    try{
      DATA = await fetchCMS();
    }catch(e){
      console.warn('CMS fetch error:', e);
      minimalFallback();
      return;
    }
    try{
      buildTopNav();
      buildLang();
      hydrateCTA();
      buildMobile();

      // podmiana logo jeśli przekazano w data-*
      const logo = $header.querySelector('.kt-logo');
      if(logo && LOGO_SRC) logo.src = LOGO_SRC;

    }catch(e){ console.error(e); minimalFallback(); }
  })();

})();
