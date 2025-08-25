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
            <button type="button" aria-expanded="false" aria-controls="panel-${id}">${label}</button>
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* --- Mega menu toggle binding --- */
(function () {
  if (window.__cmsMegaBound) return;
  window.__cmsMegaBound = true;

  function closeOthers(current, root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('.mega-toggle[aria-expanded="true"]').forEach(btn => {
      if (btn === current) return;
      btn.setAttribute('aria-expanded', 'false');
      const id = btn.getAttribute('aria-controls');
      const panel = root.getElementById ? root.getElementById(id) : document.getElementById(id);
      if (panel) {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function toggleMega(btn, root = document) {
    if (!btn) return;
    const id = btn.getAttribute('aria-controls');
    const panel = root.getElementById ? root.getElementById(id) : document.getElementById(id);
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const next = !expanded;
    closeOthers(btn, root);
    btn.setAttribute('aria-expanded', String(next));
    if (panel) {
      panel.hidden = !next;
      panel.setAttribute('aria-hidden', String(!next));
    }
  }

  function markBtn(btn) {
    if (btn && btn.dataset) btn.dataset.megaBound = '1';
  }

  function bindMegaMenu(root = document) {
    if (!root.__cmsMegaListener) {
      root.addEventListener('click', e => {
        const btn = e.target.closest && e.target.closest('.mega-toggle');
        if (!btn) return;
        toggleMega(btn, root);
      });
      root.__cmsMegaListener = true;
    }

    if (root.querySelectorAll) {
      root.querySelectorAll('.mega-toggle').forEach(markBtn);
    }

    if (typeof MutationObserver === 'function') {
      const target = root === document ? document.body : root;
      if (!target) return;
      const mo = new MutationObserver(muts => {
        muts.forEach(m => {
          m.addedNodes.forEach(node => {
            if (!(node instanceof Element)) return;
            if (node.matches && node.matches('.mega-toggle')) markBtn(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('.mega-toggle').forEach(markBtn);
            }
          });
        });
      });
      mo.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindMegaMenu(document));
  } else {
    bindMegaMenu(document);
  }

  window.CMS = window.CMS || {};
  window.CMS.bindMegaMenu = bindMegaMenu;
})();
