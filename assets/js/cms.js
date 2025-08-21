/*!
 * Kras‑Trans • cms.js
 * NAV loader: static snapshot (instant) → cache → optional refresh z GAS
 * - Zero „slugify fallback” dla rodziców bez landing page (href="#", blokada kliknięcia)
 * - Dedykowane key‑value w localStorage: kt_nav_bundle_{lang}
 * - Renderuje: primary_html, mega_html, langs_html, CTA, logo, status, social
 * - Odporny na brak API/KEY (działa ze snapshotem)
 */

(function () {
  'use strict';

  /* ========= DOM ========= */
  const root     = document.getElementById('site-header');
  if (!root) return;

  // Główne elementy nagłówka (łap elastycznie — różne wersje header.html)
  const navList  = document.getElementById('navList');
  const mega     = document.getElementById('mega');
  const langList = document.getElementById('langList') || document.getElementById('langMenu');

  const brandLink = document.getElementById('brandlink') || document.getElementById('brand') || root.querySelector('.brand a, #brand a');
  const brandImg  = (brandLink && brandLink.querySelector('img')) || document.getElementById('brandImg') || root.querySelector('.brand img');

  const ctaBtn   = document.getElementById('cta') || root.querySelector('[data-cta]');
  const statusEl = document.getElementById('statusPill') || root.querySelector('[data-status-pill]');

  /* ========= Konfiguracja ========= */
  const HTML = document.documentElement;
  const LANG = (location.pathname.match(/^\/([a-z]{2})\//) || [,''])[1] || (HTML.lang || 'pl').slice(0,2).toLowerCase();

  // Endpoint + key z data-* lub globali/mety (działa, nawet gdy ich nie ma)
  const API     = (root.dataset.api || window.CMS_ENDPOINT || '').trim();
  const API_KEY = (root.dataset.key || window.CMS_API_KEY || '').trim();

  // Ścieżki do flag, gdyby były potrzebne (snapshot zwykle ma absoluty)
  const FLAGS_PATH = root.dataset.flags || '/assets/flags';

  // Cache (6h)
  const TTL_MS = 6 * 60 * 60 * 1000;
  const CK = (k) => `kt_${k}_${LANG}`;

  /* ========= Pomocnicze ========= */
  const now  = () => Date.now();
  const safeJSON = (s, def=null) => { try { return JSON.parse(s); } catch(_){ return def; } };
  function getCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = safeJSON(raw);
      if (!obj || !obj.ts || !obj.v) return null;
      if (now() - obj.ts > TTL_MS) return null;
      return obj.v;
    } catch (_) { return null; }
  }
  function setCache(key, val) {
    try { localStorage.setItem(key, JSON.stringify({ ts: now(), v: val })); } catch (_) {}
  }
  const deepEq = (a,b) => {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch(_){ return false; }
  };

  // Nie czyścimy/nie poprawiamy HTML z bundla — generowany po naszej stronie
  const passHTML = (s) => s || '';

  // Zbuduj href do sluga na bazie mapy routes z bundla (jeśli jest)
  function hrefForSlug(bundle, slugKey) {
    if (!bundle || !bundle.routes || !slugKey) return `/${LANG}/`;
    const map = bundle.routes[String(slugKey)] || {};
    const slug = (map[LANG] || '').replace(/^\/+|\/+$/g,'');
    return `/${LANG}/${slug ? (slug + '/') : ''}`;
  }

  let openTO, closeTO, activeLi;
  function scheduleOpen(key, li) {
    clearTimeout(openTO); clearTimeout(closeTO);
    openTO = setTimeout(() => openPanel(key, li), 200);
  }
  function scheduleClose(key, li) {
    clearTimeout(openTO); clearTimeout(closeTO);
    closeTO = setTimeout(() => closePanel(key, li), 400);
  }

  if (mega) {
    mega.addEventListener('mouseenter', () => clearTimeout(closeTO));
    mega.addEventListener('mouseleave', () => {
      const key = mega.dataset.active;
      if (key) scheduleClose(key, activeLi);
    });
  }

  /* ========= Render ========= */
  function renderFromBundle(bundle) {
    if (!bundle) return;

    // PRIMARY NAV
    if (navList && bundle.primary_html) {
      navList.innerHTML = passHTML(bundle.primary_html);
      enhancePrimary(navList); // aria + obsługa mega + blokada kliknięć rodziców bez landing page
    }

    // MEGA‑PANELE
    if (mega && bundle.mega_html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = passHTML(bundle.mega_html);
      const sections = tmp.querySelectorAll('section');
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      sections.forEach(sec => grid.appendChild(sec));
      mega.innerHTML = '';
      mega.appendChild(grid);
      mega.style.display = 'none';
      mega.style.opacity = '0';
      mega.style.transform = 'translateY(-8px)';
      mega.style.transition = 'opacity 300ms cubic-bezier(.2,.7,.2,1), transform 300ms cubic-bezier(.2,.7,.2,1)';
      mega.style.pointerEvents = 'none';
    }

    // JĘZYKI
    if (langList && bundle.langs_html) {
      langList.innerHTML = passHTML(bundle.langs_html);
    }

    // LOGO
    if (brandImg && bundle.logo && bundle.logo.src) {
      brandImg.src = bundle.logo.src;
      brandImg.alt = bundle.logo.alt || brandImg.alt || '';
    }

    // CTA
    if (ctaBtn && bundle.cta) {
      if (bundle.cta.label) ctaBtn.textContent = bundle.cta.label;
      // Priorytet: trasa z routes; fallback do istniejącego href
      const want = hrefForSlug(bundle, bundle.cta.slugKey || 'quote');
      if (want) ctaBtn.setAttribute('href', want);
    }

    // STATUS
    if (statusEl && bundle.status && bundle.status.label) {
      statusEl.textContent = bundle.status.label;
      if (bundle.status.href) statusEl.setAttribute('href', bundle.status.href);
    }

    // (opcjonalnie) social — jeśli w headerze są atrybuty data-*
    if (root && bundle.social) {
      ['ig','li','fb'].forEach(k=>{
        const el = root.querySelector(`[data-social="${k}"]`);
        if (el && bundle.social[k]) el.setAttribute('href', bundle.social[k]);
      });
    }

    root.dispatchEvent(new CustomEvent('kt:nav:rendered', { detail: { lang: LANG }}));
  }

  // Ulepszenie listy głównej:
  // - brak błędnego fallbacku do /{lang}/{slugify(parent)}/ (rodzic bez linku ma href="#" + blokada)
  // - otwieranie/zamykanie mega‑paneli (hover + click/touch)
  function enhancePrimary(list) {
    const items = list.querySelectorAll(':scope > li');

    items.forEach(li => {
      const panel = (li.getAttribute('data-panel') || '').trim();
      const a = li.querySelector('a');
      const hasPanel = !!panel;

      let href = a ? (a.getAttribute('href') || '') : '';
      href = (href && href.trim()) || '#';

      // Jeżeli anchor nie ma prawidłowego docelowego URL — traktuj jako toggle (a nie link)
      if (!href || href === '#' || href === '/#') {
        if (a) {
          a.setAttribute('href', '#');
          a.setAttribute('role', 'button');
          a.setAttribute('aria-haspopup', hasPanel ? 'true' : 'false');
          a.setAttribute('aria-expanded', 'false');
          a.addEventListener('click', e => {
            if (hasPanel) { e.preventDefault(); togglePanel(panel, li); }
          }, { passive:false });
        }
      }

      if (hasPanel) {
        li.classList.add('has-panel');
        // Hover (desktop)
        li.addEventListener('mouseenter', () => scheduleOpen(panel, li));
        li.addEventListener('mouseleave', () => scheduleClose(panel, li));
        // Tap/click (mobile + fallback)
        li.addEventListener('click', (e) => {
          const targetA = e.target.closest('a');
          // Jeśli klik w anchor z realnym linkiem — przepuszczamy
          if (targetA && targetA.getAttribute('href') && targetA.getAttribute('href') !== '#') return;
          e.preventDefault();
          togglePanel(panel, li);
        });
      }
    });

    // Podświetl aktualną stronę
    try {
      const cur = location.pathname.replace(/\/+$/,'') + '/';
      const active = list.querySelector(`a[href="${cur}"]`);
      if (active) active.setAttribute('aria-current', 'page');
    } catch(_) {}

  }

  function openPanel(key, li) {
    if (!mega || !key) return;
    clearTimeout(openTO); clearTimeout(closeTO);
    if (mega.dataset.active !== key) {
      activeLi?.querySelector('a[aria-expanded]')?.setAttribute('aria-expanded','false');
    }
    activeLi = li || activeLi;
    mega.dataset.active = key;
    mega.style.display = 'block';
    requestAnimationFrame(() => {
      mega.style.pointerEvents = 'auto';
      mega.style.opacity = '1';
      mega.style.transform = 'translateY(0)';
    });
    root.classList.add('mega-open');
    li?.querySelector('a[aria-expanded]')?.setAttribute('aria-expanded','true');
  }
  function closePanel(key, li) {
    if (!mega || !key) return;
    clearTimeout(openTO); clearTimeout(closeTO);
    if (mega.dataset.active === key) { delete mega.dataset.active; }
    mega.style.opacity = '0';
    mega.style.transform = 'translateY(-8px)';
    mega.style.pointerEvents = 'none';
    setTimeout(() => { mega.style.display = 'none'; }, 300);
    root.classList.remove('mega-open');
    (li || activeLi)?.querySelector('a[aria-expanded]')?.setAttribute('aria-expanded','false');
    activeLi = null;
  }
  function togglePanel(key, li) {
    if (!mega || !key) return;
    if (mega.dataset.active === key) closePanel(key, li);
    else openPanel(key, li);
  }

  /* ========= Źródła danych ========= */

  // 1) localStorage — natychmiastowy paint (jeżeli jest i świeże)
  const cached = getCache(CK('nav_bundle'));
  if (cached) renderFromBundle(cached);

  // 2) statyczny snapshot z serwera (autoratywny; bardzo szybki; odświeża cache+DOM)
  fetch(`/assets/nav/bundle_${LANG}.json`, { cache:'no-store', credentials:'same-origin' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('static 404')))
    .then(b => {
      if (!deepEq(b, cached)) {
        renderFromBundle(b);
        setCache(CK('nav_bundle'), b);
      }
    })
    .catch(() => { /* brak pliku – trudno; jedziemy dalej */ });

  // 3) ciche odświeżenie z GAS (jeśli skonfigurowany endpoint)
  if (API) {
    const url = API + (API.includes('?') ? '&' : '?')
              + (API_KEY ? `key=${encodeURIComponent(API_KEY)}&` : '')
              + `lang=${encodeURIComponent(LANG)}&nocache=1`;
    fetch(url, { cache:'no-store', mode:'cors' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('gas error')))
      .then(j => j && j.nav_current ? j.nav_current : null)
      .then(b => {
        if (!b) return;
        const cur = getCache(CK('nav_bundle')); // może już zaktualizowaliśmy przez snapshot
        if (!deepEq(b, cur)) {
          renderFromBundle(b);
          setCache(CK('nav_bundle'), b);
        }
      })
      .catch(() => { /* brak dostępu do GAS — nie blokujemy UI */ });
  }

})();
