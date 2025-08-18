(function () {
  const header = document.getElementById('site-header');
  if (!header) return;

  /* CONFIG */
  let LANG = (header.dataset.lang || detectLangFromPath() || 'pl').toLowerCase();
  const API_URL = header.dataset.api || '';
  const CMS_URL = header.dataset.cms || '';
  const OPEN_DELAY  = Number(header.dataset.openDelay  || 120);
  const CLOSE_DELAY = Number(header.dataset.closeDelay || 480);
  const MEGA_MAXH   = Number(header.dataset.megaMaxh   || 420);
  const FLAG_BY_LANG = { pl:'pl', en:'gb', de:'de', fr:'fr', it:'it', ru:'ru', ua:'ua' };
  const LANGS = ['pl','en','de','fr','it','ru','ua'];
  const THEME_KEY = 'kt_theme';

  /* DOM */
  const navRoot   = header.querySelector('[data-nav-root]');
  const brandLink = header.querySelector('[data-bind="brand-url"]');
  const langWrap  = header.querySelector('[data-lang-switcher]');
  const langBtn   = header.querySelector('[data-lang-switcher] .lang__btn');
  const langFlag  = header.querySelector('[data-lang-flag]');
  const langCode  = header.querySelector('[data-lang-code]');
  const langList  = header.querySelector('[data-lang-list]');
  const themeBtn  = document.getElementById('theme-toggle');
  const burger    = header.querySelector('.hamburger');
  const scrim     = header.querySelector('.nav-scrim');
  const rootEl    = document.documentElement;

  /* THEME */
  function applyTheme(mode){ rootEl.setAttribute('data-theme', mode);
    try{ localStorage.setItem(THEME_KEY, mode); }catch(e){}
    themeBtn?.setAttribute('aria-pressed', String(mode==='dark'));
  }
  const stored = (()=>{ try{ return localStorage.getItem(THEME_KEY);}catch(e){return null;}})();
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  applyTheme(stored || (prefersDark.matches ? 'dark' : 'light'));
  prefersDark.addEventListener?.('change', e=>{ if(!stored) applyTheme(e.matches?'dark':'light'); });
  themeBtn?.addEventListener('click', ()=> applyTheme(rootEl.getAttribute('data-theme')==='dark' ? 'light' : 'dark'));

  /* DATA */
  function detectLangFromPath(){ const m=location.pathname.match(/^\/([a-z]{2})(\/|$)/i); return m?m[1].toLowerCase():null; }
  function getInline(){ const s=document.getElementById('kt-cms'); if(!s) return null; try{ return JSON.parse(s.textContent); }catch{return null;} }
  function fetchJSON(url, timeout=6000){ if(!url) return Promise.reject('no url');
    const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),timeout);
    return fetch(url,{signal:ctrl.signal,credentials:'omit'}).then(r=>{clearTimeout(to); return r.ok?r.json():Promise.reject(r.statusText);});
  }
  function getCMS(){
    const inline=getInline(); if(inline) return Promise.resolve(inline);
    if(window.KT_CMS) return Promise.resolve(window.KT_CMS);
    if(API_URL) return fetchJSON(API_URL).catch(()=>CMS_URL?fetchJSON(CMS_URL):Promise.reject('api fail'));
    if(CMS_URL) return fetchJSON(CMS_URL);
    return Promise.reject('no data');
  }

  /* HELPERS */
  const cleanHref=h=>!h?'':(h.replace(/\/{2,}/g,'/').replace(/(?<!\/)$/, '/'));
  const create=(t,c,a)=>{const e=document.createElement(t); if(c)e.className=c; if(a) for(const[k,v] of Object.entries(a)){ if(v==null) continue;
    if(k==='text') e.textContent=v; else if(k==='html') e.innerHTML=v; else e.setAttribute(k,v);} return e;};
  function t(strings,key,lang){ const row=(strings||[]).find(s=>(s.key||s.Key)===key); return row?(row[lang]||row.pl||''):''; }

  function normalizeNav(rows){
    return (rows||[]).map(r=>({
      lang:String(r.lang||'').toLowerCase(),
      label:String(r.label||'').trim(),
      href:String(r.href||'').trim(),
      parent:String(r.parent||'').trim(),
      order: Number(r.order||0)||0,
      col: Number(r.col||0)||0,
      enabled: !String(r.enabled).match(/false|0|no/i)
    })).filter(r=>r.enabled);
  }
  function buildHierarchy(rows){
    const top = rows.filter(r=>!r.parent).sort((a,b)=>a.order-b.order);
    const byParent = new Map();
    rows.forEach(r=>{ if(!r.parent) return; const k=r.parent.toLowerCase(); if(!byParent.has(k)) byParent.set(k,[]); byParent.get(k).push(r); });
    for(const arr of byParent.values()) arr.sort((a,b)=>a.order-b.order);
    return top.map(t=>({ ...t, children: byParent.get(t.label.toLowerCase()) || [] }));
  }

  /* RENDER */
  function renderNav(tree, STR){
    navRoot.textContent='';
    const frag=document.createDocumentFragment();
    tree.forEach((node, idx)=>{
      const li=create('li','menu-item'+(node.children.length?' has-mega':''),{'data-id':String(idx),role:'none'});
      const a=create('a','menu-link'+(node.children.length?' has-caret':''),{href:cleanHref(node.href)||'#',role:'menuitem',text:node.label});
      a.addEventListener('pointerenter', prefetchHref,{passive:true}); li.appendChild(a);

      if(node.children.length){
        const mega=buildMega(node, STR); li.appendChild(mega);
        const mob=create('div','submenu-mobile'); const list=document.createElement('ul');
        node.children.forEach(ch=>{ const li2=document.createElement('li'); const l=create('a','submenu-link',{href:cleanHref(ch.href)||'#',text:ch.label}); li2.appendChild(l); list.appendChild(li2); });
        mob.appendChild(list); li.appendChild(mob);
      }
      frag.appendChild(li);
    });
    navRoot.appendChild(frag);
    markActive(navRoot);
    wireMegas();
  }

  function buildMega(node, STR){
    const mega=create('div','mega'); mega.style.setProperty('--mega-max-h', MEGA_MAXH+'px');
    const wrap=create('div','mega__wrap');
    const scroll=create('div','mega__scroll');
    const colsWrap=create('div','mega__cols');

    const kids=node.children.slice();
    const declared=kids.some(k=>k.col>0);
    let nCols=declared?Math.min(4, Math.max(...kids.map(k=>k.col))):Math.min(4, Math.ceil(kids.length/6)||1);
    if(!declared){ const per=Math.ceil(kids.length/nCols); kids.forEach((k,i)=>k._col=Math.floor(i/per)+1); }
    else kids.forEach(k=>k._col=k.col);

    for(let c=1;c<=nCols;c++){
      const col=create('div','mega__col');
      kids.filter(k=>k._col===c).forEach(ch=>{
        const link=create('a','mega__link',{href:cleanHref(ch.href)||'#',text:ch.label});
        link.addEventListener('pointerenter', prefetchHref,{passive:true}); col.appendChild(link);
      });
      colsWrap.appendChild(col);
    }

    const aside=create('div','mega__aside');
    const card=create('div','mega__card');
    const p=create('p',null,{text:t(STR,'mega_help_text',LANG)||''});
    const cta=create('a','mega__cta',{href: header.querySelector('[data-cta="quote"]')?.getAttribute('href')||'#', text:t(STR,'cta_quote_primary',LANG)||''});
    card.appendChild(p); card.appendChild(cta); aside.appendChild(card);

    scroll.appendChild(colsWrap); wrap.appendChild(scroll); wrap.appendChild(aside); mega.appendChild(wrap);
    return mega;
  }

  function prefetchHref(e){
    const url=e.currentTarget?.getAttribute('href'); if(!url||!url.startsWith('/')) return;
    if(document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
    const l=document.createElement('link'); l.rel='prefetch'; l.href=url; l.as='document'; document.head.appendChild(l);
  }

  function markActive(root){
    const cur=location.pathname.replace(/\/{2,}/g,'/').toLowerCase();
    root.querySelectorAll('a').forEach(a=>{ const href=(a.getAttribute('href')||'').toLowerCase(); if(href&&cur.startsWith(href)) a.setAttribute('aria-current','page');});
  }

  /* MEGA OPEN/CLOSE + HOVER INTENT CORRIDOR */
  function wireMegas(){
    const items=[...header.querySelectorAll('.menu-item.has-mega')];
    let openTO=null, closeTO=null, hoverId=null;
    const mouse={x:0,y:0}; document.addEventListener('pointermove',e=>{mouse.x=e.clientX; mouse.y=e.clientY;},{passive:true});

    function setMegaTop(){ const rect=header.getBoundingClientRect(); document.documentElement.style.setProperty('--mega-top', `${rect.bottom}px`); }
    setMegaTop(); window.addEventListener('resize', setMegaTop,{passive:true}); window.addEventListener('scroll', setMegaTop,{passive:true});

    items.forEach(item=>{
      const link=item.querySelector('.menu-link'); const mega=item.querySelector('.mega'); if(!mega) return;

      function reallyOpen(){ items.forEach(i=>i.removeAttribute('aria-open')); item.setAttribute('aria-open','true'); setMegaTop(); }
      function open(){ clearTimeout(closeTO); clearTimeout(openTO); openTO=setTimeout(reallyOpen, OPEN_DELAY); }
      function close(){ clearTimeout(openTO); clearTimeout(closeTO); closeTO=setTimeout(()=>item.removeAttribute('aria-open'), CLOSE_DELAY); }

      function inCorridor(){
        const lr=link.getBoundingClientRect(); const mr=mega.getBoundingClientRect();
        if(mouse.y < lr.bottom || mouse.y > mr.top + 40) return false;
        const leftX  = lr.left  + (mouse.y - lr.bottom) * ((mr.left  - lr.left ) / Math.max(1,(mr.top - lr.bottom)));
        const rightX = lr.right + (mouse.y - lr.bottom) * ((mr.right - lr.right) / Math.max(1,(mr.top - lr.bottom)));
        return mouse.x >= Math.min(leftX,rightX) - 12 && mouse.x <= Math.max(leftX,rightX) + 12;
      }

      item.addEventListener('pointerenter', ()=>{ clearInterval(hoverId); open(); }, {passive:true});
      item.addEventListener('pointerleave', ()=>{ hoverId=setInterval(()=>{ if(!inCorridor()){ clearInterval(hoverId); close(); } }, 40); }, {passive:true});
      mega.addEventListener('pointerenter', ()=>{ clearTimeout(closeTO); clearInterval(hoverId); }, {passive:true});
      mega.addEventListener('pointerleave', ()=>close(), {passive:true});

      link.addEventListener('keydown', e=>{ if(e.key==='ArrowDown'){ e.preventDefault(); reallyOpen(); mega.querySelector('a')?.focus(); }});
      mega.addEventListener('keydown', e=>{ if(e.key==='Escape'){ e.preventDefault(); item.removeAttribute('aria-open'); link.focus(); }});
    });

    document.addEventListener('click', e=>{ if(!header.contains(e.target)) items.forEach(i=>i.removeAttribute('aria-open')); }, {passive:true});
  }

  /* LANG SWITCH */
  function renderLangSwitcher(hreflang, routes, STR){
    document.documentElement.setAttribute('lang', LANG);
    const flag = FLAG_BY_LANG[LANG] || 'gb'; langFlag.className='flag flag-'+flag; langCode.textContent=(LANG||'pl').toUpperCase();

    const reverse={}; (routes||[]).forEach(r=>{
      const key=(r.slugKey||r.slugkey||'home').trim()||'home';
      LANGS.forEach(L=>{ const s=(r[L]||'').trim(); reverse[`${L}/${s}`]=key; if(key==='home') reverse[`${L}/`]='home'; });
    });

    const cur=location.pathname.replace(/\/{2,}/g,'/').toLowerCase();
    const m=cur.match(/^\/([a-z]{2})\/([^\/]+)?\/?$/i);
    const currentLang=(m&&m[1])?m[1].toLowerCase():LANG; const currentSlug=(m&&m[2])?m[2]:'';
    const slugKey=reverse[`${currentLang}/${currentSlug}`] || 'home';

    langList.textContent='';
    LANGS.forEach(L=>{
      const li=document.createElement('li'); li.setAttribute('role','option'); if(L===LANG) li.setAttribute('aria-selected','true');
      const a=create('a','lang__opt'); const f=create('span','flag flag-'+(FLAG_BY_LANG[L]||'gb')); const tSpan=create('span',null,{text:L.toUpperCase()});
      const loc=hreflang?.[slugKey]?.[L]; a.href=loc||`/${L}/`; a.appendChild(f); a.appendChild(tSpan); li.appendChild(a); langList.appendChild(li);
    });

    langBtn.addEventListener('click', ()=>{
      const open=langWrap.getAttribute('aria-open')==='true'; langWrap.setAttribute('aria-open', String(!open)); langBtn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', e=>{ if(!langWrap.contains(e.target)){ langWrap.setAttribute('aria-open','false'); langBtn.setAttribute('aria-expanded','false'); }},{passive:true});
  }

  function tBind(strings){ header.querySelectorAll('[data-i18n]').forEach(el=>{ const v=t(strings, el.getAttribute('data-i18n'), LANG); if(v) el.textContent=v; });
    header.querySelectorAll('[data-i18n-aria]').forEach(el=>{ const v=t(strings, el.getAttribute('data-i18n-aria'), LANG); if(v) el.setAttribute('aria-label', v); }); }
  function bindBrand(){ if(brandLink) brandLink.href=`/${LANG}/`; }

  /* MOBILE */
  function openMobile(){ header.setAttribute('aria-mobile-open','true'); burger?.setAttribute('aria-expanded','true'); scrim.hidden=false; document.body.style.overflow='hidden'; }
  function closeMobile(){ header.removeAttribute('aria-mobile-open'); burger?.setAttribute('aria-expanded','false'); scrim.hidden=true; document.body.style.overflow=''; }
  burger?.addEventListener('click', ()=> header.getAttribute('aria-mobile-open')==='true'?closeMobile():openMobile());
  scrim?.addEventListener('click', closeMobile);
  window.addEventListener('resize', ()=>{ if(innerWidth>1100 && header.getAttribute('aria-mobile-open')==='true') closeMobile(); }, {passive:true});

  /* brand scale on scroll (cienki pasek zawsze) */
  const brandImg=header.querySelector('.brand img');
  function scaleBrand(){ const y=Math.max(0,Math.min(1, scrollY/160)); const h=72-(72-56)*y; if(brandImg) brandImg.style.height=`${h}px`; }
  scaleBrand(); window.addEventListener('scroll', scaleBrand, {passive:true});

  /* BOOT */
  function boot(data){
    if(!data){ console.error('[KT header] no data'); return; }
    const STR=data.strings||[];
    const all=normalizeNav(data.nav||[]);
    let navLang=all.filter(x=>x.lang===LANG); if(!navLang.length){ LANG='pl'; navLang=all.filter(x=>x.lang==='pl'); }
    const tree=buildHierarchy(navLang);
    renderNav(tree, STR); tBind(STR); bindBrand(); renderLangSwitcher(data.hreflang||{}, data.routes||[], STR);
    // ustawienia startowe
    document.documentElement.style.setProperty('--mega-max-h', MEGA_MAXH+'px');
    const rect=header.getBoundingClientRect(); document.documentElement.style.setProperty('--mega-top', `${rect.bottom}px`);
    console.info('[KT header] boot ok (slim panel, desktop submenu fix)');
  }

  function start(){ getCMS().then(boot).catch(err=>console.error('[KT header] init error',err)); }
  // ładujemy od razu – bez opóźnień, by pasek był widoczny natychmiast
  start();
})();
