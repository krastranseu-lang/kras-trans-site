/* =====================================================
 * Kras-Trans Header Renderer (API → DOM)
 * - bez stałych słów: wszystko z arkusza (Apps Script)
 * - obsługa 7 języków, mega‑menu, hover‑intent (zamykane z opóźnieniem)
 * - smart‑reposition submenus, burger drawer, scrim, focus trap
 * - theme toggle dla całej strony (localStorage + prefers-color-scheme)
 * - PageSpeed: defer, passive, requestIdleCallback, light listeners, prefetch on hover
 * ===================================================== */

(function () {
  const header = document.getElementById('site-header');
  if (!header) return;

  /* ---------------- CONFIG ---------------- */
  const API_URL = header.dataset.api || '';
  let   LANG    = (header.dataset.lang || detectLangFromPath() || 'pl').toLowerCase();
  const FLAG_BY_LANG = { pl:'pl', en:'gb', de:'de', fr:'fr', it:'it', ru:'ru', ua:'ua' };
  const THEME_KEY = 'kt_theme';

  /* -------------- THEME & OS PREFERENCE -------------- */
  const root = document.documentElement;
  const themeBtn = document.getElementById('theme-toggle');

  function applyTheme(mode){
    root.setAttribute('data-theme', mode);
    try{ localStorage.setItem(THEME_KEY, mode); }catch(e){}
    themeBtn?.setAttribute('aria-pressed', String(mode === 'dark'));
  }
  const storedTheme = (()=>{ try{ return localStorage.getItem(THEME_KEY); }catch(e){ return null; }})();
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  applyTheme(storedTheme || (prefersDark.matches ? 'dark' : 'light'));
  prefersDark.addEventListener?.('change', e => {
    if (!storedTheme) applyTheme(e.matches ? 'dark' : 'light');
  });
  themeBtn?.addEventListener('click', () => {
    const mode = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(mode);
    // custom event dla SPA/analytics
    window.dispatchEvent(new CustomEvent('kt:theme', { detail: { theme: mode }}));
  });

  /* ------------------ API FETCH ------------------ */
  /** Dane mogą przyjść z window.KT_CMS (server render) albo z API */
  function getCMS(){
    if (window.KT_CMS) return Promise.resolve(window.KT_CMS);
    if (!API_URL) return Promise.reject('Brak data-api i window.KT_CMS');
    return fetch(API_URL, { credentials:'omit' }).then(r=>r.json());
  }

  /* ------------------ RENDER ------------------ */
  const navRoot   = header.querySelector('[data-nav-root]');
  const langBox   = header.querySelector('[data-lang-switcher]');
  const langFlag  = header.querySelector('[data-lang-flag]');
  const langCode  = header.querySelector('[data-lang-code]');
  const langList  = header.querySelector('[data-lang-list]');
  const brandLink = header.querySelector('[data-bind="brand-url"]');
  const ctaQuote  = header.querySelector('[data-cta="quote"] [data-i18n]')?.parentElement;

  function detectLangFromPath(){
    const m = location.pathname.match(/^\/([a-z]{2})(\/|$)/i);
    return m ? m[1].toLowerCase() : null;
  }

  function byLang(arr, lang){
    return arr.filter(x => (x.lang || x.LANG || '').toLowerCase() === lang);
  }

  function t(strings, key, lang){
    const row = strings.find(s => (s.key||s.Key) === key);
    if (!row) return '';
    return row[lang] || row.pl || '';
  }

  function normalizeNav(rows){
    // oczyszczanie pól i spójność
    return rows.map(r => ({
      lang: (r.lang||'').toLowerCase(),
      label: (r.label||'').trim(),
      href: (r.href||'').trim(),
      parent: (r.parent||'').trim(),
      order: Number(r.order||0) || 0,
      enabled: !String(r.enabled).match(/false|0|no/i)
    })).filter(r => r.enabled);
  }

  function buildHierarchy(rows){
    // Top-level: parent === ''  (które mają swoje dzieci bazujące na parent == label)
    const top = rows.filter(r => !r.parent);
    const byParent = new Map();
    rows.forEach(r => {
      if (!r.parent) return;
      const key = r.parent.toLowerCase();
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(r);
    });
    // sortowania
    top.sort((a,b)=> a.order-b.order);
    for (const arr of byParent.values()) arr.sort((a,b)=> a.order-b.order);
    // połącz
    return top.map(t => ({
      ...t,
      children: byParent.get(t.label.toLowerCase()) || []
    }));
  }

  function createEl(tag, cls, attrs){
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
    navRoot.textContent = '';
    const frag = document.createDocumentFragment();

    tree.forEach(node => {
      const li = createEl('li', 'menu-item' + (node.children.length ? ' has-sub' : ''), { role:'none' });
      const a  = createEl('a', 'menu-link', { role:'menuitem', href: cleanHref(node.href) || '#', text: node.label });
      li.appendChild(a);

      if (node.children.length){
        const hint = createEl('button','sub-hint',{'aria-expanded':'false', 'aria-label': t(strings,'open_submenu', LANG) || ''});
        hint.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><span class="sparkle" aria-hidden="true"></span>`;
        li.appendChild(hint);

        const sm = createEl('div','submenu',{ role:'menu' });
        const inner = createEl('div','submenu__inner '+ (node.children.length>6?'submenu-grid':''));
        node.children.forEach(ch=>{
          const l = createEl('a','submenu-link',{ href: cleanHref(ch.href) || '#', text: ch.label });
          l.addEventListener('pointerenter', prefetchHref, { passive:true });
          inner.appendChild(l);
        });
        sm.appendChild(inner);
        li.appendChild(sm);
      }

      frag.appendChild(li);
    });

    navRoot.appendChild(frag);
    markActive(navRoot);
    wireSubmenus();
  }

  function cleanHref(h){
    // zapewnij końcowy slash dla folderów
    if(!h) return '';
    try{
      if (h.startsWith('/')) {
        // normalizuj // i brak trailing slash
        h = h.replace(/\/{2,}/g,'/');
        if (!/\.[a-z0-9]+$/i.test(h) && !h.endsWith('/')) h += '/';
      }
    }catch(e){}
    return h;
  }

  function markActive(root){
    const cur = location.pathname.replace(/\/{2,}/g,'/').toLowerCase();
    root.querySelectorAll('a').forEach(a=>{
      const href = a.getAttribute('href')||'';
      if (href && cur.startsWith(href.toLowerCase())) {
        a.setAttribute('aria-current','page');
        a.classList.add('is-active');
      }
    });
  }

  /* ---------- SUBMENUS behaviors ---------- */
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
    // reset
    panel.style.left = '8px';
    const rect = panel.getBoundingClientRect();
    const overflowR = rect.right - (innerWidth - 12);
    if (overflowR > 0) panel.style.left = `${8 - overflowR}px`;
  }

  /* ---------- MOBILE DRAWER ---------- */
  const burger = header.querySelector('.hamburger');
  const scrim  = header.querySelector('.nav-scrim');
  function openMobile(){
    header.setAttribute('aria-mobile-open','true');
    burger.setAttribute('aria-expanded','true');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    // focus trap: pierwszy link
    navRoot.querySelector('a')?.focus();
  }
  function closeMobile(){
    header.removeAttribute('aria-mobile-open');
    burger.setAttribute('aria-expanded','false');
    scrim.hidden = true;
    document.body.style.overflow = '';
    burger.focus();
  }
  burger?.addEventListener('click', ()=> header.getAttribute('aria-mobile-open')==='true'? closeMobile():openMobile());
  scrim?.addEventListener('click', closeMobile);
  window.addEventListener('resize', ()=>{
    if (innerWidth>1100 && header.getAttribute('aria-mobile-open')==='true') closeMobile();
  }, { passive:true });

  /* ---------- LANG SWITCH ---------- */
  function renderLangSwitcher(strings, hreflang, routes){
    const code = (LANG || 'pl').toUpperCase();
    const flag = FLAG_BY_LANG[LANG] || 'gb';
    if (langFlag) langFlag.className = 'flag flag-'+flag;
    if (langCode) langCode.textContent = code;

    // zbuduj reverse mapę slugów: 'lang/slug' -> slugKey
    const reverse = {};
    (routes||[]).forEach(r=>{
      const key = (r.slugKey || r.slugkey || '').trim() || 'home';
      ['pl','en','de','fr','it','ru','ua'].forEach(L=>{
        const s = (r[L]||'').trim();
        reverse[`${L}/${s}`] = key;
        if (key==='home') reverse[`${L}/`] = 'home';
      });
    });

    const cur = location.pathname.replace(/\/{2,}/g,'/').toLowerCase();
    const m = cur.match(/^\/([a-z]{2})\/([^\/]+)?\/?$/i);
    const currentLang = m ? m[1].toLowerCase() : LANG;
    const currentSlug = m ? (m[2]||'') : '';
    const slugKey = reverse[`${currentLang}/${currentSlug}`] || 'home';

    const langs = ['pl','en','de','fr','it','ru','ua'];
    langList.textContent='';
    langs.forEach(L=>{
      const li = document.createElement('li'); li.setAttribute('role','option');
      if (L===LANG) li.setAttribute('aria-selected','true');
      const a = document.createElement('a');
      a.className='lang__opt';
      const f = document.createElement('span'); f.className='flag flag-'+(FLAG_BY_LANG[L]||'gb');
      const t = document.createElement('span'); t.textContent = L.toUpperCase();
      a.appendChild(f); a.appendChild(t);

      const loc = hreflang?.[slugKey]?.[L];
      a.href = loc || `/${L}/`;
      li.appendChild(a);
      langList.appendChild(li);
    });

    // toggle list
    const langWrap = langBox;
    const langBtn  = langBox?.querySelector('.lang__btn');
    langBtn?.addEventListener('click', ()=>{
      const open = langWrap.getAttribute('aria-open')==='true';
      langWrap.setAttribute('aria-open', String(!open));
      langBtn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', e=>{
      if (!langWrap.contains(e.target)) {
        langWrap.setAttribute('aria-open', 'false');
        langBtn.setAttribute('aria-expanded', 'false');
      }
    }, { passive:true });
  }

  /* ---------- CTA / BRAND / A11y labels ---------- */
  function applyStrings(strings){
    header.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      el.textContent = t(strings,key,LANG) || '';
    });
    header.querySelectorAll('[data-i18n-aria]').forEach(el=>{
      const key = el.getAttribute('data-i18n-aria');
      const val = t(strings,key,LANG) || '';
      if (val) el.setAttribute('aria-label', val);
    });
  }

  function bindBrand(siteUrl){
    if (!brandLink) return;
    const m = brandLink.closest('[data-lang]');
    const L = (m?.dataset.lang || LANG || 'pl').toLowerCase();
    brandLink.href = `/${L}/`;
  }

  /* ---------- PageSpeed niceties ---------- */
  function prefetchHref(e){
    const url = e.currentTarget?.getAttribute('href'); if (!url || !url.startsWith('/')) return;
    if (document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
    const l = document.createElement('link'); l.rel='prefetch'; l.href=url; l.as='document';
    document.head.appendChild(l);
  }

  /* ---------- Logo scale on scroll ---------- */
  const brandImg = header.querySelector('.brand img');
  window.addEventListener('scroll', ()=>{
    const y = Math.max(0, Math.min(1, scrollY/140));
    const h = 52 - (52-44)*y;
    if (brandImg) brandImg.style.height = `${h}px`;
  }, { passive:true });

  /* ---------- BOOT ---------- */
  function boot(data){
    // LANG sanity (jeśli API nie ma danego języka w nav → fallback do 'pl')
    const navAll = normalizeNav(data.nav||[]);
    let navLang  = navAll.filter(x => x.lang === LANG);
    if (!navLang.length) { LANG = 'pl'; navLang = navAll.filter(x => x.lang === 'pl'); }

    const tree = buildHierarchy(navLang);
    renderNav(tree, data.strings||[]);
    applyStrings(data.strings||[]);
    bindBrand((data.company?.[0]?.url)||'');
    renderLangSwitcher(data.strings||[], data.hreflang||{}, data.routes||[]);
    // CTA
    const ctaLabel = t(data.strings||[], 'cta_quote_primary', LANG) || '';
    if (ctaQuote){ ctaQuote.querySelector('[data-i18n]').textContent = ctaLabel; ctaQuote.href = `/${LANG}/wycena/`; }

    // marka alt z strings
    const brandAlt = t(data.strings||[], 'brand_alt', LANG) || 'Kras-Trans';
    const img = header.querySelector('.brand img'); if (img) img.alt = brandAlt;
  }

  // Inicjalizacja w idle, ale ASAP jeśli window.KT_CMS jest już gotowe
  const start = () => getCMS().then(boot).catch(err=>console.error('[KT header]', err));
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 }); else setTimeout(start, 0);

})();
