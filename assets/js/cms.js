// FILE: assets/js/cms.js
/*! KTCMS – pobieranie i cache treści z Google Apps Script (CMS) */
(function () {
  'use strict';

  const KT_PREFIX = 'kt-';
  const LS_KEY = `${KT_PREFIX}cms:v1`;
  const TTL = 60 * 60 * 1000; // 1h

  // Stałe projektu (fallback, można nadpisać przez data-api na <script> lub window.CMS_ENDPOINT)
  const CMS_API_URL = "https://script.google.com/macros/s/AKfycbyQcsU1wSCV6NGDQm8VIAGpZkL1rArZe1UZ5tutTkjJiKZtr4MjQZcDFzte26VtRJJ2KQ/exec";
  const CMS_API_KEY = "kb6mWQJQ3hTtY0m1GQ7v2rX1pC5n9d8zA4s6L2u";
  const DEFAULT_ENDPOINT = `${CMS_API_URL}?key=${CMS_API_KEY}`;

  function currentScriptApi() {
    try { return document.currentScript && document.currentScript.dataset.api; }
    catch { return null; }
  }

  function getEndpoint() {
    return currentScriptApi() || (typeof window !== 'undefined' && window.CMS_ENDPOINT) || DEFAULT_ENDPOINT;
  }

  const ENDPOINT = getEndpoint();

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(`${KT_PREFIX}cms:${name}`, { detail }));
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveCache(data) {
    try {
      const payload = { ts: Date.now(), data };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch { /* quota/full – pomijamy */ }
  }

  function isFresh(ts) {
    return ts && (Date.now() - ts) < TTL;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function fetchWithRetry(url, { retries = 3, baseDelay = 400 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { data, from: 'network' };
      } catch (err) {
        if (attempt === retries) throw err;
        const jitter = Math.random() * 120;
        await sleep(baseDelay * Math.pow(2, attempt) + jitter);
      }
    }
  }

  async function get({ preferCache = true } = {}) {
    dispatch('state', { state: 'loading', endpoint: ENDPOINT });

    const cached = loadCache();
    if (preferCache && cached && isFresh(cached.ts)) {
      dispatch('state', { state: 'ready', source: 'cache', ts: cached.ts });
      return { ...cached, from: 'cache', fresh: true };
    }

    try {
      const { data } = await fetchWithRetry(ENDPOINT);
      saveCache(data);
      const fresh = { ts: Date.now(), data, from: 'network', fresh: true };
      dispatch('state', { state: 'ready', source: 'network', ts: fresh.ts });
      return fresh;
    } catch (netErr) {
      if (cached) {
        dispatch('state', { state: 'stale', source: 'cache', ts: cached.ts, error: String(netErr) });
        return { ...cached, from: 'cache', fresh: false };
      }
      // Awaryjnie spróbuj lokalnego fallbacku (strings.json) – minimalne teksty
      try {
        const res = await fetch('/data/strings.json', { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        const now = Date.now();
        dispatch('state', { state: 'fallback', source: 'strings', ts: now });
        return { ts: now, data, from: 'strings', fresh: false };
      } catch {
        dispatch('state', { state: 'error', error: 'Brak połączenia i brak cache' });
        throw netErr;
      }
    }
  }

  function clear() {
    localStorage.removeItem(LS_KEY);
    dispatch('state', { state: 'cleared' });
  }

  // Prosty auto-UI: klasa na <html> + skeletony
  (function wireSkeletons() {
    const ROOT = document.documentElement;
    window.addEventListener(`${KT_PREFIX}cms:state`, (e) => {
      const s = e.detail?.state;
      if (s === 'loading') ROOT.classList.add('kt-cms-loading');
      else ROOT.classList.remove('kt-cms-loading');

      // Pokaż/ukryj elementy skeletonów
      const show = s === 'loading';
      document.querySelectorAll('.kt-skeleton').forEach(el => el.hidden = !show);
    });
  })();

  // API publiczne
  window.KTCMS = {
    /** Pobierz dane CMS (JSON) z cache/endpointu. Zwraca: {ts, data, from, fresh} */
    get,
    /** Wyczyść cache localStorage */
    clear,
    /** Aktualnie używany endpoint */
    endpoint: ENDPOINT,
    /** Klucz localStorage */
    LS_KEY,
    /** Czas życia cache w ms */
    TTL
  };
})();
