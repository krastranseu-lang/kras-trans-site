/* Mega-menu SWR-only:
   - NIE renderuje na starcie (używamy SSR z HTML-a)
   - TYLKO sprawdza wersję bundla i w razie zmiany podmienia menu
   - pobiera z /assets/nav/bundle_{lang}.json (fix 404) */
(function(){
  const UL_ID = 'primary-nav-list';
  const META_NAME = 'menu-bundle-version';
  const PREFIX = '/assets/nav';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function esc(s){return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function slug(s){return (s||'').normalize('NFKD').replace(/[^\w\s-]/g,'')
    .replace(/\s+/g,'-').replace(/-+/g,'-').toLowerCase();}

  function buildHTML(bundle){
    if(!bundle || !Array.isArray(bundle.items)) return '';
    return bundle.items
      .sort((a,b)=> (a.order||999)-(b.order||999) || String(a.label).localeCompare(String(b.label)))
      .map(it=>{
        const label = esc(it.label||'');
        const href  = esc(it.href||'/');
        if(Array.isArray(it.cols) && it.cols.length){
          const id = "mega-"+slug(label);
          const colsHTML = it.cols.map(col=>{
            const lis = (col||[]).map(ch=>`<li><a href="${esc(ch.href||'/')}">${esc(ch.label||'')}</a></li>`).join('');
            return `<div class="mega-col"><ul>${lis}</ul></div>`;
          }).join('');
          return `<li class="has-mega">
            <button class="mega-toggle" aria-expanded="false" aria-controls="${id}">${label}</button>
            <div id="${id}" class="mega" role="dialog" aria-label="${label}" aria-modal="false">
              <div class="mega-grid">${colsHTML}</div>
            </div>
          </li>`;
        } else {
          return `<li><a href="${href}">${label}</a></li>`;
        }
      }).join('');
  }

  function bindMega(){
    const btns = $$('.mega-toggle');
    function closeAll(except){ btns.forEach(b=>{ if(b!==except) b.setAttribute('aria-expanded','false'); }); }
    btns.forEach(btn=>{
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const set = v=>btn.setAttribute('aria-expanded', v?'true':'false');
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        const open = btn.getAttribute('aria-expanded') !== 'true';
        closeAll(btn); set(open);
      });
      if (panel) panel.addEventListener('mouseleave', ()=>set(false));
    });
    document.addEventListener('click', ()=>closeAll(null));
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeAll(null); });
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
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.version) return;

      const ul = document.getElementById(UL_ID);
      if (!ul) return;

      // Podmień tylko gdy SSR jest puste LUB wersja się zmieniła
      if (ul.children.length === 0 || data.version !== currentVersion()){
        ul.innerHTML = buildHTML(data);
        bindMega();
        setVersion(data.version);
      }
    }catch(e){}
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
