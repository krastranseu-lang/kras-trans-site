/*!
 * KTCMS – Apps Script fetcher v2 (MAX)
 * - wykrywa endpoint: window.CMS_ENDPOINT, <meta name="cms-endpoint">, <script id="ktHeaderScript" data-api="...">
 * - próbuje 4 warianty URL: /{resource}, ?action=, ?sheet=, ?page= (+lang=)
 * - localStorage cache (TTL, stale-while-revalidate), ETag/304
 * - retry/backoff, fallback do /data/cms.json
 * - zdarzenia: "ktcms:state" (loading/ready/stale/error), "ktcms:update"
 * - renderery: data-api="/home/services", "/faq/list" (możesz dodać kolejne)
 */
(function () {
  'use strict';

  // ------------------- KONFIG -------------------
  const VER = 'v2';
  const TTL_MS = 60 * 60 * 1000; // 1h
  const DEBUG = /(\?|&)debug=cms\b/.test(location.search);
  const DOC = document;
  const HTML = DOC.documentElement;

  function log(...a){ if(DEBUG) console.log('[CMS]', ...a); }
  function warn(...a){ if(DEBUG) console.warn('[CMS]', ...a); }

  // ------------------- ENDPOINT -------------------
  function detectEndpoint(){
    // 1) window
    if (typeof window !== 'undefined' && window.CMS_ENDPOINT && String(window.CMS_ENDPOINT).trim()) {
      return String(window.CMS_ENDPOINT).trim();
    }
    // 2) <meta>
    const meta = DOC.querySelector('meta[name="cms-endpoint"]');
    if (meta && meta.content) return meta.content.trim();
    // 3) <script id="ktHeaderScript" data-api="...">
    const scr = DOC.getElementById('ktHeaderScript');
    if (scr && scr.dataset && scr.dataset.api) return scr.dataset.api.trim();
    return '';
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
    // porządek ma znaczenie – Apps Script bywa różny
    return [
      `${base}/${name}`,                  // …/exec/home
      `${base}${pfx}action=${name}`,      // …/exec?action=home
      `${base}${pfx}sheet=${name}`,       // …/exec?sheet=home
      `${base}${pfx}page=${name}`         // …/exec?page=home
    ].map(u => `${u}&lang=${encodeURIComponent(L)}`);
  }

  // ------------------- CACHE / SWR -------------------
  function k(resource){ return `ktcms:${VER}:${ENDPOINT_BASE}:${resource}:${langNow()}`; }
  function load(key){ try{ return JSON.parse(localStorage.getItem(key) || 'null'); }catch{ return null; } }
  function save(key,obj){ try{ localStorage.setItem(key, JSON.stringify(obj)); }catch{} }
  function fresh(ts){ return ts && (Date.now() - ts) < TTL_MS; }

  async function fetchJson(url, etag){
    const opt = { headers:{ 'Accept':'application/json' } };
    if (etag) opt.headers['If-None-Match'] = etag;
    const r = await fetch(url, opt);
    if (r.status === 304) return { status:304, etag, data:null };
    if (!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    return { status:200, etag: (r.headers.get('ETag') || ''), data };
  }

  // zwraca obiekt: {ts, etag, data, from, swr?}
  async function getResource(resource){
    const key = k(resource);
    const cached = load(key);

    const emit = (state, extra={}) =>
      window.dispatchEvent(new CustomEvent('ktcms:state', { detail:{ resource, state, ...extra }}));

    // świeży cache → zwrot natychmiast + SWR
    if (cached && fresh(cached.ts)){
      emit('ready', { source:'cache', ts:cached.ts });
      revalidate(resource, key, cached); // w tle
      return { ...cached, from:'cache', swr:true };
    }

    emit('loading', { endpoint:ENDPOINT_BASE });

    for (const url of buildUrls(resource)){
      try{
        log('try', url);
        const r = await fetchJson(url, cached?.etag);
        if (r.status === 304 && cached){
          emit('ready', { source:'cache-304', ts:cached.ts });
          return { ...cached, from:'cache' };
        }
        if (r.status === 200){
          const obj = { ts:Date.now(), etag: r.etag || null, data:r.data };
          save(key, obj);
          emit('ready', { source:'network', ts:obj.ts });
          return { ...obj, from:'network' };
        }
      }catch(e){ warn('net', e.message); }
    }

    // fallback lokalny
    try{
      const rf = await fetch('/data/cms.json', { headers:{'Accept':'application/json'} });
      if (rf.ok){
        const j = await rf.json();
        const obj = { ts:Date.now(), etag:null, data:j };
        emit('fallback', { source:'local' });
        return { ...obj, from:'local' };
      }
    }catch(_){}

    // stary cache, jeśli jest
    if (cached){
      emit('stale', { source:'cache', ts:cached.ts });
      return { ...cached, from:'cache', stale:true };
    }

    emit('error', { error:'no-data' });
    return { ts:0, etag:null, data:{}, from:'none' };
  }

  async function revalidate(resource, key, cached){
    for (const url of buildUrls(resource)){
      try{
        const r = await fetchJson(url, cached?.etag);
        if (r.status === 200){
          const obj = { ts:Date.now(), etag:r.etag || null, data:r.data };
          save(key, obj);
          window.dispatchEvent(new CustomEvent('ktcms:update', { detail:{resource} }));
          log('revalidated', resource);
          return;
        }
        if (r.status === 304) return;
      }catch(_){}
    }
  }

  // ------------------- i18n helpery / normalizacja -------------------
  function langText(any, L){
    if (!any) return '';
    if (typeof any === 'string') return any;
    return any[L] || any.pl || any.en || Object.values(any)[0] || '';
  }

  // model HOME
  function normalizeHome(data){
    if (data?.home?.services) return data.home;
    if (Array.isArray(data?.home_services)) return { services: data.home_services };
    if (Array.isArray(data?.pages)){
      const hit = data.pages.find(p => (p.id==='home_services'||p.slugKey==='home_services'||p.type==='home_services'));
      if (hit?.items) return { services: hit.items };
    }
    return { services: [] };
  }

  // model FAQ
  function normalizeFaq(data){
    if (Array.isArray(data?.faq)) return data.faq;
    if (Array.isArray(data?.faqs)) return data.faqs;
    if (Array.isArray(data?.pages)){
      const hit = data.pages.find(p => (p.id==='faq'||p.slugKey==='faq'||p.type==='faq'));
      if (Array.isArray(hit?.items)) return hit.items.map(x => ({ q:x.q||x.title||'', a:x.a||x.body||'' }));
    }
    return [];
  }

  // ------------------- renderery sekcji -------------------
  function renderServices(node, home){
    const L = langNow();
    const items = Array.isArray(home.services) ? home.services : [];
    node.innerHTML = items.map(s => `
      <article class="card" role="article">
        <div class="ico" aria-hidden="true">${s.icon || ''}</div>
        <h3>${langText(s.title, L)}</h3>
        <p>${langText(s.desc, L)}</p>
      </article>
    `).join('');
  }

  function renderFaq(node, faqList){
    const L = langNow();
    node.innerHTML = faqList.map(f => `
      <details class="qa">
        <summary>${langText(f.q||f.title, L)}</summary>
        <div class="a"><p>${langText(f.a||f.answer||f.body, L)}</p></div>
      </details>
    `).join('');
  }

  // ------------------- HYDRATE (grupowanie po resource) -------------------
  async function hydrate(){
    const zones = Array.from(DOC.querySelectorAll('[data-api]'));
    if (!zones.length) return;

    // zgrupuj po resource ("/home/services" → "home")
    const groups = zones.reduce((acc, z)=>{
      const api = z.getAttribute('data-api') || '';
      const res = api.replace(/^\//,'').split('/')[0] || 'home';
      (acc[res] ||= []).push(z);
      return acc;
    }, {});

    // obsłuż znane zasoby
    for (const [res, arr] of Object.entries(groups)){
      const pack = await getResource(res);
      if (res === 'home'){
        const model = normalizeHome(pack.data);
        arr.forEach(z => { if (z.getAttribute('data-api').endsWith('/services')) renderServices(z, model); });
        // SWR – odśwież po revalidate
        window.addEventListener('ktcms:update', e=>{
          if (e.detail?.resource !== 'home') return;
          getResource('home').then(p => {
            const m = normalizeHome(p.data);
            arr.forEach(z => { if (z.getAttribute('data-api').endsWith('/services')) renderServices(z, m); });
          });
        });
      }
      if (res === 'faq'){
        const list = normalizeFaq(pack.data);
        arr.forEach(z => { if (z.getAttribute('data-api').endsWith('/list')) renderFaq(z, list); });
        window.addEventListener('ktcms:update', e=>{
          if (e.detail?.resource !== 'faq') return;
          getResource('faq').then(p => {
            const l = normalizeFaq(p.data);
            arr.forEach(z => { if (z.getAttribute('data-api').endsWith('/list')) renderFaq(z, l); });
          });
        });
      }
    }
  }

  // body-class / skeleton
  (function wireSkeleton(){
    const ROOT = DOC.documentElement;
    window.addEventListener('ktcms:state', (e)=>{
      const s = e.detail?.state;
      if (s === 'loading') ROOT.classList.add('kt-cms-loading');
      else ROOT.classList.remove('kt-cms-loading');
    });
  })();

  if (!ENDPOINT_BASE) warn('Brak ENDPOINT – sprawdź <meta name="cms-endpoint"> lub window.CMS_ENDPOINT');
  window.addEventListener('DOMContentLoaded', hydrate);
})();
