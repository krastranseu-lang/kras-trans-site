/* KRAS • Menu Builder (2025) */
(function(){
  const nav = document.getElementById('site-nav');
  if(!nav) return;

  const cfg = window.KRAS_NAV || {items:[], langs:[]};
  const items = cfg.items || [];
  const langs = cfg.langs || [];

  // --- Szkielet
  const list = document.createElement('ul');
  list.className = 'nav-list';
  const langWrap = document.createElement('div');
  langWrap.className = 'nav-langs';

  // --- Helpery
  const isTouch = matchMedia('(hover: none)').matches;
  const norm = url => new URL(url, location.origin).pathname.replace(/\/+$/,'') + '/';
  const curPath = norm(location.pathname);
  const closeAll = () => nav.querySelectorAll('.has-sub[aria-expanded="true"]').forEach(x => toggle(x,false));
  const onOutside = e => { if(!nav.contains(e.target)) closeAll(); };
  const toggle = (li, open) => {
    li.setAttribute('aria-expanded', String(open));
    const sub = li.querySelector('.sub'); if(sub) sub.hidden = !open;
    if(open){ document.addEventListener('click', onOutside, {once:true}); }
  };

  // --- Budowa pozycji
  for(const it of items){
    const li = document.createElement('li');
    if(it.children && it.children.length){
      li.className = 'has-sub'; li.setAttribute('aria-expanded','false');
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'nav-toggle';
      btn.innerHTML = `<span>${it.label}</span>`;
      btn.setAttribute('aria-haspopup','true'); btn.setAttribute('aria-expanded','false');
      btn.addEventListener('click', () => {
        const open = li.getAttribute('aria-expanded') !== 'true';
        closeAll(); toggle(li, open);
      });
      // Hover na desktopie
      if(!isTouch){
        li.addEventListener('mouseenter', ()=>toggle(li,true));
        li.addEventListener('mouseleave', ()=>toggle(li,false));
      }
      const sub = document.createElement('ul'); sub.className = 'sub'; sub.hidden = true;
      for(const ch of it.children){
        const a = document.createElement('a'); a.href = ch.href; a.textContent = ch.label;
        const li2 = document.createElement('li'); li2.appendChild(a); sub.appendChild(li2);
        // aktywna pozycja
        try{ if(norm(a.href) === curPath) a.classList.add('active'); }catch(_){}
      }
      li.append(btn, sub);
    }else{
      const a = document.createElement('a'); a.href = it.href; a.textContent = it.label;
      try{ if(norm(a.href) === curPath) a.classList.add('active'); }catch(_){}
      li.appendChild(a);
    }
    list.appendChild(li);
  }

  // --- Języki (flagi)
  for(const lng of langs){
    const a = document.createElement('a');
    a.className = 'lang'; a.href = lng.href; a.setAttribute('data-lang', (lng.code||'').toLowerCase());
    a.innerHTML = `<span class="flag" aria-hidden="true"></span><span class="sr-only">${lng.label||lng.code}</span>`;
    langWrap.appendChild(a);
  }

  // --- Wstaw i pokaż
  nav.append(list, langWrap);
  nav.hidden = false;

  // --- Klawiatura w dropdownach
  nav.addEventListener('keydown', (e)=>{
    const host = e.target.closest('.has-sub'); if(!host) return;
    const items = [...host.querySelectorAll('.sub a')];
    const i = items.indexOf(e.target);
    if(e.key === 'ArrowDown'){ e.preventDefault(); (items[i+1]||items[0])?.focus(); }
    if(e.key === 'ArrowUp'){ e.preventDefault(); (items[i-1]||items.at(-1))?.focus(); }
    if(e.key === 'Escape'){ toggle(host,false); host.querySelector('.nav-toggle')?.focus(); }
  });

  // Bezpiecznik przy zmianie rozmiaru
  addEventListener('resize', ()=>closeAll());
})();
