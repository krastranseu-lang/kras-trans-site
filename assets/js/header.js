(function () {
  const root = document.documentElement;
  /* ===== THEME – cała strona, nie tylko header ===== */
  const THEME_KEY = 'kt_theme';
  const themeBtn = document.getElementById('theme-toggle');

  function applyTheme(t){
    root.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    themeBtn?.setAttribute('aria-pressed', String(t==='dark'));
    window.dispatchEvent(new CustomEvent('themechange', { detail:{ theme:t }}));
  }
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(localStorage.getItem(THEME_KEY) || (prefersDark ? 'dark' : 'light'));
  themeBtn?.addEventListener('click', ()=> {
    const next = root.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  /* ===== MOBILE BURGER ===== */
  const header = document.getElementById('site-header');
  const burger  = header.querySelector('.hamburger');
  const scrim   = header.querySelector('.nav-scrim');
  const menu    = header.querySelector('.menu');

  function openMobile(){
    header.setAttribute('aria-mobile-open','true');
    burger.setAttribute('aria-expanded','true');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeMobile(){
    header.removeAttribute('aria-mobile-open');
    burger.setAttribute('aria-expanded','false');
    scrim.hidden = true;
    document.body.style.overflow = '';
  }
  burger?.addEventListener('click', ()=>{
    (header.getAttribute('aria-mobile-open')==='true')? closeMobile() : openMobile();
  });
  scrim?.addEventListener('click', closeMobile);
  window.addEventListener('resize', ()=>{ if (innerWidth>1100) closeMobile(); });

  /* ===== SUBMENUS – hover intent, nie znikają przy przejściu ===== */
  const items = [...header.querySelectorAll('.menu-item.has-sub')];
  const leaveDelay = 160; // ms
  items.forEach(item=>{
    let closeTO = null;
    const link = item.querySelector('.menu-link');
    const btn  = item.querySelector('.sub-hint');

    const open = ()=>{ clearTimeout(closeTO); item.setAttribute('aria-open','true'); btn?.setAttribute('aria-expanded','true'); };
    const close= ()=>{ closeTO = setTimeout(()=>{ item.removeAttribute('aria-open'); btn?.setAttribute('aria-expanded','false'); }, leaveDelay); };

    // Desktop hover
    item.addEventListener('pointerenter', open);
    item.addEventListener('pointerleave', close);
    // Focus / keyboard
    link.addEventListener('focus', open);
    item.querySelectorAll('a,button').forEach(el=>{
      el.addEventListener('blur', ()=>{ close(); });
    });
    // Click to toggle (mobile + desktop)
    btn?.addEventListener('click', (e)=>{ e.preventDefault(); (item.getAttribute('aria-open')==='true')? close() : open(); });

    // zapobiegaj zamykaniu podczas ruchu na submenu
    const submenu = item.querySelector('.submenu');
    submenu?.addEventListener('pointerenter', ()=>{ clearTimeout(closeTO); });
    submenu?.addEventListener('pointerleave', close);
  });

  /* ===== LANG ===== */
  const lang = header.querySelector('.lang');
  const langBtn = header.querySelector('.lang__btn');
  langBtn?.addEventListener('click', ()=>{
    const open = lang.getAttribute('aria-open')==='true';
    lang.setAttribute('aria-open', String(!open));
    langBtn.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', (e)=>{
    if (!lang.contains(e.target)) {
      lang?.setAttribute('aria-open','false');
      langBtn?.setAttribute('aria-expanded','false');
    }
  });

  /* ===== Sticky shadow / full background ===== */
  const bar = header.querySelector('.kt-header__bar');
  const observer = new IntersectionObserver(([e])=>{
    header.classList.toggle('is-stuck', e.intersectionRatio < 1);
  },{ threshold:[1] });
  observer.observe(header);

  /* ===== Logo launch (opcjonalnie) – powiększ/zmniejsz przy scrollu ===== */
  const brandImg = header.querySelector('.brand img');
  let lastY = scrollY;
  addEventListener('scroll', ()=>{
    const y = Math.max(0, Math.min(1, scrollY/140));
    const h = 52 - (52-42)*y; // 52→42 px
    if (brandImg) brandImg.style.height = `${h}px`;
    lastY = scrollY;
  }, { passive:true });
})();
