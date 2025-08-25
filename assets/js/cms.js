/* Mega-menu SWR-only:
   - NIE renderuje na starcie (używamy SSR z HTML-a)
   - TYLKO sprawdza wersję bundla i w razie zmiany podmienia menu
   - pobiera z /assets/nav/bundle_{lang}.json (fix 404) */
(function(){
  const UL_ID = 'navList';
  const META_NAME = 'menu-bundle-version';
  const PREFIX = '/assets/nav';

  const $ = s => document.querySelector(s);

  function esc(s){return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function slug(s){return (s||'').normalize('NFKD').replace(/[^\w\s-]/g,'')
    .replace(/\s+/g,'-').replace(/-+/g,'-').toLowerCase();}

  function buildHTML(bundle){
    if(!bundle || !Array.isArray(bundle.items)) return '';
    return bundle.items
      .slice()
      .sort((a,b)=> (a.order||999)-(b.order||999) || String(a.label).localeCompare(String(b.label)))
      .map((it,i)=>{
        const label = esc(it.label||'');
        const href  = esc(it.href||'/');
        if(Array.isArray(it.cols) && it.cols.length){
          const id = slug(label) || (`m-${i}`);
          return `<li class="has-mega" data-panel="${id}">
            <button class="mega-toggle" type="button" aria-expanded="false" aria-controls="panel-${id}">${label}</button>
          </li>`;
        } else {
          return `<li><a href="${href}">${label}</a></li>`;
        }
      }).join('');
  }

  function buildPanels(bundle){
    if(!bundle || !Array.isArray(bundle.items)) return '';
    return bundle.items
      .slice()
      .sort((a,b)=> (a.order||999)-(b.order||999) || String(a.label).localeCompare(String(b.label)))
      .filter(it=>Array.isArray(it.cols) && it.cols.length)
      .map((it,i)=>{
        const label = esc(it.label||'');
        const id = slug(label) || (`m-${i}`);
        const colsHTML = it.cols.map(col=>{
          const lis = (col||[]).map(ch=>`<li><a href="${esc(ch.href||'/')}">${esc(ch.label||'')}</a></li>`).join('');
          return `<div><ul>${lis}</ul></div>`;
        }).join('');
        return `<section id="panel-${id}" class="mega__section" data-panel="${id}"><div class="mega__grid">${colsHTML}</div></section>`;
      }).join('');
  }

  function currentVersion(){
    const m = document.querySelector(`meta[name="${META_NAME}"]`);
    return (m && m.getAttribute('content')) || '';
  }
  function setVersion(v){
    let m = document.querySelector(`meta[name="${META_NAME}"]`);
    if (!m){ m = document.createElement('meta'); m.setAttribute('name', META_NAME); document.head.appendChild(m); }
    m.setAttribute('content', v||'');
  }

  async function revalidate(){
    try{
      const lang = (document.documentElement.getAttribute('lang') || 'pl').toLowerCase();
      const url = `${PREFIX}/bundle_${lang}.json`;
      const res = await fetch(url, {cache:'no-store'});
      if (!res.ok){ console.warn('[cms] navigation bundle fetch failed'); return; }
      const data = await res.json();
      if (!data || !data.version || !Array.isArray(data.items) || data.items.length===0){
        console.warn('[cms] navigation data missing');
        return;
      }

      const ul = document.getElementById(UL_ID);
      if (!ul){ console.warn('[cms] nav list element missing'); return; }

      // Podmień tylko gdy SSR jest puste LUB wersja się zmieniła
      if (ul.children.length === 0 || data.version !== currentVersion()){
        const html = buildHTML(data);
        const panels = buildPanels(data);
        ul.innerHTML = html;
        const mob = document.getElementById('mobileList');
        if (mob) mob.innerHTML = html;
        const panelWrap = document.getElementById('megaPanels');
        if (panelWrap) panelWrap.innerHTML = panels;
        if (typeof window.initHeaderSquarespace === 'function') window.initHeaderSquarespace();
        setVersion(data.version);
      }
    }catch(e){ console.warn('[cms] navigation update failed', e); }
  }
  function start(){
    if ('requestIdleCallback' in window) requestIdleCallback(revalidate);
    else setTimeout(revalidate, 600);
    setInterval(revalidate, 5*60*1000);
  }

  function initMega(){
    const mark = btn => { btn.dataset.megaBound = '1'; };

    document.querySelectorAll('button.mega-toggle').forEach(mark);
    new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches('button.mega-toggle')) mark(n);
        n.querySelectorAll && n.querySelectorAll('button.mega-toggle').forEach(mark);
      }));
    }).observe(document, {subtree:true, childList:true});

    // Delegacja na dokumencie: click na button.mega-toggle
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button.mega-toggle');
      if (!btn) return;
      const id = btn.getAttribute('aria-controls');
      const panel = id ? document.getElementById(id) : null;

      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      // (opcjonalnie) zamknij inne megi w tym samym navList:
      const root = btn.closest('#navList') || document;
      root.querySelectorAll('button.mega-toggle[aria-expanded="true"]').forEach(b => {
        if (b === btn) return;
        b.setAttribute('aria-expanded','false');
        const pid = b.getAttribute('aria-controls');
        const p = pid ? document.getElementById(pid) : null;
        if (p) { p.hidden = true; p.setAttribute('aria-hidden','true'); }
      });

      // przełącz bieżący
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (panel) {
        if (isOpen) {
          panel.hidden = true;
          panel.setAttribute('aria-hidden','true');
        } else {
          panel.hidden = false;
          panel.setAttribute('aria-hidden','false');
        }
      }
    });

    // (opcjonalnie) klawiatura: Enter/Space na .mega-toggle
    document.addEventListener('keydown', (e) => {
      if ((e.key !== 'Enter' && e.key !== ' ') ) return;
      const btn = e.target.closest('button.mega-toggle');
      if (!btn) return;
      e.preventDefault();
      btn.click();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMega, { once: true });
  } else {
    initMega();
  }
})();

/* ===== KRAS-TRANS • Mega menu (delegated) ===== */
(function () {
  if (typeof window !== 'undefined' && window.__ktMegaBound) return;
  if (typeof window !== 'undefined') window.__ktMegaBound = true;

  const d = document;
  const $  = (sel, root = d) => root.querySelector(sel);
  const $$ = (sel, root = d) => Array.from(root.querySelectorAll(sel));

  function closeAllExcept(scope, exceptId) {
    $$('.mega-toggle[aria-expanded="true"]', scope).forEach(btn => {
      const id = btn.getAttribute('aria-controls');
      if (id !== exceptId) {
        btn.setAttribute('aria-expanded', 'false');
        const p = id && d.getElementById(id);
        if (p) { p.hidden = true; p.setAttribute('aria-hidden', 'true'); }
      }
    });
  }

  function toggleMega(btn) {
    if (!btn) return;
    const id = btn.getAttribute('aria-controls');
    if (!id) return;
    const panel = d.getElementById(id);
    if (!panel) return;

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      btn.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    } else {
      const scope = btn.closest('ul') || d;
      closeAllExcept(scope, id);
      btn.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
    }
  }

  // Eksport dla testów / debug
  if (typeof window !== 'undefined') {
    window.ktNav = window.ktNav || {};
    window.ktNav.toggleMega = toggleMega;
  }

  // Delegacja klików — działa dla elementów dodanych dynamicznie
  d.addEventListener('click', (e) => {
    const el = e.target.closest('.mega-toggle');
    if (!el) return;

    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (!href || href === '#') e.preventDefault();
    } else {
      e.preventDefault();
    }
    toggleMega(el);
  }, false);

  // Escape zamyka wszystkie otwarte megi
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $$('.mega-toggle[aria-expanded="true"]').forEach(btn => {
      btn.setAttribute('aria-expanded', 'false');
      const id = btn.getAttribute('aria-controls');
      const p  = id && d.getElementById(id);
      if (p) { p.hidden = true; p.setAttribute('aria-hidden', 'true'); }
    });
  });

  // Klik poza nawigacją zamyka
  d.addEventListener('click', (e) => {
    if (e.target.closest('nav, .nav, #main-nav, #navList, .kt-nav')) return;
    $$('.mega-toggle[aria-expanded="true"]').forEach(btn => {
      btn.setAttribute('aria-expanded', 'false');
      const id = btn.getAttribute('aria-controls');
      const p  = id && d.getElementById(id);
      if (p) { p.hidden = true; p.setAttribute('aria-hidden', 'true'); }
    });
  }, false);
})();
