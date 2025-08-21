/* KRAS-TRANS • cms.js (NAV static-first + SWR)
   - Ładuje snapshot: /assets/nav/bundle_<lang>.json (fallback: /assets/nav/<lang>.json)
   - Jeśli snapshot ma items[] => buduje pasek + mega z danych
   - Jeśli snapshot ma tylko primary_html/mega_html => wstrzykuje i
     skraca pasek (usuwa duplikaty linków-dzieci – zostają rodzice + single)
   - Prefetch on hover, brak bibliotek
*/
(function () {
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const LANG = (()=>{
    const htmlLang = (document.documentElement.getAttribute('lang')||'').slice(0,2);
    const m = location.pathname.match(/^\/([a-z]{2})\b/i);
    return (m && m[1]) || htmlLang || 'pl';
  })();

  const STATIC_URLS = [
    `/assets/nav/bundle_${LANG}.json`,
    `/assets/nav/${LANG}.json`
  ];

  async function loadSnapshot() {
    for (const base of STATIC_URLS) {
      try {
        const res = await fetch(base + `?ts=${Date.now()}`, {cache:'no-store'});
        if (!res.ok) continue;
        const j = await res.json();
        if (j && (Array.isArray(j.items) || j.primary_html || (j.nav_current && j.nav_current.primary_html))) {
          return j;
        }
      } catch(_){}
    }
    return null;
  }

  function slugify(s){ return String(s||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

  /* ---------- render na podstawie items[] ---------- */
  function renderFromItems(data){
    const items = Array.isArray(data.items) ? data.items : [];
    const navList = $('#navList'), megaPanels = $('#megaPanels'), mobileList = $('#mobileList');
    if(!navList || !megaPanels || !mobileList) return;

    // grupowanie i deduplikacja
    const seen = new Set();
    const parents = new Map(); // parent -> [ {label,href} ]
    let singles = [];
    items.forEach(r=>{
      const label = String(r.label||'').trim();
      const href  = String(r.href||'').trim();
      const parent= String(r.parent||'').trim();
      if(!label || !href || href==='#') return;
      const key = `${label}|${href}|${parent}`;
      if(seen.has(key)) return; seen.add(key);
      if(parent){
        if(!parents.has(parent)) parents.set(parent, []);
        parents.get(parent).push({label,href});
      }else singles.push({label,href});
    });

    const parentLC = new Set([...parents.keys()].map(p=>p.toLowerCase()));
    singles = singles.filter(s => !parentLC.has((s.label||'').toLowerCase()));

    // pasek: single + rodzice (data-panel)
    const frag = document.createDocumentFragment();
    singles.forEach(it=>{
      const li=document.createElement('li'), a=document.createElement('a');
      a.href=it.href; a.textContent=it.label; li.appendChild(a); frag.appendChild(li);
    });
    [...parents.keys()].forEach(parent=>{
      const li=document.createElement('li'); li.setAttribute('data-panel', slugify(parent));
      const a=document.createElement('a');
      const root = items.find(x=> String(x.label||'').trim().toLowerCase()===parent.toLowerCase() && !x.parent);
      a.href = root ? String(root.href||'#') : `/${LANG}/${slugify(parent)}/`;
      a.textContent = parent; li.appendChild(a); frag.appendChild(li);
    });
    navList.textContent=''; navList.appendChild(frag);

    // mega
    const megaFrag = document.createDocumentFragment();
    [...parents.keys()].forEach(parent=>{
      const sec=document.createElement('section'); sec.className='mega__section'; sec.setAttribute('data-panel', slugify(parent));
      const grid=document.createElement('div'); grid.className='mega__grid';
      (parents.get(parent)||[]).forEach(it=>{
        const card=document.createElement('div'); card.className='card';
        const a=document.createElement('a'); a.href=it.href; a.textContent=it.label;
        card.appendChild(a); grid.appendChild(card);
      });
      sec.appendChild(grid); megaFrag.appendChild(sec);
    });
    megaPanels.textContent=''; megaPanels.appendChild(megaFrag);

    // mobile
    const mFrag = document.createDocumentFragment();
    singles.forEach(it=>{
      const li=document.createElement('li'), a=document.createElement('a'); a.href=it.href; a.textContent=it.label;
      li.appendChild(a); mFrag.appendChild(li);
    });
    [...parents.keys()].forEach(parent=>{
      const li=document.createElement('li'), btn=document.createElement('button');
      btn.type='button'; btn.textContent=parent; btn.setAttribute('aria-expanded','false');
      const sub=document.createElement('ul'); sub.hidden=true; sub.className='mobile-sub';
      (parents.get(parent)||[]).forEach(it=>{
        const sli=document.createElement('li'), a=document.createElement('a'); a.href=it.href; a.textContent=it.label;
        sli.appendChild(a); sub.appendChild(sli);
      });
      btn.addEventListener('click',()=>{ const exp=btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded',String(!exp)); sub.hidden=exp; });
      li.appendChild(btn); li.appendChild(sub); mFrag.appendChild(li);
    });
    mobileList.textContent=''; mobileList.appendChild(mFrag);

    enablePrefetch(navList); enablePrefetch(megaPanels);
  }

  /* ---------- render na podstawie HTML w snapshot ---------- */
  function renderFromHTML(snap){
    const cur = snap.nav_current || snap;
    const navList = $('#navList'), megaPanels=$('#megaPanels'), mobileList=$('#mobileList');

    if(navList && cur.primary_html){ navList.innerHTML = cur.primary_html; }
    if(megaPanels && cur.mega_html){ megaPanels.innerHTML = cur.mega_html; }

    // NEW: skróć pasek – usuń duplikaty dzieci (zostają rodzice + single)
    try{
      if(navList && megaPanels){
        const childHrefs = new Set(
          Array.from(megaPanels.querySelectorAll('.mega__section a[href]'))
               .map(a=>a.getAttribute('href')).filter(Boolean)
        );
        Array.from(navList.children).forEach(li=>{
          const isParent = li.hasAttribute('data-panel');
          const a = li.querySelector('a[href]'); const href=a && a.getAttribute('href');
          const isChildDupe = (!isParent && href && childHrefs.has(href));
          if(isChildDupe) li.remove();
        });
        // mobile = kopia skróconego paska
        if(mobileList){ mobileList.innerHTML = navList.innerHTML; }
      }
    }catch(_){}

    enablePrefetch(navList); enablePrefetch(megaPanels);
  }

  function enablePrefetch(container){
    if(!container) return;
    container.addEventListener('pointerenter', e=>{
      const a = e.target.closest && e.target.closest('a[href]');
      if(!a || a.origin !== location.origin) return;
      const l=document.createElement('link'); l.rel='prefetch'; l.href=a.href; document.head.appendChild(l);
      setTimeout(()=>{ try{ l.remove(); }catch(_){ } }, 6000);
    }, true);
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const snap = await loadSnapshot();
    if(!snap) return;
    if(Array.isArray(snap.items)) renderFromItems(snap);
    else                          renderFromHTML(snap);
  });
})();
