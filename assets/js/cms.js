/* Kras-Trans • cms.js (HOME MVP)
   - czyta endpoint z <meta name="cms-endpoint"> / window.CMS_ENDPOINT
   - obsługuje: action=home, home/hero, home/services, faq/list, routes
   - fallback: gdy brak mikro-API, próbuje pełnego payloadu i sam wycina sekcje
   - zero twardych tekstów – tylko bindy do templates/page.html
*/
(function () {
  const LANG = (document.documentElement.getAttribute('lang') || 'pl').toLowerCase();
  const ENDPOINT =
    window.CMS_ENDPOINT ||
    (document.querySelector('meta[name="cms-endpoint"]')?.content || '').trim();

  if (!ENDPOINT) {
    console.warn('[CMS] Brak CMS_ENDPOINT');
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const setText = (el, v) => { if (el) el.textContent = v || ''; };
  const setAttr = (el, map) => { if (!el) return; Object.entries(map||{}).forEach(([k,v]) => {
    if (v!==undefined && v!==null && v!=='') el.setAttribute(k, v);
  }); };

  function routesHref(routes, slugKey, lang = LANG) {
    if (!routes || !routes[slugKey]) return `/${lang}/`;
    const s = routes[slugKey][lang] || '';
    return `/${lang}/${s ? s + '/' : ''}`;
  }

  async function fetchJSON(pathOrNull) {
    // Google Apps Script często robi 302 -> user_content; to OK.
    const tries = [];
    const base = new URL(ENDPOINT, location.origin);

    // prefer mikro-endpointy
    if (pathOrNull) {
      for (const param of ['action','path','a','u']) {
        const u = new URL(base);
        u.searchParams.set(param, pathOrNull);
        u.searchParams.set('lang', LANG);
        // klucz może być w samej bazie endpointu – nie nadpisujemy
        if (!u.searchParams.get('key') && base.searchParams.get('key')) {
          u.searchParams.set('key', base.searchParams.get('key'));
        }
        tries.push(u.toString());
      }
    }
    // fallback: pełna paczka (bez parametrów)
    {
      const u = new URL(base);
      if (!u.searchParams.get('key') && base.searchParams.get('key')) {
        u.searchParams.set('key', base.searchParams.get('key'));
      }
      u.searchParams.set('lang', LANG);
      tries.push(u.toString());
    }

    for (const url of tries) {
      try {
        const res = await fetch(url, { redirect: 'follow', mode: 'cors', credentials: 'omit' });
        if (!res.ok) continue;
        const j = await res.json();
        if (j && j.ok !== false) return j;
      } catch (e) {
        // kontynuuj kolejne próby
      }
    }
    return null;
  }

  // ------- HERO -------
  async function hydrateHero() {
    const sec = $('#hero[data-api]'); if (!sec) return;
    const data = (await fetchJSON('home/hero')) || (await fetchJSON('home')) || (await fetchJSON(null));
    if (!data) return;

    // znormalizuj z pełnej paczki, jeśli brak mikro
    if (!data.hero && data.pages) {
      const home = data.pages.find(p => (p.lang||LANG)===LANG && ((p.slugKey||p.slug||'')==='home'));
      data.hero = {
        title: home?.h1 || home?.title || '',
        lead: home?.lead || '',
        kpi: [],
        cta_primary:   { label: home?.cta_label || '',     slugKey: 'quote'   },
        cta_secondary: { label: home?.cta_secondary || '', slugKey: 'contact' },
        image: { src: (home?.hero_image || home?.og_image || ''), srcset: '', alt: (home?.hero_alt || home?.h1 || '') }
      };
      data.routes = data.hreflang ? null : data.routes; // może być brak
    }

    const { hero, routes } = data;
    setText($('#hero-title'), hero?.title);
    setText($('#hero .hero__lead'), hero?.lead);

    const a1 = $('#hero .cta-row .btn.btn-primary');
    const a2 = $('#hero .cta-row .btn:not(.btn-primary):not(.btn-ghost)');
    if (a1) { a1.href = routesHref(data.routes, hero?.cta_primary?.slugKey); a1.textContent = hero?.cta_primary?.label || ''; }
    if (a2) { a2.href = routesHref(data.routes, hero?.cta_secondary?.slugKey); a2.textContent = hero?.cta_secondary?.label || ''; }

    setAttr($('#heroLCP'), {
      src: (hero?.image?.src || '').trim(),
      srcset: (hero?.image?.srcset || '').trim(),
      alt: (hero?.image?.alt || '').trim()
    });

    const list = $('#hero .hero__kpi');
    const tpl = $('#tpl-hero-kpi');
    if (list && tpl) {
      list.innerHTML = '';
      (hero?.kpi || []).forEach(item => {
        const node = tpl.content.cloneNode(true);
        setText(node.querySelector('strong'), item.value);
        setText(node.querySelector('span'), item.label);
        list.appendChild(node);
      });
    }
    sec.setAttribute('aria-busy','false');
  }

  // ------- SERVICES -------
  async function hydrateServices() {
    const grid = $('#services .services__grid[data-api]'); if (!grid) return;
    const data = (await fetchJSON('home/services')) || (await fetchJSON('home')) || (await fetchJSON(null));
    if (!data) return;

    // fallback z pełnej paczki
    if (!data.services && data.pages) {
      data.services = data.pages
        .filter(p => (p.lang||LANG)===LANG && p.type==='service' && p.publish!==false)
        .sort((a,b) => (a.order||0)-(b.order||0))
        .map(s => ({ icon:'', title:s.h1||s.title||'', desc:s.lead||'', slugKey:(s.slugKey||s.slug||''), cta:{label:''} }));
    }

    const tpl = $('#tpl-service-card'); if (!tpl) return;
    grid.innerHTML = '';
    (data.services || []).forEach(svc => {
      const node = tpl.content.cloneNode(true);
      setText(node.querySelector('.card__title'), svc.title);
      setText(node.querySelector('.card__desc'), svc.desc);
      const a = node.querySelector('.card__link');
      if (a) { a.href = routesHref(data.routes, svc.slugKey); a.textContent = (svc.cta?.label || ''); }
      const ic = node.querySelector('.card__icon'); if (ic && svc.icon) ic.innerHTML = svc.icon;
      grid.appendChild(node);
    });

    // nagłówki sekcji (jeśli API je zwróci)
    setText($('#services-title'), data?.home?.section_titles?.services || '');
    setText($('#services .section__sub'), data?.home?.section_subtitles?.services || '');
    $('#services').setAttribute('aria-busy','false');
  }

  // ------- FAQ -------
  async function hydrateFAQ() {
    const list = $('#faq .faq-list[data-api]'); if (!list) return;
    const data = (await fetchJSON('faq/list')) || (await fetchJSON(null));
    const items = data?.faq || (data?.faq?.rows) || [];
    const tpl = $('#tpl-faq-item'); if (!tpl) return;
    list.innerHTML = '';
    items.forEach(it => {
      const node = tpl.content.cloneNode(true);
      setText(node.querySelector('summary'), it.q || '');
      setText(node.querySelector('.a p'), it.a || '');
      list.appendChild(node);
    });
    $('#faq').setAttribute('aria-busy','false');
  }

  document.addEventListener('DOMContentLoaded', function () {
    hydrateHero();
    hydrateServices();
    hydrateFAQ();
  });
})();
