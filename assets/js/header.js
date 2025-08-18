(function () {
  const $ = (sel, ctx=document)=>ctx.querySelector(sel);
  const $$ = (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel));

  const root = document.documentElement;
  const header = $('.kt-header');
  const burger = $('.kt-burger');
  const mobile = $('#kt-mobile');
  const lang = $('.kt-lang');
  const themeBtn = $('#kt-theme');

  // Theme (light/dark/auto)
  const applyTheme = (t)=>{
    if(t==='light') header.setAttribute('data-theme','light');
    else if(t==='dark') header.setAttribute('data-theme','dark');
    else header.setAttribute('data-theme','auto');
  };
  applyTheme(localStorage.getItem('kt-theme')||'auto');
  themeBtn?.addEventListener('click', ()=>{
    const cur = header.getAttribute('data-theme');
    const next = cur==='light' ? 'dark' : (cur==='dark' ? 'auto' : 'light');
    localStorage.setItem('kt-theme', next);
    applyTheme(next);
  });

  // Desktop megamenu: open on hover/focus, close on Esc/blur
  const closeAllMega = ()=> {
    $$('.kt-nav__item.has-mega').forEach(li=>{
      li.querySelector('.kt-nav__link').setAttribute('aria-expanded','false');
      li.querySelector('.kt-mega').style.display='';
    });
  };

  $$('.kt-nav__item.has-mega').forEach(li=>{
    const btn = li.querySelector('.kt-nav__link');
    const panel = li.querySelector('.kt-mega');
    btn.addEventListener('click', (e)=>{
      const expanded = btn.getAttribute('aria-expanded')==='true';
      closeAllMega();
      btn.setAttribute('aria-expanded', String(!expanded));
      panel.style.display = expanded ? '' : 'block';
      e.stopPropagation();
    });
    btn.addEventListener('keydown', (e)=>{
      if(e.key==='Escape'){ closeAllMega(); btn.focus(); }
    });
  });

  document.addEventListener('click', (e)=>{
    if (!e.target.closest('.kt-nav')) closeAllMega();
  });

  // Lang dropdown
  if(lang){
    const btn = lang.querySelector('.kt-lang__btn');
    const list = lang.querySelector('.kt-lang__list');
    if(btn && list){
      btn.addEventListener('click', (e)=>{
        const open = lang.getAttribute('aria-expanded')==='true';
        lang.setAttribute('aria-expanded', String(!open));
        e.stopPropagation();
      });
      document.addEventListener('click', ()=> lang.setAttribute('aria-expanded','false'));
    }
  }

  // Mobile drawer
  const lockScroll = (on)=> {
    if(on){ root.style.overflow='hidden'; }
    else { root.style.overflow=''; }
  };
  burger?.addEventListener('click', ()=>{
    const open = burger.getAttribute('aria-expanded')==='true';
    burger.setAttribute('aria-expanded', String(!open));
    mobile.classList.toggle('is-open', !open);
    mobile.setAttribute('aria-hidden', String(open));
    lockScroll(!open);
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape' && mobile.classList.contains('is-open')){
      burger.click();
    }
  });
  mobile?.addEventListener('click', (e)=>{
    if(e.target===mobile) burger.click();
  });

  // Hide-on-scroll-down, show-on-scroll-up (sticky)
  let lastY = window.scrollY;
  let pinned = true;
  const onScroll = ()=>{
    const y = window.scrollY;
    const goingDown = y > lastY && y > 40;
    if(goingDown && pinned){
      header.style.transform='translateY(-100%)';
      pinned=false;
    } else if(!goingDown && !pinned){
      header.style.transform='';
      pinned=true;
    }
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, {passive:true});

  // Safety: close panels on resize to mobile/desktop
  let w = window.innerWidth;
  window.addEventListener('resize', ()=>{
    if(Math.abs(window.innerWidth - w) < 40) return;
    w = window.innerWidth;
    closeAllMega();
    lang?.setAttribute('aria-expanded','false');
    burger?.setAttribute('aria-expanded','false');
    mobile?.classList.remove('is-open');
    lockScroll(false);
  });
})();
