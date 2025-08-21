<script id="ktHeaderScript"
        data-api="{{ cms_endpoint }}"
        data-defaultlang="{{ page.lang or site.defaultLang or 'pl' }}">
</script>

/* assets/js/header.js */
/* Kras-Trans Header: fallback → hydrate CMS (TTL 6h), hover-intent, i18n, mobile drawer */
(() => {
  'use strict';

  // --------- CONSTS
  const LOCALES = ['pl','en','de','fr','it','ru','ua'];
  const HOVER_OPEN_DELAY = 140;
  const HOVER_CLOSE_DELAY = 380;
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
  const SCRIPT = document.getElementById('ktHeaderScript') || document.currentScript;
  const HEADER = document.getElementById('site-header');
  const DEFAULT_LANG = (HEADER?.dataset.defaultLang) || (SCRIPT?.dataset.defaultLang) || 'pl';
  const CMS_ENDPOINT = (SCRIPT?.dataset.api) || (HEADER?.dataset.api) || '';
  const LOGO_SRC = HEADER?.dataset.logoSrc || '/assets/media/logo-firma-transportowa-kras-trans.png';

  // --------- UTIL
  const qs  = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => Array.from(root.querySelectorAll(s));
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const sameOrigin = (href) => { try{ const u=new URL(href, location.href); return u.origin===location.origin } catch(_){ return false } };
  const now = () => (window.performance?.now?.() || Date.now());

  function setMegaTop() {
    const r = HEADER.getBoundingClientRect();
    document.documentElement.style.setProperty('--megaTop', `${Math.round(r.bottom)}px`);
  }

  function langFromPath() {
    const seg = location.pathname.replace(/^\/+/, '').split('/')[0];
    return LOCALES.includes(seg) ? seg : DEFAULT_LANG;
  }

  function buildUrl(lang, slugKey, routes) {
    const r = routes.find(x => x.slugKey === slugKey);
    const slug = r && r[lang] || '';
    return `/${lang}/${slug ? slug + '/' : ''}`;
  }

  function prefetch(href) {
    if (!sameOrigin(href)) return;
    if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'prefetch'; l.as='document'; l.href = href;
    document.head.appendChild(l);
  }

  function sanitizeText(el, text) {
    el.textContent = text != null ? String(text) : '';
  }

  function isExternal(href) {
    try { const u = new URL(href, location.href); return u.origin !== location.origin; } catch { return false; }
  }

  // --------- FALLBACK DATA (instant render)
  const FALLBACK = (() => {
    const routes = [
      { slugKey:'home',      pl:'', en:'', de:'', fr:'', it:'', ru:'', ua:'' },
      { slugKey:'pricing',   pl:'cennik', en:'pricing', de:'preise', fr:'tarifs', it:'prezzi', ru:'ceny', ua:'tsiny' },
      { slugKey:'order',     pl:'zamow', en:'order', de:'auftrag', fr:'commande', it:'ordina', ru:'zakaz', ua:'zamovyty' },
      { slugKey:'schedule',  pl:'harmonogramy', en:'schedules', de:'fahrplaene', fr:'horaires', it:'orari', ru:'raspisanie', ua:'rozklady' },
      { slugKey:'tracking',  pl:'sledzenie', en:'tracking', de:'verfolgung', fr:'suivi', it:'tracciamento', ru:'otslezhivanie', ua:'vidstezhennya' },
      { slugKey:'manage',    pl:'zarzadzaj', en:'manage', de:'verwalten', fr:'gerer', it:'gestisci', ru:'upravlenie', ua:'keruvannya' },
      { slugKey:'services',  pl:'uslugi', en:'services', de:'leistungen', fr:'services', it:'servizi', ru:'uslugi', ua:'poslugy' },
      { slugKey:'company',   pl:'firma', en:'company', de:'unternehmen', fr:'entreprise', it:'azienda', ru:'kompaniya', ua:'kompaniya' },
      { slugKey:'support',   pl:'wsparcie', en:'support', de:'support', fr:'support', it:'supporto', ru:'podderzhka', ua:'pidtrymka' },
      { slugKey:'blog',      pl:'blog', en:'blog', de:'blog', fr:'blog', it:'blog', ru:'blog', ua:'blog' },
      { slugKey:'contact',   pl:'kontakt', en:'contact', de:'kontakt', fr:'contact', it:'contatti', ru:'kontakt', ua:'kontakt' },
      { slugKey:'quote',     pl:'wycena', en:'quote', de:'angebot', fr:'devis', it:'preventivo', ru:'raschet', ua:'koshtorys' }
    ];
    const strings = [
      { key:'cta_quote_primary', pl:'Wycena transportu', en:'Get a quote', de:'Angebot anfordern', fr:'Obtenir un devis', it:'Richiedi preventivo', ru:'Рассчитать стоимость', ua:'Отримати пропозицію' },
      { key:'brand_alt', pl:'Kras-Trans', en:'Kras-Trans', de:'Kras-Trans', fr:'Kras-Trans', it:'Kras-Trans', ru:'Kras-Trans', ua:'Kras-Trans' }
    ];
    // Top level order (spec)
    const TOP = ['pricing','order','schedule','tracking','manage','services','company','support','blog','contact'];
    const nav = [];
    for (const lang of LOCALES) {
      // Top level
      for (const key of TOP) {
        nav.push({ lang, label: ({
            pricing:{pl:'Cennik',en:'Pricing',de:'Preise',fr:'Tarifs',it:'Prezzi',ru:'Цены',ua:'Ціни'},
            order:{pl:'Zamów',en:'Order',de:'Auftrag',fr:'Commande',it:'Ordina',ru:'Заказ',ua:'Замовити'},
            schedule:{pl:'Harmonogramy',en:'Schedules',de:'Fahrpläne',fr:'Horaires',it:'Orari',ru:'Расписание',ua:'Розклади'},
            tracking:{pl:'Śledzenie',en:'Tracking',de:'Verfolgung',fr:'Suivi',it:'Tracciamento',ru:'Отслеживание',ua:'Відстеження'},
            manage:{pl:'Zarządzaj',en:'Manage',de:'Verwalten',fr:'Gérer',it:'Gestisci',ru:'Управляй',ua:'Керуй'},
            services:{pl:'Usługi',en:'Services',de:'Leistungen',fr:'Services',it:'Servizi',ru:'Услуги',ua:'Послуги'},
            company:{pl:'Firma',en:'Company',de:'Unternehmen',fr:'Entreprise',it:'Azienda',ru:'Компания',ua:'Компанія'},
            support:{pl:'Wsparcie',en:'Support',de:'Support',fr:'Support',it:'Supporto',ru:'Поддержка',ua:'Підтримка'},
            blog:{pl:'Blog',en:'Blog',de:'Blog',fr:'Blog',it:'Blog',ru:'Блог',ua:'Блог'},
            contact:{pl:'Kontakt',en:'Contact',de:'Kontakt',fr:'Contact',it:'Contatti',ru:'Контакты',ua:'Контакт'}
          }[key]||{})[lang], href: buildUrl(lang, key, routes), parent:'', order:TOP.indexOf(key)*10+10, enabled:true
        });
      }
      // Services columns
      const svc = [
        {t:'Transport', items:['transport-krajowy','transport-miedzynarodowy','palety','ekspres'] , col:1},
        {t:'SLA/Operacje', items:['sla','busy-3-5t'], col:2},
        {t:'Wsparcie', items:['dyspozytor','logistyka-kontraktowa'], col:3},
        {t:'Specjalizacje', items:['tir-ftl','przeprowadzki','ecommerce'], col:4},
        {t:'Oferta', items:['cennik','wycena'], col:5}
      ];
      const map = {
        'transport-krajowy': {pl:'Transport krajowy',en:'Domestic transport',de:'Inlands­transport',fr:'Transport national',it:'Trasporto nazionale',ru:'Внутрироссийские перевозки',ua:'Внутрішні перевезення'},
        'transport-miedzynarodowy': {pl:'Transport międzynarodowy',en:'International transport',de:'International',fr:'International',it:'Internazionale',ru:'Международные перевозки',ua:'Міжнародні перевезення'},
        'palety': {pl:'Transport palet',en:'Pallet transport',de:'Paletten­transport',fr:'Transport de palettes',it:'Trasporto pallet',ru:'Перевозка палет',ua:'Перевезення палет'},
        'ekspres': {pl:'Ekspres',en:'Express',de:'Express',fr:'Express',it:'Espresso',ru:'Экспресс',ua:'Експрес'},
        'sla': {pl:'SLA',en:'SLA',de:'SLA',fr:'SLA',it:'SLA',ru:'SLA',ua:'SLA'},
        'busy-3-5t': {pl:'Busy 3,5 t',en:'3.5t vans',de:'3,5t Transporter',fr:'Vans 3,5 t',it:'Furgoni 3,5 t',ru:'Фургоны 3,5 т',ua:'Фургони 3,5 т'},
        'dyspozytor': {pl:'Dyspozytor',en:'Dispatcher',de:'Disponent',fr:'Dispatcher',it:'Dispatcher',ru:'Диспетчер',ua:'Диспетчер'},
        'logistyka-kontraktowa': {pl:'Logistyka kontraktowa',en:'Contract logistics',de:'Kontraktlogistik',fr:'Logistique contractuelle',it:'Logistica contrattuale',ru:'Контрактная логистика',ua:'Контрактна логістика'},
        'tir-ftl': {pl:'TIR / FTL',en:'TIR / FTL',de:'TIR / FTL',fr:'TIR / FTL',it:'TIR / FTL',ru:'TIR / FTL',ua:'TIR / FTL'},
        'przeprowadzki': {pl:'Przeprowadzki',en:'Relocations',de:'Umzüge',fr:'Déménagements',it:'Traslochi',ru:'Переезды',ua:'Переїзди'},
        'ecommerce': {pl:'E‑commerce',en:'E‑commerce',de:'E‑Commerce',fr:'E‑commerce',it:'E‑commerce',ru:'E‑commerce',ua:'E‑commerce'},
        'cennik': {pl:'Cennik',en:'Pricing',de:'Preise',fr:'Tarifs',it:'Prezzi',ru:'Цены',ua:'Ціни'},
        'wycena': {pl:'Wycena',en:'Quote',de:'Angebot',fr:'Devis',it:'Preventivo',ru:'Расчет',ua:'Кошторис'}
      };
      for (const g of svc) {
        for (const key of g.items) {
          nav.push({
            lang, label: map[key][lang], href: buildUrl(lang, key, [
              ...routes,
              {slugKey:'transport-krajowy', pl:'transport-krajowy', en:'domestic-transport', de:'inland', fr:'national', it:'nazionale', ru:'vnutri', ua:'vnutrishni'},
              {slugKey:'transport-miedzynarodowy', pl:'transport-miedzynarodowy', en:'international-transport', de:'international', fr:'international', it:'internazionale', ru:'mezhdunarodnyj', ua:'mizhnarodni'},
              {slugKey:'palety', pl:'transport-palet', en:'pallet-transport', de:'paletten', fr:'palettes', it:'pallet', ru:'palety', ua:'palety'},
              {slugKey:'ekspres', pl:'ekspres', en:'express', de:'express', fr:'express', it:'espresso', ru:'express', ua:'express'},
              {slugKey:'sla', pl:'sla', en:'sla', de:'sla', fr:'sla', it:'sla', ru:'sla', ua:'sla'},
              {slugKey:'busy-3-5t', pl:'busy-3-5t', en:'vans-3-5t', de:'transporter-3-5t', fr:'vans-3-5t', it:'furgoni-3-5t', ru:'furgony-3-5t', ua:'furgony-3-5t'},
              {slugKey:'dyspozytor', pl:'dyspozytor', en:'dispatcher', de:'disponent', fr:'dispatcher', it:'dispatcher', ru:'dispatcher', ua:'dispatcher'},
              {slugKey:'logistyka-kontraktowa', pl:'logistyka-kontraktowa', en:'contract-logistics', de:'kontraktlogistik', fr:'logistique-contractuelle', it:'logistica-contrattuale', ru:'kontraktnaya-logistika', ua:'kontraktna-logistyka'},
              {slugKey:'tir-ftl', pl:'tir-ftl', en:'tir-ftl', de:'tir-ftl', fr:'tir-ftl', it:'tir-ftl', ru:'tir-ftl', ua:'tir-ftl'},
              {slugKey:'przeprowadzki', pl:'przeprowadzki', en:'relocations', de:'umzuege', fr:'demenagements', it:'traslochi', ru:'pereezdy', ua:'pereyizdy'},
              {slugKey:'ecommerce', pl:'ecommerce', en:'ecommerce', de:'ecommerce', fr:'ecommerce', it:'ecommerce', ru:'ecommerce', ua:'ecommerce'},
              {slugKey:'cennik', pl:'cennik', en:'pricing', de:'preise', fr:'tarifs', it:'prezzi', ru:'ceny', ua:'tsiny'},
              {slugKey:'wycena', pl:'wycena', en:'quote', de:'angebot', fr:'devis', it:'preventivo', ru:'raschet', ua:'koshtorys'}
            ]), parent: ({pl:'Usługi',en:'Services',de:'Leistungen',fr:'Services',it:'Servizi',ru:'Услуги',ua:'Послуги'})[lang],
            order:10, enabled:true, col:g.col
          });
        }
      }
    }
    return { ok:true, nav, routes, strings };
  })();

  // --------- STATE
  const state = {
    lang: langFromPath(),
    data: null // cms
  };

  // --------- CACHE
  const cacheKey = (lang) => `kt:cms:${lang}`;
  const saveCache = (lang, data) => { try { localStorage.setItem(cacheKey(lang), JSON.stringify({ts:Date.now(), data})); } catch(e){} };
  const readCache = (lang) => {
    try {
      const raw = localStorage.getItem(cacheKey(lang)); if (!raw) return null;
      const obj = JSON.parse(raw); if (Date.now()-obj.ts > CACHE_TTL) return null;
      return obj.data;
    } catch(e){ return null; }
  };

  // --------- FETCH
  async function fetchCMS(endpoint) {
    if (!endpoint) throw new Error('CMS endpoint missing');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), 12000);
    const res = await fetch(endpoint, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    const json = await res.json();
    if (!json || !json.ok) throw new Error('CMS returned not ok');
    return json;
  }

  // --------- RENDER HELPERS
  function stringsMap(stringsArray, lang) {
    const m = {};
    for (const s of stringsArray) m[s.key] = s[lang] ?? s['pl'] ?? '';
    return m;
  }

  function topNavByLang(nav, lang) {
    const nn = nav.filter(n => n.enabled !== false && n.lang === lang);
    const top = nn.filter(n => !n.parent || n.parent === '');
    const children = nn.filter(n => !!n.parent);
    top.sort((a,b)=> (a.order||0)-(b.order||0));
    children.sort((a,b)=> (a.order||0)-(b.order||0));
    const byParent = new Map();
    for (const c of children) {
      const p = (c.parent||'').toLowerCase();
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(c);
    }
    return { top, byParent };
  }

  function isPointerFine() { return matchMedia('(pointer:fine)').matches; }

  function makeA(href, label) {
    const a = document.createElement('a');
    a.href = href;
    a.className = 'kt-link';
    a.rel = isExternal(href) ? 'noopener' : '';
    if (isExternal(href)) a.target = '_blank';
    sanitizeText(a, label);
    a.addEventListener('pointerenter', () => prefetch(href), {passive:true});
    return a;
  }

  // --------- BUILD TOP NAV + MEGA
  function buildTopbar(data) {
    const { top, byParent } = topNavByLang(data.nav, state.lang);
    const container = qs('#ktNav');
    container.innerHTML = '';
    for (const item of top) {
      const li = document.createElement('div');
      li.className = 'kt-item';
      const hasChildren = byParent.has((item.label || '').toLowerCase());
      const a = makeA(item.href, item.label);
      if (hasChildren) {
        a.setAttribute('aria-haspopup','true');
        a.setAttribute('aria-expanded','false');
        a.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); openMega(item, a, byParent.get((item.label||'').toLowerCase())); focusFirstMegaLink(); }
        });
        li.dataset.mega = '1';
        attachHoverIntent(li, () => openMega(item, a, byParent.get((item.label||'').toLowerCase())), closeMega);
      } else {
        attachHoverIntent(li, () => {}, () => {});
      }
      li.appendChild(a);
      container.appendChild(li);
    }
  }

  function distributeColumns(children, forcedCols=4) {
    // group by col if provided (1..5), else chunk evenly
    const byCol = new Map();
    const withCol = children.filter(c => Number.isInteger(c.col));
    if (withCol.length) {
      for (const c of children) {
        const k = clamp(parseInt(c.col||1,10),1,5);
        if (!byCol.has(k)) byCol.set(k, []);
        byCol.get(k).push(c);
      }
      const cols = Array.from(byCol.keys()).sort((a,b)=>a-b).map(k => byCol.get(k));
      return cols;
    } else {
      const cols = Math.min(forcedCols, Math.max(1, Math.ceil(children.length / 6)));
      const out = Array.from({length:cols}, () => []);
      children.forEach((c,i)=> out[i%cols].push(c));
      return out;
    }
  }

  function openMega(parentItem, anchorEl, children) {
    const mega = qs('#ktMega');
    const inner = qs('#ktMegaInner', mega);
    // Populate
    inner.innerHTML = '';
    const cols = distributeColumns(children, parentItem.label && parentItem.label.toLowerCase() === 'usługi' ? 5 : 4);
    cols.forEach((list, idx) => {
      const col = document.createElement('div');
      col.className = 'kt-mega-col';
      for (const c of list) {
        const link = document.createElement('a');
        link.className = 'kt-mega-link';
        link.href = c.href;
        if (isExternal(c.href)) { link.rel='noopener'; link.target='_blank'; }
        sanitizeText(link, c.label);
        link.addEventListener('pointerenter', () => prefetch(c.href), {passive:true});
        col.appendChild(link);
      }
      inner.appendChild(col);
    });
    // Show
    mega.classList.add('open');
    mega.setAttribute('aria-hidden','false');
    anchorEl.setAttribute('aria-expanded','true');
    currentOpenAnchor = anchorEl;
  }

  function closeMega() {
    const mega = qs('#ktMega');
    if (mega.classList.contains('open')) {
      mega.classList.remove('open');
      mega.setAttribute('aria-hidden','true');
    }
    if (currentOpenAnchor) currentOpenAnchor.setAttribute('aria-expanded','false');
    currentOpenAnchor = null;
  }

  // Hover intent with corridor
  let openTimer=null, closeTimer=null, currentOpenAnchor=null, corridorActive=false, lastPos=null;
  function attachHoverIntent(host, onOpen, onClose) {
    const enter = () => {
      clearTimeout(closeTimer);
      openTimer = setTimeout(() => { onOpen(); corridorActive=true; }, HOVER_OPEN_DELAY);
    };
    const leave = () => {
      clearTimeout(openTimer);
      closeTimer = setTimeout(() => { corridorActive=false; onClose(); }, HOVER_CLOSE_DELAY);
    };
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    document.addEventListener('pointermove', (e) => {
      if (!corridorActive) return;
      lastPos = {x:e.clientX,y:e.clientY};
      // simple corridor: if pointer is between nav item baseline and mega top, keep open
      const bar = HEADER.getBoundingClientRect();
      const mega = qs('#ktMega');
      if (!mega) return;
      const m = mega.getBoundingClientRect();
      const inside = (lastPos.y >= (bar.bottom-8) && lastPos.y <= (m.top+40));
      if (inside) { clearTimeout(closeTimer); }
    }, {passive:true});
  }

  function focusFirstMegaLink() {
    const first = qs('#ktMegaInner a');
    if (first) first.focus();
  }

  // --------- MOBILE
  let trapRestore = null;
  function openMobile() {
    const mob = qs('#ktMobile');
    mob.hidden = false;
    mob.classList.add('open');
    mob.setAttribute('aria-hidden','false');
    qs('#ktBurger').setAttribute('aria-expanded','true');
    trapFocus(mob);
  }
  function closeMobile() {
    const mob = qs('#ktMobile');
    mob.classList.remove('open');
    mob.setAttribute('aria-hidden','true');
    qs('#ktBurger').setAttribute('aria-expanded','false');
    setTimeout(()=>{ mob.hidden = true; }, 200);
    releaseFocus();
  }
  function trapFocus(panel) {
    const focusables = qsa('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])', panel).filter(x => !x.hasAttribute('disabled'));
    const first = focusables[0], last = focusables[focusables.length-1];
    trapRestore = document.activeElement;
    (first||panel).focus();
    panel.addEventListener('keydown', onKey);
    function onKey(e){
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); (last||first).focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); (first||last).focus(); }
      }
      if (e.key === 'Escape') { e.preventDefault(); closeMobile(); }
    }
  }
  function releaseFocus(){
    const mob = qs('#ktMobile');
    mob.removeEventListener('keydown', onKeyDownVoid);
    if (trapRestore) trapRestore.focus();
    function onKeyDownVoid(){}
  }

  // --------- BOTTOM DOCK
  function buildDock(data) {
    const strings = stringsMap(data.strings, state.lang);
    const routes = data.routes;
    const dock = qs('#ktDock .kt-dock');
    dock.innerHTML = '';
    const items = [
      {key:'home', t:{pl:'Start',en:'Home',de:'Start',fr:'Accueil',it:'Home',ru:'Главная',ua:'Головна'}, emoji:'🏠'},
      {key:'services', t:{pl:'Usługi',en:'Services',de:'Leistungen',fr:'Services',it:'Servizi',ru:'Услуги',ua:'Послуги'}, emoji:'🧭'},
      {key:'quote', t:{pl:'Wycena',en:'Quote',de:'Angebot',fr:'Devis',it:'Preventivo',ru:'Расчет',ua:'Кошторис'}, emoji:'💸'},
      {key:'contact', t:{pl:'Kontakt',en:'Contact',de:'Kontakt',fr:'Contact',it:'Contatti',ru:'Контакты',ua:'Контакт'}, emoji:'🤙'}
    ];
    for (const it of items) {
      const a = document.createElement('a');
      a.href = buildUrl(state.lang, it.key, routes);
      a.innerHTML = `<div class="e" aria-hidden="true">${it.emoji}</div><div class="t">${it.t[state.lang]||it.t.pl}</div>`;
      a.addEventListener('pointerenter', () => prefetch(a.href), {passive:true});
      dock.appendChild(a);
    }
    qs('#ktDockFab').onclick = openMobile;
  }

  // --------- LANG MENU
  function buildLangMenu(data) {
    const list = qs('#ktLangList');
    list.innerHTML = '';
    for (const l of LOCALES) {
      const li = document.createElement('li');
      const a = document.createElement('button');
      a.type='button';
      a.className = 'kt-lang-item';
      a.dataset.lang = l;
      a.innerHTML = `<img src="/assets/flags/${l}.svg" width="22" height="14" alt="${l.toUpperCase()}"> <span>${l.toUpperCase()}</span>`;
      a.addEventListener('click', () => switchLang(l, data.routes));
      li.appendChild(a);
      list.appendChild(li);
    }
    const btn = qs('#ktLangBtn');
    btn.addEventListener('click', () => toggleLangMenu());
  }
  function toggleLangMenu(force) {
    const list = qs('#ktLangList');
    const btn = qs('#ktLangBtn');
    const open = (force===true) || (list.hasAttribute('hidden'));
    if (open) { list.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); }
    else { list.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); }
  }
  function switchLang(lang, routes) {
    const home = buildUrl(lang, 'home', routes);
    location.href = home;
  }

  // --------- THEME
  function initTheme(strings) {
    const btn = qs('#ktThemeBtn');
    const k = 'kt:theme';
    let cur = document.documentElement.getAttribute('data-theme') || 'light';
    btn.setAttribute('aria-pressed', String(cur==='dark'));
    btn.addEventListener('click', () => {
      cur = (cur==='dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem(k, cur);
      btn.setAttribute('aria-pressed', String(cur==='dark'));
    });
  }

  // --------- MOBILE NAV BUILD
  function buildMobileNav(data) {
    const { top, byParent } = topNavByLang(data.nav, state.lang);
    const root = qs('#ktMobileNav'); root.innerHTML='';
    for (const item of top) {
      const box = document.createElement('div'); box.className='kt-m-item';
      const head = document.createElement('div'); head.className='kt-m-top';
      const link = document.createElement('a'); link.href=item.href; sanitizeText(link, item.label); link.className='kt-m-link';
      link.addEventListener('pointerenter', () => prefetch(link.href), {passive:true});
      head.appendChild(link);
      const hasChildren = byParent.has((item.label||'').toLowerCase());
      if (hasChildren) {
        const exp = document.createElement('button'); exp.textContent='▾'; exp.setAttribute('aria-expanded','false'); exp.className='kt-btn';
        exp.addEventListener('click', () => {
          const opened = exp.getAttribute('aria-expanded')==='true';
          exp.setAttribute('aria-expanded', String(!opened));
          childrenBox.hidden = opened;
        });
        head.appendChild(exp);
      }
      box.appendChild(head);
      const childrenBox = document.createElement('div'); childrenBox.className='kt-m-children'; childrenBox.hidden = true;
      if (hasChildren) {
        for (const c of byParent.get((item.label||'').toLowerCase())) {
          const a = document.createElement('a'); a.href=c.href; a.className='kt-m-link'; sanitizeText(a, c.label);
          if (isExternal(c.href)) { a.rel='noopener'; a.target='_blank'; }
          a.addEventListener('pointerenter', () => prefetch(a.href), {passive:true});
          childrenBox.appendChild(a);
        }
      }
      box.appendChild(childrenBox);
      root.appendChild(box);
    }
  }

  // --------- BRAND + CTA
  function updateBrandAndCTA(data) {
    const strings = stringsMap(data.strings, state.lang);
    const brand = qs('#ktBrand');
    brand.href = buildUrl(state.lang, 'home', data.routes);
    const img = qs('#ktLogo'); img.src = LOGO_SRC; img.alt = strings['brand_alt'] || 'Kras-Trans';
    const cta = qs('#ktCTA'); sanitizeText(cta, strings['cta_quote_primary']||'Get a quote');
    cta.href = buildUrl(state.lang, 'quote', data.routes);
    const flag = qs('#ktLangFlag'); flag.src = `/assets/flags/${state.lang}.svg`; flag.alt = state.lang.toUpperCase();
  }

  // --------- ESC & GLOBAL EVENTS
  function globalKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMega(); toggleLangMenu(false);
        closeMobile();
      }
    });
  }

  function handleResize() { setMegaTop(); }
  function handleScroll() { setMegaTop(); }

  // --------- HYDRATE FLOW
  async function hydrate() {
    let data = readCache(state.lang) || null;
    if (!data) {
      try {
        data = await fetchCMS(CMS_ENDPOINT);
        saveCache(state.lang, data);
      } catch (e) {
        // keep fallback
        data = null;
      }
    }
    state.data = data || FALLBACK;
    renderAll(state.data);
  }

  function renderAll(data) {
    updateBrandAndCTA(data);
    buildTopbar(data);
    buildMobileNav(data);
    buildLangMenu(data);
    buildDock(data);
  }

  // --------- INIT (fallback immediate)
  function init() {
    setMegaTop();
    // Render fallback instantly
    state.data = FALLBACK;
    renderAll(state.data);

    // Events
    globalKeys();
    window.addEventListener('resize', handleResize, {passive:true});
    window.addEventListener('scroll', handleScroll, {passive:true});
    qs('#ktBurger')?.addEventListener('click', openMobile);
    qs('#ktMobileClose')?.addEventListener('click', closeMobile);
    qs('#ktMobile .kt-mobile-backdrop')?.addEventListener('click', closeMobile);
    initTheme();

    // Hydrate from CMS (async)
    hydrate();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
