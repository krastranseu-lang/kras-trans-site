/* SWR dla mega-menu: sprawdza wersję bundle i w razie zmiany podmienia HTML. */
(function(){
  const ul = document.getElementById('primary-nav-list');
  if (!ul) return;

  const lang = (document.documentElement.getAttribute('lang') || 'pl').toLowerCase();
  const versionMeta = document.querySelector('meta[name="menu-bundle-version"]');
  const curVersion = versionMeta ? versionMeta.getAttribute('content') : '';
  const url = `/assets/data/menu/bundle_${lang}.json`;

  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
  function slug(s){return (s||"").normalize('NFKD').replace(/[^\w\s-]/g,'')
    .replace(/\s+/g,'-').replace(/-+/g,'-').toLowerCase();}

  function buildHTML(bundle){
    if(!bundle||!bundle.items) return "";
    return bundle.items.sort((a,b)=> (a.order||999)-(b.order||999) || String(a.label).localeCompare(String(b.label)))
      .map(it=>{
        const label=esc(it.label||"");
        const href=esc(it.href||"/");
        if(Array.isArray(it.cols)&&it.cols.length){
          const id="mega-"+slug(label);
          let colsHTML=it.cols.map(col=>{
            const lis=(col||[]).map(ch=>`<li><a href="${esc(ch.href||'/')}">${esc(ch.label||"")}</a></li>`).join("");
            return `<div class="mega-col"><ul>${lis}</ul></div>`;
          }).join("");
          return `<li class="has-mega">
            <button class="mega-toggle" aria-expanded="false" aria-controls="${id}">${label}</button>
            <div id="${id}" class="mega" role="dialog" aria-label="${label}" aria-modal="false">
              <div class="mega-grid">${colsHTML}</div>
            </div>
          </li>`;
        } else {
          return `<li><a href="${href}">${label}</a></li>`;
        }
      }).join("");
  }

  function bindMegaToggles(){
    const btns = Array.from(document.querySelectorAll('.mega-toggle'));
    function closeAll(exceptBtn){
      btns.forEach(b=>{ if(b!==exceptBtn) b.setAttribute('aria-expanded','false'); });
    }
    btns.forEach(btn=>{
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const setOpen = (v)=>btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const open = btn.getAttribute('aria-expanded') !== 'true';
        closeAll(btn);
        setOpen(open);
      });
      if (panel) panel.addEventListener('mouseleave', ()=>setOpen(false));
    });
    document.addEventListener('click', ()=>closeAll(null));
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeAll(null); });
  }

  async function revalidate(){
    try{
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) return;
      const data = await res.json();
      if (!data || !data.version) return;
      if (data.version !== curVersion) {
        ul.innerHTML = buildHTML(data);
        if (versionMeta) versionMeta.setAttribute('content', data.version);
        bindMegaToggles();
      }
    }catch(e){}
  }

  if ('requestIdleCallback' in window) requestIdleCallback(()=>revalidate());
  else setTimeout(revalidate, 1000);
  setInterval(revalidate, 5*60*1000);
})();
