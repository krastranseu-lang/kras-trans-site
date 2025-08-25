/* Mega-menu SWR-only:
   - NIE renderuje na starcie (korzystamy z SSR)
   - TYLKO sprawdza wersję bundla i w razie zmiany podmienia menu
   - pobiera z /assets/nav/bundle_{lang}.json */
(function(){
  const UL_ID = 'navList';
  const META_NAME = 'menu-bundle-version';
  const PREFIX = '/assets/nav';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function slug(s){return (s||'').normalize('NFKD').replace(/[^\w\s-]/g,'')
    .replace(/\s+/g,'-').replace(/-+/g,'-').toLowerCase();}

  function buildList(list){
    if(!Array.isArray(list)) return '';
    return '<ul>' + list.map(it=>{
      const lbl = esc(it.label||'');
      const href = esc(it.href||'/');
      if(Array.isArray(it.items) && it.items.length){
        return `<li class="has-sub"><button type="button" aria-expanded="false">${lbl}</button>` + buildList(it.items) + '</li>';
      }
      return `<li><a href="${href}">${lbl}</a></li>`;
    }).join('') + '</ul>';
  }

  function buildHTML(bundle){
    if(!bundle || !Array.isArray(bundle.items)) return '';
    return bundle.items
      .sort((a,b)=> (a.order||999)-(b.order||999) || String(a.label).localeCompare(String(b.label)))
      .map(it=>{
        const label = esc(it.label||'');
        const href  = esc(it.href||'/');
        if(Array.isArray(it.cols) && it.cols.length){
          const id = 'mega-' + slug(label);
          const colsHTML = it.cols.map(col=>{
            const title = col.title ? `<h3>${esc(col.title)}</h3>` : '';
            const list = buildList(col.items||[]);
            return `<div class="mega-col">${title}${list}</div>`;
          }).join('');
          return `<li class="has-mega"><button class="mega-toggle" aria-expanded="false" aria-controls="${id}">${label}</button><div id="${id}" class="mega" aria-hidden="true" hidden><div class="mega-grid">${colsHTML}</div></div></li>`;
        }
        return `<li><a href="${href}">${label}</a></li>`;
      }).join('');
  }

  function bindMega(){
    const btns = $$('.mega-toggle');
    function closeAll(){
      btns.forEach(b=>{
        const p = document.getElementById(b.getAttribute('aria-controls'));
        b.setAttribute('aria-expanded','false');
        if(p){ p.hidden=true; p.setAttribute('aria-hidden','true'); }
      });
    }
    btns.forEach((btn,idx)=>{
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if(panel){ panel.hidden=true; panel.setAttribute('aria-hidden','true'); }
      btn.addEventListener('click',e=>{
        const exp = btn.getAttribute('aria-expanded')==='true';
        closeAll();
        if(!exp){
          btn.setAttribute('aria-expanded','true');
          if(panel){
            panel.hidden=false;
            panel.setAttribute('aria-hidden','false');
            const first = panel.querySelector('a,button'); first&&first.focus();
          }
        }
        e.stopPropagation();
      });
      btn.addEventListener('keydown',e=>{
        if(e.key==='Enter' || e.key===' '){ e.preventDefault(); btn.click(); }
        else if(e.key==='ArrowRight'){ e.preventDefault(); btns[(idx+1)%btns.length].focus(); }
        else if(e.key==='ArrowLeft'){ e.preventDefault(); btns[(idx-1+btns.length)%btns.length].focus(); }
        else if(e.key==='Escape'){ closeAll(); btn.focus(); }
      });
      if(panel){
        panel.addEventListener('keydown',e=>{
          const list = Array.from(panel.querySelectorAll('a,button'));
          const i = list.indexOf(document.activeElement);
          if(e.key==='ArrowDown'){ e.preventDefault(); list[(i+1)%list.length].focus(); }
          else if(e.key==='ArrowUp'){ e.preventDefault(); list[(i-1+list.length)%list.length].focus(); }
          else if(e.key==='Escape'){ e.preventDefault(); closeAll(); btn.focus(); }
        });
      }
    });
    document.addEventListener('click',e=>{ if(!e.target.closest('.has-mega')) closeAll(); });
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
    bindMega();
    if ('requestIdleCallback' in window) requestIdleCallback(revalidate);
    else setTimeout(revalidate, 600);
    setInterval(revalidate, 5*60*1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
