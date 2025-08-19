/* ================== HEADER JS (Kras-Trans) ================== */
const API_URL = document.currentScript.dataset.api;  // Apps Script endpoint
const CACHE_NS = 'kt_nav_v2';
const CACHE_TTL = 6 * 60 * 60 * 1000;                // 6h
const LOCALES = ['pl','en','de','fr','it','ru','ua'];

const FALLBACK = {
  pl: {
    items: [
      { key:'cennik', label:'Cennik', children:[
        {label:'Cennik usług', href:'/pl/cennik/'},
        {label:'Kalkulator', href:'/pl/kalkulator/'},
        {label:'Promocje', href:'/pl/promocje/'},
        {label:'Płatności', href:'/pl/platnosci/'},
      ]},
      { key:'zamow', label:'Zamów', children:[
        {label:'Zamów bus 3,5 t', href:'/pl/zamow-busy-35t/'},
        {label:'Zamów TIR', href:'/pl/zamow-tir/'},
        {label:'Stała linia (SLA)', href:'/pl/sla/'},
        {label:'Poproś o wycenę', href:'/pl/wycena/'},
      ]},
      { key:'harmonogramy', label:'Harmonogramy', children:[
        {label:'Okna załadunku', href:'/pl/okna-zaladunku/'},
        {label:'Okna rozładunku', href:'/pl/okna-rozladunku/'},
        {label:'Kalendarz zakazów ruchu UE', href:'/pl/kalendarz-zakazow/'},
        {label:'Święta w UE', href:'/pl/swieta/'},
      ]},
      { key:'sledzenie', label:'Śledzenie', children:[
        {label:'Śledź przesyłkę', href:'/pl/sledzenie/'},
        {label:'Historia dostaw', href:'/pl/historia-dostaw/'},
        {label:'POD i dokumenty CMR', href:'/pl/pod-cmr/'},
        {label:'Powiadomienia', href:'/pl/powiadomienia/'},
      ]},
      { key:'zarzadzaj', label:'Zarządzaj', children:[
        {label:'Panel klienta', href:'/pl/panel-klienta/'},
        {label:'Zlecenia', href:'/pl/zlecenia/'},
        {label:'Integracje (API)', href:'/pl/integracje/'},
        {label:'Wysyłaj dokumenty', href:'/pl/wyslij-dokumenty/'},
      ]},
      { key:'uslugi', label:'Usługi', children:[
        {label:'Transport krajowy', href:'/pl/transport-krajowy/'},
        {label:'Transport międzynarodowy', href:'/pl/transport-miedzynarodowy/'},
        {label:'Transport palet', href:'/pl/transport-paletowy/'},
        {label:'Transport ekspresowy 24/7', href:'/pl/transport-ekspresowy/'},
        {label:'ADR', href:'/pl/adr/'},
        {label:'SLA i stałe linie', href:'/pl/sla/'},
        {label:'Busy 3,5 t', href:'/pl/busy-35t/'},
        {label:'High‑value / elektronika', href:'/pl/high-value/'},
        {label:'Dedykowany dyspozytor', href:'/pl/dedykowany-dyspozytor/'},
        {label:'Transport TIR (FTL)', href:'/pl/ftl/'},
        {label:'Przeprowadzki firm', href:'/pl/przeprowadzki/'},
        {label:'Logistyka kontraktowa', href:'/pl/contract-logistics/'},
        {label:'E‑commerce B2B', href:'/pl/ecommerce/'},
        {label:'Cennik', href:'/pl/cennik/'},
        {label:'Wycena online', href:'/pl/wycena/'},
      ]},
      { key:'firma', label:'Firma', children:[
        {label:'O nas', href:'/pl/o-nas/'},
        {label:'Zespół', href:'/pl/zespol/'},
        {label:'Case studies', href:'/pl/case-studies/'},
        {label:'Flota', href:'/pl/flota/'},
        {label:'Opinie', href:'/pl/opinie/'},
        {label:'Certyfikaty', href:'/pl/certyfikaty/'},
        {label:'Zrównoważony rozwój', href:'/pl/esg/'},
        {label:'Kariera', href:'/pl/praca/'},
        {label:'Dla mediów', href:'/pl/media/'},
        {label:'Kontakt', href:'/pl/kontakt/'},
        {label:'Prawne', href:'/pl/prawne/'},
      ]},
      { key:'wsparcie', label:'Wsparcie', children:[
        {label:'FAQ', href:'/pl/faq/'},
        {label:'Informacje lokalne', href:'/pl/informacje-lokalne/'},
        {label:'Instrukcje', href:'/pl/instrukcje/'},
        {label:'Kontakt ze wsparciem', href:'/pl/wsparcie/'},
      ]},
      { key:'blog', label:'Blog', href:'/pl/blog/' },
      { key:'kontakt', label:'Kontakt', href:'/pl/kontakt/' }
    ]
  },
  // Możesz przetłumaczyć kolejne – fallback nie przeszkadza hydratacji.
  en: { items: [] }, de:{items:[]}, fr:{items:[]}, it:{items:[]}, ru:{items:[]}, ua:{items:[]}
};

/* ------------- narzędzia ------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const getLang = () => {
  const m = location.pathname.match(/^\/([a-z]{2})\b/i);
  return m ? m[1].toLowerCase() : 'pl';
};
const setLangToPath = (lang) => {
  const cur = getLang();
  if (cur === lang) return;
  const rest = location.pathname.replace(/^\/[a-z]{2}/i, '').replace(/^\/?/, '/');
  location.href = `/${lang}${rest}`;
};
const cacheGet = (key) => {
  try{
    const raw = localStorage.getItem(`${CACHE_NS}:${key}`);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(Date.now() - obj.ts > CACHE_TTL) return null;
    return obj.data;
  }catch{ return null; }
};
const cacheSet = (key, data) => {
  try{ localStorage.setItem(`${CACHE_NS}:${key}`, JSON.stringify({ts:Date.now(), data})); }catch{}
};

/* ------------- rendering ------------- */
function renderMainNav(items){
  const ul = $('#ktMainNav');
  ul.innerHTML = '';
  items.forEach(item=>{
    const li = document.createElement('li');
    if(item.children && item.children.length){
      li.innerHTML = `
        <a href="#" class="kt-nav-link" data-key="${item.key}" role="button" aria-expanded="false">
          <span>${item.label}</span>
          <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </a>`;
      // mega
      li.addEventListener('mouseenter', ()=> openMega(item));
      li.addEventListener('mouseleave', onNavLeave);
    }else{
      li.innerHTML = `<a class="kt-nav-link" href="${item.href||'#'}"><span>${item.label}</span></a>`;
    }
    ul.appendChild(li);
  });
}

function col(label, links){
  const wrap = document.createElement('div');
  wrap.className = 'kt-col';
  if(label) wrap.innerHTML = `<h6>${label}</h6>`;
  const frag = document.createDocumentFragment();
  links.forEach(l=>{
    const a = document.createElement('a');
    a.className = 'kt-link';
    a.href = l.href || '#';
    a.textContent = l.label;
    frag.appendChild(a);
  });
  wrap.appendChild(frag);
  return wrap;
}

let megaTimer = null, megaOpen = false;
function openMega(item){
  clearTimeout(megaTimer);
  const mega = $('#ktMega'), inner = $('#ktMegaInner');
  mega.classList.add('active');
  megaOpen = true;

  // pozycja względem headera
  const hdr = $('#site-header');
  document.documentElement.style.setProperty('--megaTop', `${hdr.getBoundingClientRect().bottom}px`);

  // zbuduj panel
  inner.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'kt-mega-panel';
  const grid = document.createElement('div');
  grid.className = 'kt-mega-grid';

  // heurystyka – rozbitka usług na 5 kolumn (jak u Maersk)
  if(item.key === 'uslugi' && item.children){
    const CH = item.children;
    grid.append(
      col('Transport', CH.slice(0,4)),
      col(null, [CH[4], CH[5], CH[6]]),
      col(null, [CH[7], CH[8], CH[9]]),
      col(null, [CH[10], CH[11]]),
      col(null, [CH[12], CH[13], CH[14]])
    );
  }else if(item.children){
    // zwykłe 3–5 kolumn
    const perCol = clamp(Math.ceil(item.children.length / 4), 3, 6);
    for(let i=0;i<item.children.length;i+=perCol){
      grid.append(col(null, item.children.slice(i, i+perCol)));
    }
  }
  panel.appendChild(grid);
  inner.appendChild(panel);
}
function onNavLeave(){
  clearTimeout(megaTimer);
  megaTimer = setTimeout(()=>{
    $('#ktMega').classList.remove('active');
    megaOpen = false;
  }, 260); // hover intent – daj czas dojechać myszką
}
$('#ktMega')?.addEventListener('mouseleave', onNavLeave);
$('#ktMega')?.addEventListener('mouseenter', ()=>{ clearTimeout(megaTimer); });

/* ------------- język + motyw ------------- */
function setupLangControls(lang){
  // Logo i CTA w aktualnym języku
  $('#brandLink').href = `/${lang}/`;
  $('#quoteBtn').href = `/${lang}/wycena/`;

  // Flaga i lista
  $('#langFlag').src = `/assets/flags/${lang === 'en' ? 'gb' : lang}.svg`;
  $('#langCode').textContent = lang.toUpperCase();

  const LANGS = [
    {code:'pl', label:'Polski'},
    {code:'en', label:'English'},
    {code:'de', label:'Deutsch'},
    {code:'fr', label:'Français'},
    {code:'it', label:'Italiano'},
    {code:'ru', label:'Русский'},
    {code:'ua', label:'Українська'},
  ];
  const ul = $('#langMenu');
  ul.innerHTML = '';
  LANGS.forEach(l=>{
    const li = document.createElement('li');
    li.innerHTML = `<a class="kt-lang-item" href="#" data-lang="${l.code}">
        <img class="flag" src="/assets/flags/${l.code==='en'?'gb':l.code}.svg" alt="">
        <span>${l.label}</span>
      </a>`;
    ul.appendChild(li);
  });

  $('#langBtn').onclick = ()=>{
    const m = $('#langMenu'), btn = $('#langBtn');
    const vis = m.hasAttribute('hidden') ? false : true;
    btn.setAttribute('aria-expanded', String(!vis));
    if(vis) m.setAttribute('hidden',''); else m.removeAttribute('hidden');
  };
  ul.addEventListener('click', (e)=>{
    const a = e.target.closest('[data-lang]');
    if(!a) return;
    e.preventDefault();
    setLangToPath(a.dataset.lang);
  });
  document.addEventListener('click', (e)=>{
    if(!$('#langSwitch').contains(e.target)) $('#langMenu').setAttribute('hidden','');
  });

  // Motyw
  const root = document.documentElement;
  const saved = localStorage.getItem('kt_theme');
  if(saved){ root.setAttribute('data-theme', saved); }
  else{
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
  $('#themeToggle').onclick = ()=>{
    const cur = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', cur);
    localStorage.setItem('kt_theme', cur);
  };
}

/* ------------- fallback + CMS hydration ------------- */
async function hydrateFromCMS(lang){
  // Cache?
  const CKEY = `${lang}`;
  const cached = cacheGet(CKEY);
  if(cached && cached.items?.length){
    renderMainNav(cached.items);
  }

  try{
    const url = new URL(API_URL);
    url.searchParams.set('lang', lang);
    // wymagany format: .doGet() zwraca JSON { nav: [...], routes: [...], strings: [...] }
    const res = await fetch(url, { credentials:'omit', cache:'no-cache' });
    if(!res.ok) throw new Error('Bad response');
    const json = await res.json();

    const normalized = normalizeNavFromCMS(json, lang);
    if(normalized.items?.length){
      cacheSet(CKEY, normalized);
      renderMainNav(normalized.items);
    }
  }catch(err){
    // cicho – zostaw fallback
    // console.debug('NAV hydrate fail', err);
  }
}

/* konwersja struktury z Twojego Apps Script → nasz format */
function normalizeNavFromCMS(payload, lang){
  const rows = Array.isArray(payload?.nav) ? payload.nav : [];
  // oczekujemy: { lang, label, href, parent, order, enabled }
  const tree = {};
  rows.filter(r => (r.enabled !== false) && (!r.lang || r.lang.toLowerCase()===lang))
      .sort((a,b)=> (Number(a.order||0) - Number(b.order||0)))
      .forEach(r=>{
        const parent = (r.parent||'').trim();
        const node = { label: r.label?.trim()||'', href: r.href?.trim()||'#' };
        if(parent){
          tree[parent] = tree[parent] || { key: slug(parent), label: parent, children: [] };
          tree[parent].children.push(node);
        }else{
          tree[r.label] = tree[r.label] || { key: slug(r.label), label: r.label, href: r.href?.trim() };
        }
      });

  // Konwersja → lista
  const items = [];
  const order = Object.values(tree).sort((a,b)=> (a.key>b.key?1:-1));
  order.forEach(v => items.push(v));
  // dopnij blog/kontakt jeśli przyszły bez parenta
  if(!items.find(i=>i.key==='blog') && payload?.routes){ /* opcjonalnie */ }
  return { items };
}
function slug(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-'); }

/* ------------- init ------------- */
function init(){
  const lang = getLang();
  setupLangControls(lang);

  // od razu fallback (natychmiast)
  const fall = FALLBACK[lang]?.items?.length ? FALLBACK[lang] : FALLBACK.pl;
  renderMainNav(fall.items);

  // potem hydratuj z CMS
  hydrateFromCMS(lang);

  // shrink on scroll (lekko)
  const header = $('#site-header');
  const onScroll = ()=>{
    if(window.scrollY > 8) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  document.addEventListener('scroll', onScroll, {passive:true});
}

document.addEventListener('DOMContentLoaded', init);
/* ============================================================= */
