/* KRAS-TRANS • cms.js
   NAV renderer (snapshot → DOM): primary, mega panels, mobile drawer, langs, CTA, logo.
   - źródło: /assets/nav/<lang>.json (fallback: /nav/bundle_<lang>.json)
   - brak duplikatów, grupowanie po `parent`
   - zgodne z headerem i CSS (selektory: #navList, #megaPanels, #mobileList, #langsList, #cta, #navLogo)
   - lekko: bez bibliotek, bez ciężkich reflowów, prefetch na hover
*/
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* -------------------- helpers -------------------- */
  const slugify = (raw) => String(raw||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

  function getLang() {
    const htmlLang = (document.documentElement.getAttribute('lang')||'').slice(0,2);
    const m = location.pathname.match(/^\/([a-z]{2})\b/i);
    return (m && m[1]) || htmlLang || 'pl';
  }
  const LANG = getLang();

  const STATIC_URLS = [
    `/assets/nav/${LANG}.json`,
    `/nav/bundle_${LANG}.json`,     // legacy fallback (jeśli tak generujesz)
  ];

  async function loadSnapshot() {
    for (const base of STATIC_URLS) {
      try {
        const url = base + `?ts=${Date.now()}`;                // twardy bypass cache
        const res = await fetch(url, { cache:'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        // akceptujemy shape z `items[]` albo z `nav_current.primary_html`
        if (json && (Array.isArray(json.items) || (json.nav_current && (json.nav_current.primary_html || json.primary_html)))) {
          return json;
        }
      } catch (_){}
    }
    return null;
  }

  /* -------------------- renderer (items → DOM) -------------------- */
  function renderFromItems(data) {
    const items = Array.isArray(data.items) ? data.items : [];
    const header = $('#site-header'); if (!header) return;

    const navList    = $('#navList');
    const megaPanels = $('#megaPanels');
    const mobileList = $('#mobileList');
    const langsList  = $('#langsList');
    const ctaBtn     = $('#cta');
    const logoImg    = $('#navLogo');

    // 1) deduplikacja i grupowanie
    const seen = new Set();
    const parents = new Map();   // parentLabel -> [{label,href}]
    let singles = [];            // bez parenta

    items.forEach(row => {
      const label  = String(row.label||'').trim();
      const href   = String(row.href||'').trim();
      const parent = String(row.parent||'').trim();
      if (!label || !href || href === '#') return;

      const key = `${label}|${href}|${parent}`;
      if (seen.has(key)) return; seen.add(key);

      if (parent) {
        if (!parents.has(parent)) parents.set(parent, []);
        parents.get(parent).push({ label, href });
      } else {
        singles.push({ label, href });
      }
    });

    // singles nie mogą dublować parentów
    const parentSetLC = new Set([...parents.keys()].map(p => p.toLowerCase()));
    singles = singles.filter(s => !parentSetLC.has(s.label.toLowerCase()));

    // 2) PRIMARY: singles → zwykłe <li>, parenty → <li data-panel="...">
    if (navList) {
      const frag = document.createDocumentFragment();

      // a) single
      singles.forEach(it => {
        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.href = it.href; a.textContent = it.label;
        li.appendChild(a); frag.appendChild(li);
      });

      // b) parenty (kolejność wg mapy)
      [...parents.keys()].forEach(parent => {
        const li = document.createElement('li');
        li.setAttribute('data-panel', slugify(parent));
        const a = document.createElement('a');
        // spróbuj znaleźć „root” o takiej samej etykiecie (bez parenta) jako docelowy href
        const root = items.find(x => (String(x.label||'').trim().toLowerCase() === parent.toLowerCase()) && !x.parent);
        a.href = root ? String(root.href||'#') : `/${LANG}/${slugify(parent)}/`;
        a.textContent = parent;
        li.appendChild(a); frag.appendChild(li);
      });

      navList.textContent = '';
      navList.appendChild(frag);
    }

    // 3) MEGA PANELS: po jednym <section> na parent
    if (megaPanels) {
      const wrap = document.createDocumentFragment();
      [...parents.keys()].forEach(parent => {
        const sec  = document.createElement('section');
        sec.className = 'mega__section';
        sec.setAttribute('data-panel', slugify(parent));

        const grid = document.createElement('div');
        grid.className = 'mega__grid';

        (parents.get(parent) || []).forEach(it => {
          const card = document.createElement('div');
          card.className = 'card';
          const a = document.createElement('a');
          a.href = it.href; a.textContent = it.label;
          card.appendChild(a); grid.appendChild(card);
        });

        sec.appendChild(grid);
        wrap.appendChild(sec);
      });
      megaPanels.textContent = '';
      megaPanels.appendChild(wrap);
    }

    // 4) MOBILE DRAWER: single + parenty (rozwijane)
    if (mobileList) {
      const frag = document.createDocumentFragment();

      // a) single
      singles.forEach(it => {
        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.href = it.href; a.textContent = it.label;
        li.appendChild(a); frag.appendChild(li);
      });

      // b) zagnieżdżenia
      [...parents.keys()].forEach(parent => {
        const li  = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = parent;
        btn.setAttribute('aria-expanded','false');

        const sub = document.createElement('ul');
        sub.hidden = true; sub.className = 'mobile-sub';

        (parents.get(parent)||[]).forEach(it => {
          const sli = document.createElement('li');
          const a   = document.createElement('a');
          a.href = it.href; a.textContent = it.label;
          sli.appendChild(a); sub.appendChild(sli);
        });

        btn.addEventListener('click', () => {
          const exp = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!exp));
          sub.hidden = exp;
        });

        li.appendChild(btn); li.appendChild(sub); frag.appendChild(li);
      });

      mobileList.textContent = '';
      mobileList.appendChild(frag);
    }

    // 5) LANGS / CTA / LOGO (jeśli JSON je zawiera)
    if (langsList && Array.isArray(data.langs) && data.langs.length) {
      const frag = document.createDocumentFragment();
      data.langs.forEach(l => {
        const a = document.createElement('a');
        a.href = l.href || `/${l.code||l.lang||''}/`;
        a.textContent = String(l.code||l.lang||'').toUpperCase();
        frag.appendChild(a);
      });
      langsList.textContent = '';
      langsList.appendChild(frag);
    } else if (langsList && data.nav_current && data.nav_current.langs_html) {
      langsList.innerHTML = data.nav_current.langs_html;
    }

    if (ctaBtn && data.cta && data.cta.href) {
      ctaBtn.href = data.cta.href;
      if (data.cta.label) ctaBtn.textContent = data.cta.label;
    }
    if (logoImg && data.logo && data.logo.src) {
      logoImg.src = data.logo.src;
      logoImg.alt = data.logo.alt || logoImg.alt || '';
    }

    // 6) prefetch na hover (łagodne, krótkie)
    function enablePrefetch(container){
      if(!container) return;
      container.addEventListener('pointerenter', e => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || a.origin !== location.origin) return;
        const l = document.createElement('link');
        l.rel = 'prefetch'; l.href = a.href;
        document.head.appendChild(l);
        setTimeout(() => { try{ l.remove(); }catch(_){}} , 6000);
      }, true);
    }
    enablePrefetch(navList);
    enablePrefetch(megaPanels);
  }

  /* -------------------- renderer (HTML → DOM) --------------------
     Jeśli snapshot ma już primary_html/mega_html (np. z GAS),
     to wstrzykujemy bez budowania struktur.                  */
  function renderFromHTML(snap) {
    const cur = snap.nav_current || snap;
    const navList    = $('#navList');
    const megaPanels = $('#megaPanels');
    const langsList  = $('#langsList');
    const ctaBtn     = $('#cta');
    const logoImg    = $('#navLogo');

    if (navList && cur.primary_html)    navList.innerHTML    = cur.primary_html;
    if (megaPanels && cur.mega_html)    megaPanels.innerHTML = cur.mega_html;
    if (langsList && cur.langs_html)    langsList.innerHTML  = cur.langs_html;

    if (ctaBtn && cur.cta && cur.cta.href) {
      ctaBtn.href = cur.cta.href;
      if (cur.cta.label) ctaBtn.textContent = cur.cta.label;
    }
    if (logoImg && cur.logo && cur.logo.src) {
      logoImg.src = cur.logo.src; logoImg.alt = cur.logo.alt || logoImg.alt || '';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const snap = await loadSnapshot();
    if (!snap) return;

    if (Array.isArray(snap.items)) {
      renderFromItems(snap);             // preferowana ścieżka (czyste dane → DOM)
    } else {
      renderFromHTML(snap);              // fallback (wgrany HTML z API)
    }

    // Wyrównanie z JS nagłówka (wysokość panela itp.) obsługuje Twój site.js. :contentReference[oaicite:2]{index=2}
    // Stylom mega/drawer odpowiada Twój site.css.                               :contentReference[oaicite:3]{index=3}
  });
})();
