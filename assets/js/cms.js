/*!
 * KTCMS – Apps Script fetcher v2 (MAX)
 * - wykrywa endpoint z: window.CMS_ENDPOINT, <meta name="cms-endpoint">, <script id="ktHeaderScript" data-api="...">
 * - próbuje 4 warianty URL: /{resource}, ?action=, ?sheet=, ?page=
 * - localStorage cache (TTL, stale-while-revalidate), ETag/304
 * - fallback do /data/cms.json
 * - zdarzenia: ktcms:state (loading/ready/stale/error), ktcms:update
 * - render: data-api="/home/services" (kafelki), + helpery do i18n
 */
(function () {
  'use strict';

  // ------------------- KONFIG -------------------
  const PREFIX = 'ktcms:';
  const VER = 'v2';
  const TTL_MS = 60 * 60 * 1000;       // 1h
  const DEBUG = /(\?|&)debug=cms\b/.test(location.search);

  const DOC = document;
  const HTML = DOC.documentElement;

  function log(...a){ if(DEBUG) console.log('[CMS]', ...a); }
  function warn(...a){ if(DEBUG) console.warn('[CMS]', ...a); }

  // ------------------- ENDPOINT -------------------
  function detectEndpoint(){
    // 1) <meta name="cms-endpoint">
    const meta = DOC.querySelector('meta[name="cms-endpoint"]')?.content || '';
    // 2) okno
    const win = (typeof window !== 'undefined' && (window.CMS_ENDPOINT || '')) || '';
    // 3) <script id="ktHeaderScript" data-api="...">
    const headScript = DOC.getElementById('ktHeaderScript')?.dataset?.api || '';
    // preferencja: window > meta > script
    return (win || meta || headScript || '').trim();
  }
  const ENDPOINT_BASE = detectEndpoint();

  function langNow(){
    return (HTML.getAttribute('lang') || DOC.getElementById('ktHeaderScript')?.dataset?.defaultlang || 'pl').slice(0,2);
  }

  function buildUrls(resource){
    const base = (ENDPOINT_BASE || '').replace(/\/$/, '');
    const name = String(resource||'home').replace(/^\//,'');
    if (!base) return [];
    const pfx = base.includes('?') ? '&' : '?';
    const L = langNow();
    return [
      `${base}/${name}`,                  // …/exec/home
      `${base}${pfx}action=${name}`,      // …/exec?action=home
      `${base}${pfx}sheet=${name}`,       // …/exec?sheet=home
      `${base}${pfx}page=${name}`,        // …/exec?page=home
    ].map(u => `${u}&lang=${encodeURIComponent(L)}`);
  }

  // ------------------- CACHE -------------------
  function cacheKey(resource){
    const base = ENDPOINT_BASE || 'none';
    return `${PREFIX}${VER}:${base}:${resource}:${langNow()}`;
  }
  function loadCache(key){
    try{ return JSON.parse(localStorage.getItem(key) || 'null'); }catch{ return null; }
  }
  function saveCache(key, obj){
    try{ localStorage.setItem(key, JSON.stringify(obj)); }catch{} // quota/full – ignoruj
  }
  function fresh(ts){ return ts && (Date.now() - ts) < TTL_MS; }

  // ------------------- FETCH -------------------
  async function fetchJson(url, etag){
    const opt = { headers: { 'Accept':'application/json' } };
    if (etag) opt.headers['If-None-Match'] = etag;
    const r = await fetch(url, opt);
    if (r.status === 304) return { status: 304, etag, data: null };
    if (!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    const et = r.headers.get('ETag') || '';
    return { status: 200, etag: et, data };
  }

  async function getResource(resource){
    const key = cacheKey(resource);
    const c = loadCache(key);
    const urls = buildUrls(resource);
    const state = (s,extra)=>window.dispatchEvent(new CustomEvent('ktcms:state',{detail:{resource,state,...extra}}));

    // świeży cache → zwraca natychmiast (SWR)
    if (c && fresh(c.ts)){ state('ready',{source:'cache',ts:c.ts}); revalidate(resource, key, c); return { ...c, from:'cache', swr:true }; }

    // brak świeżego – spróbuj sieć
    state('loading',{endpoint:ENDPOINT_BASE});
    for (const url of urls){
      try{
        log('try', url);
        const r = await fetchJson(url, c?.etag);
        if (r.status === 304 && c){ state('ready',{source:'cache-304',ts:c.ts}); return { ...c, from:'cache' }; }
        if (r.status === 200){
          const obj = { ts: Date.now(), etag: r.etag || null, data: r.data };
          saveCache(key,obj);
          state('ready',{source:'network',ts:obj.ts});
          return { ...obj, from:'network' };
        }
      }catch(e){ warn('net', e.message); }
    }

    // fallback do lokalnego JSON
    try{
      const rf = await fetch('/data/cms.json', { headers:{'Accept':'application/json'} });
      if (rf.ok){
        const j = await rf.json();
        const obj = { ts: Date.now(), etag: null, data: j };
        state('fallback',{source:'local'});
        return { ...obj, from:'local' };
      }
    }catch{}

    // ostatnia szansa – stary cache
    if (c){ state('stale',{source:'cache',ts:c.ts}); return { ...c, from:'cache', stale:true }; }

    state('error',{error:'no-data'});
    return { ts: 0, etag:null, data:{} , from:'none' };
  }

  async function revalidate(resource, key, cached){
    try{
      for (const url of buildUrls(resource)){
        try{
          const r = await fetchJson(url, cached?.etag);
          if (r.status === 200){
            const obj = { ts: Date.now(), etag: r.etag || null, data: r.data };
            saveCache(key,obj);
            window.dispatchEvent(new CustomEvent('ktcms:update',{detail:{resource}}));
            log('revalidated', resource);
            return;
          }
          if (r.status === 304) return;
        }catch(e){/* następny url */}
      }
    }catch(_){}
  }

  // ------------------- NORMALIZACJA -------------------
  // akceptujemy różne formaty odpowiedzi i sprowadzamy je do wspólnego modelu
  function getLangText(obj, L){
    if (!obj || typeof obj !== 'object') return obj || '';
    return obj[L] || obj.pl || obj.en || Object.values(obj)[0] || '';
  }

  function normalizeHome(data){
    // A) { home:{ services:[...] } }
    if (data?.home?.services) return data.home;

    // B) { home_services:[...] }
    if (Array.isArray(data?.home_services)) return { services: data.home_services };

    // C) { pages:[ {id|slugKey|type='home_services', items:[...]} ] }
    if (Array.isArray(data?.pages)){
      const hit = data.pages.find(p =>
        p.id === 'home_services' || p.slugKey === 'home_services' || p.type === 'home_services'
      );
      if (hit?.items) return { services: hit.items };
    }

    return { services: [] };
  }

  // ------------------- RENDERERY -------------------
  function renderServices(container, homeModel){
    const L = langNow();
    const items = Array.isArray(homeModel.services) ? homeModel.services : [];
    container.innerHTML = items.map(s => `
      <article class="card" role="article">
        <div class="ico" aria-hidden="true">${s.icon || ''}</div>
        <h3>${getLangText(s.title, L)}</h3>
        <p>${getLangText(s.desc, L)}</p>
      </article>
    `).join('');
  }

  // ------------------- HYDRATE -------------------
  async function hydrate(){
    const zones = Array.from(DOC.querySelectorAll('[data-api]'));
    if (!zones.length) return;

    // jedna paczka "home" obsłuży wiele stref
    const pack = await getResource('home');
    const home = normalizeHome(pack.data);

    zones.forEach(z => {
      const key = z.getAttribute('data-api') || '';
      if (key.endsWith('/services')) renderServices(z, home);
    });

    // SWR – jeśli przyszła świeża wersja z sieci, powtórz render
    window.addEventListener('ktcms:update', (e)=>{
      if (e.detail?.resource !== 'home') return;
      getResource('home').then(p => {
        const model = normalizeHome(p.data);
        zones.forEach(z => { const k=z.getAttribute('data-api')||''; if (k.endsWith('/services')) renderServices(z, model); });
      });
    });
  }

  // Skeleton / body-class
  (function wireSkeleton(){
    const ROOT = DOC.documentElement;
    window.addEventListener('ktcms:state', (e)=>{
      const s = e.detail?.state;
      if (s === 'loading') ROOT.classList.add('kt-cms-loading');
      else ROOT.classList.remove('kt-cms-loading');
    });
  })();

  // start
  if (!ENDPOINT_BASE) warn('Brak ENDPOINT – sprawdź <meta name="cms-endpoint"> lub window.CMS_ENDPOINT');
  window.addEventListener('DOMContentLoaded', hydrate);
})();
