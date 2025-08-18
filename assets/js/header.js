/* =========================================================
 * Header Renderer v2 — solid fallback chain + fixes
 * ========================================================= */
(function () {
  const header = document.getElementById('site-header');
  if (!header) return;

  /* ------- CONFIG ------- */
  let LANG = (header.dataset.lang || detectLangFromPath() || 'pl').toLowerCase();
  const API_URL = header.dataset.api || '';
  const CMS_URL = header.dataset.cms || '';
  const THEME_KEY = 'kt_theme';
  const FLAG_BY_LANG = { pl:'pl', en:'gb', de:'de', fr:'fr', it:'it', ru:'ru', ua:'ua' };
  const langs = ['pl','en','de','fr','it','ru','ua'];

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

  /* ------- THEME (global) ------- */
  const root = document.documentElement;
  function applyTheme(mode){
    root.setAttribute('data-theme', mode);
    try{ localStorage.setItem(THEME_KEY, mode); }catch(e){}
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(mode==='dark'));
  }
  const stored = (()=>{ try{ return localStorage.getItem(THEME_KEY); }catch(e){return null;}})();
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  applyTheme(stored || (prefersDark.matches ? 'dark' : 'light'));
  prefersDark.addEventListener?.('change', e => { if (!stored) applyTheme(e.matches ? 'dark' : 'light'); });
  themeBtn?.addEventListener('click', ()=> applyTheme(root.getAttribute('data-theme')==='dark' ? 'light' : 'dark'));

  /* ------- DATA SOURCE (robust) ------- */
  function getInline(){
    const s = document.getElementById('kt-cms');
    if (!s) return null;
    try{ return JSON.parse(s.textContent); }catch(e){ console.warn('Inline JSON parse error', e); return null; }
  }
  function fetchJSON(url, timeout=5000){
    if(!url) return Promise.reject('No URL');
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), timeout);
    return fetch(url, { signal:ctrl.signal, credentials:'omit' })
      .then(r=>{ clearTimeout(t); return r.ok ? r.json() : Promise.reject(r.statusText); });
  }
  function getCMS(){
    // 1) inline
    const inline = getInline(); if (inline) return Promise.resolve(inline);
    // 2) window.KT_CMS
    if (window.KT_CMS) return Promise.resolve(window.KT_CMS);
    // 3) API
    if (API_URL) return fetchJSON(API_URL).catch(e=>{ console.warn('API failed', e); return null; }).then(d=> d || (CMS_URL?fetchJSON(CMS_URL):Promise.reject('no data')));
    // 4) static cms.json
    if (CMS_URL) return fetchJSON(CMS_URL);
    return Promise.reject('Brak źródła danych (inline / KT_CMS / data-api / data-cms)');
  }

  /* ------- HELPERS ------- */
  function detectLangFromPath(){
    const m = location.pathname.match(/^\/([a-z]{2})(\/|$)/i);
    return m ? m[1].toLowerCase() : null;
  }
  function cleanHref(h){
    if(!h) return '';
    try{
      h = h.replace(/\/{2,}/g,'/'); if (h.startsWith('/') && !/\.[a-z0-9]+$/i.test(h) && !h.endsWith('/')) h += '/';
    }catch(e){}
    return h;
  }
  function normalizeNav(rows){
    return (rows||[]).map(r=>({
      lang: String(r.lang||'').toLowerCase(),
      label: String(r.label||'').trim(),
      href: String(r.href||'').trim(),
      parent: String(r.parent||'').trim(),
      order: Number(r.order||0) || 0,
      enabled: !String(r.enabled).match(/false|0|no/i)
    })).filter(r=>r.enabled);
  }
  function buildHierarchy(rows){
    const top = rows.filter(r=>!r.parent).sort((a,b)=>a.order-b.order);
    const byParent = new Map();
    rows.forEach(r=>{
      if(!r.parent) return;
      const k = r.parent.toLowerCase();
      if(!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(r);
    });
    for(const arr of byParent.values()) arr.sort((a,b)=>a.order-b.order);
    return top.map(t=>({ ...t, children: byParent.get(t.label.toLowerCase()) || [] }));
  }
  function t(strings, key, lang){
    const row = (strings||[]).find(s => (s.key||s.Key) === key);
    return row ? (row[lang] || row.pl || '') : '';
  }

  /* ------- RENDER NAV ------- */
  function create(tag, cls, attrs){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) for (const [k,v] of Object.entries(attrs)) {
      if (v==null) continue;
      if (k==='text') el.textContent = v;
      else if(k==='html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    return el;
  }
  function renderNav(tree, strings){
    navRoot.textContent='';
    const frag = document.createDocumentFragment();

    tree.forEach(node=>{
      const li = create('li','menu-item'+(node.children.length?' has-sub':''),{ role:'none' });
      const a  = create('a','menu-link',{ role:'menuitem', href: cleanHref(node.href) || '#', text: node.label });
      a.addEventListener('pointerenter', prefetchHref, { passive:true });
      li.appendChild(a);

      if (node.children.length){
        const hint = create('button','sub-hint',{'aria-expanded':'false','aria-label': t(strings,'open_submenu',LANG)||''});
        hint.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><span class="sparkle" aria-hidden="true"></span>`;
        li.appendChild(hint);

        const sm = create('div','submenu',{ role:'menu' });
        const inner = create('div','submenu__inner '+(node.children.length>6?'submenu-grid':''));
        node.children.forEach(ch=>{
          const l = create('a','submenu-link',{ href: cleanHref(ch.href)||'#', text: ch.label });
          l.addEventListener('pointerenter', prefetchHref, { passive:true });
          inner.appendChild(l);
        });
        sm.appendChild(inner); li.appendChild(sm);
      }
      frag.appendChild(li);
    });
    navRoot.appendChild(frag);
    markActive(navRoot); wireSubmenus();
  }

  function prefetchHref(e){
    const url = e.currentTarget?.getAttribute('href'); if (!url || !url.startsWith('/')) return;
    if (document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
    const l = document.createElement('link'); l.rel='prefetch'; l.href=url; l.as='document'; document.head.appendChild(l);
  }
  function markActive(root){
    const cur = location.pathname.replace(/\/{2,}/g,'/').toLowerCase();
    root.querySelectorAll('a').forEach(a=>{
      const href = a.getAttribute('href')||'';
      if (href && cur.startsWith(href.toLowerCase())) a.setAttribute('aria-current','page');
    });
  }
  function wireSubmenus(){
    const items = [...header.querySelectorAll('.menu-item.has-sub')];
    const leaveDelay = 160;
    items.forEach(item=>{
      let closeTO=null;
      const hint = item.querySelector('.sub-hint');
      const sm   = item.querySelector('.submenu');

      const open = ()=>{
        clearTimeout(closeTO);
        item.setAttribute('aria-open','true'); hint?.setAttribute('aria-expanded','true'); smartReposition(sm);
      };
      const close = ()=>{
        closeTO = setTimeout(()=>{ item.removeAttribute('aria-open'); hint?.setAttribute('aria-expanded','false'); }, leaveDelay);
      };

      item.addEventListener('pointerenter', open, { passive:true });
      item.addEventListener('pointerleave', close, { passive:true });
      sm?.addEventListener('pointerenter', ()=>clearTimeout(closeTO), { passive:true });
      sm?.addEventListener('pointerleave', close, { passive:true });
      hint?.addEventListener('click', (e)=>{ e.preventDefault(); (item.getAttribute('aria-open')==='true')? close():open(); });

      // klawiatura
      item.querySelector('.menu-link')?.addEventListener('keydown', e=>{
        if (e.key==='ArrowDown'){ e.preventDefault(); open(); sm?.querySelector('a')?.focus(); }
      });
      sm?.addEventListener('keydown', e=>{
        if (e.key==='Escape'){ e.preventDefault(); close(); item.querySelector('.menu-link')?.focus(); }
      });
    });
  }
  function smartReposition(panel){
    if(!panel) return;
    panel.style.left='8px';
    const rect = panel.getBoundingClientRect();
    const overflowR = rect.right - (innerWidth - 12);
    if (overflowR > 0) panel.style.left = `${8 - overflowR}px`;
  }

  /* ------- MOBILE DRAWER ------- */
  function openMobile(){ header.setAttribute('aria-mobile-open','true'); burger?.setAttribute('aria-expanded','true'); scrim.hidden=false; document.body.style.overflow='hidden'; }
  function closeMobile(){ header.removeAttribute('aria-mobile-open'); burger?.setAttribute('aria-expanded','false'); scrim.hidden=true; document.body.style.overflow=''; }
  burger?.addEventListener('click', ()=> header.getAttribute('aria-mobile-open')==='true'?closeMobile():openMobile());
  scrim?.addEventListener('click', closeMobile);
  window.addEventListener('resize', ()=>{ if (innerWidth>1100 && header.getAttribute('aria-mobile-open')==='true') closeMobile(); }, { passive:true });

  /* ------- LANG SWITCH ------- */
  function renderLangSwitcher(hreflang, routes, strings){
    document.documentElement.setAttribute('lang', LANG);

    const code = (LANG||'pl').toUpperCase();
    const flag = FLAG_BY_LANG[LANG] || 'gb';
    if (langFlag) langFlag.className = 'flag flag-'+flag;
    if (langCode) langCode.textContent = code;

    // reverse: "lang/slug" -> slugKey
    const reverse = {};
    (routes||[]).forEach(r=>{
      const key = (r.slugKey||r.slugkey||'home').trim() || 'home';
      langs.forEach(L=>{
        const s = (r[L]||'').trim();
        reverse[`${L}/${s}`] = key;
        if (key==='home') reverse[`${L}/`] = 'home';
      });
    });

    const cur = location.pathname.replace(/\/{2,}/g,'/').toLowerCase();
    const m = cur.match(/^\/([a-z]{2})\/([^\/]+)?\/?$/i);
    const currentLang = (m && m[1]) ? m[1].toLowerCase() : LANG;
    const currentSlug = (m && m[2]) ? m[2] : '';
    const slugKey = reverse[`${currentLang}/${currentSlug}`] || 'home';

    langList.textContent='';
    langs.forEach(L=>{
      const li = document.createElement('li'); li.setAttribute('role','option'); if(L===LANG) li.setAttribute('aria-selected','true');
      const a = document.createElement('a'); a.className='lang__opt';
      const f = document.createElement('span'); f.className='flag flag-'+(FLAG_BY_LANG[L]||'gb');
      const t = document.createElement('span'); t.textContent = L.toUpperCase();
      a.appendChild(f); a.appendChild(t);

      const loc = hreflang?.[slugKey]?.[L];
      a.href = loc || `/${L}/`;
      li.appendChild(a); langList.appendChild(li);
    });

    // toggle
    langBtn?.addEventListener('click', ()=>{
      const open = langWrap.getAttribute('aria-open')==='true';
      langWrap.setAttribute('aria-open', String(!open));
      langBtn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', e=>{
      if (!langWrap.contains(e.target)) {
        langWrap.setAttribute('aria-open', 'false');
        langBtn.setAttribute('aria-expanded','false');
      }
    }, { passive:true });
  }

  /* ------- STRINGS/CTA/BRAND ------- */
  function applyStrings(strings){
    header.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n'); const val = t(strings,key,LANG) || '';
      el.textContent = val;
    });
    header.querySelectorAll('[data-i18n-aria]').forEach(el=>{
      const key = el.getAttribute('data-i18n-aria'); const val = t(strings,key,LANG) || '';
      if (val) el.setAttribute('aria-label', val);
    });
  }
  function bindBrand(site){
    if (brandLink) brandLink.href = `/${LANG}/`;
  }

  /* ------- PageSpeed niceties ------- */
  const brandImg = header.querySelector('.brand img');
  window.addEventListener('scroll', ()=>{
    const y = Math.max(0, Math.min(1, scrollY/160));
    const h = 72 - (72-56)*y;
    if (brandImg) brandImg.style.height = `${h}px`;
  }, { passive:true });

  /* ------- BOOT ------- */
  function boot(data){
    if(!data){ console.error('[KT header] Brak danych'); return; }

    // Strings
    const STR = data.strings || [];

    // NAV (lang fallback -> pl)
    const navAll = normalizeNav(data.nav||[]);
    let navLang  = navAll.filter(x=>x.lang===LANG);
    if(!navLang.length){ LANG='pl'; navLang = navAll.filter(x=>x.lang==='pl'); }

    const tree = buildHierarchy(navLang);
    renderNav(tree, STR);
    applyStrings(STR);
    bindBrand((data.company?.[0]?.url)||'');

    // CTA label
    const cta = header.querySelector('[data-cta="quote"] [data-i18n]');
    if (cta) cta.textContent = t(STR,'cta_quote_primary',LANG) || 'Wycena';

    // Lang switch
    renderLangSwitcher(data.hreflang||{}, data.routes||[], STR);

    console.info('[KT header] boot ok', { lang: LANG });
  }

  function start(){
    getCMS().then(boot).catch(err=>{
      console.error('[KT header] init error:', err);
      // Minimalny fallback: pozwól chociaż na przełącznik motywu i burger
    });
  }
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 }); else setTimeout(start, 0);
})();
