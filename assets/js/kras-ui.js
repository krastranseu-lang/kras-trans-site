(function(){
  const doc = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Theme */
  const themeBtn = document.getElementById('theme-toggle');
  const themes = ['system','dark','light','ebook'];
  let current = localStorage.getItem('kras-theme') || 'system';
  const hint = document.createElement('div');
  hint.className = 'theme-hint';
  hint.hidden = true;
  themeBtn && themeBtn.after(hint);

  function applyTheme(t){
    doc.removeAttribute('data-theme');
    if(t !== 'system') doc.setAttribute('data-theme', t);
    themeBtn && themeBtn.setAttribute('aria-pressed', t !== 'system');
  }
  applyTheme(current);

  function recommend(){
    const h = new Date().getHours();
    if(h >= 20 || h < 6) return "{{ strings.theme_hint_dark }}";
    if(current === 'ebook') return "{{ strings.theme_hint_ebook }}";
    return "{{ strings.theme_hint_light }}";
  }
  function showHint(){
    hint.textContent = recommend();
    hint.hidden = false;
    hint.classList.add('show');
    setTimeout(()=>{hint.classList.remove('show');hint.hidden=true;},3000);
  }
  themeBtn && themeBtn.addEventListener('click', ()=>{
    let i = (themes.indexOf(current)+1) % themes.length;
    current = themes[i];
    localStorage.setItem('kras-theme', current);
    applyTheme(current);
    showHint();
  });

  /* How it works bubble */
  const howto = document.querySelector('.howto');
  function showHowTo(){
    if(!howto) return;
    const items = howto.querySelectorAll('li');
    howto.hidden = false;
    items.forEach(li=>li.hidden=true);
    if(reduce){ items.forEach(li=>li.hidden=false); return; }
    let i=0; const step=()=>{ if(i<items.length){ items[i].hidden=false; i++; setTimeout(step,800); } };
    step();
  }

  /* Bottom dock */
  const dockCTA = document.querySelector('.bottom-dock .cta');
  const dockMenu = document.querySelector('.bottom-dock .menu');
  dockCTA && dockCTA.addEventListener('click', e=>{
    const t = document.getElementById('kontakt');
    t && t.scrollIntoView({behavior:'smooth'});
    showHowTo();
  });
  dockMenu && dockMenu.addEventListener('click', ()=>{ openMenu(); });

  /* Neon menu */
  const neon = document.getElementById('neon-menu');
  const neonNav = neon ? neon.querySelector('.neon-nav') : null;
  const closeBtn = neon ? neon.querySelector('.neon-close') : null;
  let lastFocus = null;

  function buildMenu(){
    if(!neonNav) return;
    const src = document.getElementById('site-nav');
    if(src && src.children.length){
      neonNav.innerHTML = src.innerHTML;
    } else if(window.KRAS_NAV){
      neonNav.innerHTML = '';
      const ul = document.createElement('ul');
      (window.KRAS_NAV.items||[]).forEach(it=>{
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = it.href;
        a.textContent = it.label;
        li.appendChild(a);
        ul.appendChild(li);
      });
      neonNav.appendChild(ul);
    }
  }

  function openMenu(){
    if(!neon) return;
    buildMenu();
    neon.hidden = false;
    neon.classList.add('is-open');
    lastFocus = document.activeElement;
    doc.addEventListener('keydown', trap);
    const f = neon.querySelector('a,button');
    f && f.focus();
  }

  function closeMenu(){
    if(!neon) return;
    neon.classList.remove('is-open');
    neon.hidden = true;
    doc.removeEventListener('keydown', trap);
    lastFocus && lastFocus.focus();
  }

  function trap(e){
    if(e.key === 'Escape') closeMenu();
  }

  neon && neon.addEventListener('click', e=>{ if(e.target === neon) closeMenu(); });
  closeBtn && closeBtn.addEventListener('click', closeMenu);

  /* Offer reveal */
  const offer = document.querySelector('.offer-reveal');
  if(offer){
    const io = new IntersectionObserver(entries=>{
      const ent = entries[0];
      if(ent.isIntersecting && ent.intersectionRatio > 0.4){
        offer.classList.add('is-on');
        io.disconnect();
      }
    },{threshold:0.4});
    io.observe(offer);
  }

  /* Equalize cards */
  function equalize(){
    document.querySelectorAll('.cards[data-equalize]').forEach(set=>{
      const rows = {};
      set.querySelectorAll('.card').forEach(card=>{
        const top = card.offsetTop;
        const pad = card.querySelector('.pad');
        if(!pad) return;
        rows[top] = Math.max(rows[top]||0, pad.offsetHeight);
      });
      set.querySelectorAll('.card').forEach(card=>{
        const top = card.offsetTop;
        const pad = card.querySelector('.pad');
        pad.style.minHeight = rows[top] + 'px';
      });
    });
  }
  const ro = new ResizeObserver(equalize);
  document.querySelectorAll('.cards[data-equalize]').forEach(el=>ro.observe(el));

  window.KRASUI = { openMenu, closeMenu, showHowTo };
})();
