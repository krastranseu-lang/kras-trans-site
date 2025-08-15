(function(){
  const doc = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rIC = window.requestIdleCallback || function(cb){ setTimeout(cb,1); };

  function initTheme(){
    const btn = document.getElementById('theme-toggle');
    if(!btn) return;
    const themes = ['system','dark','light','ebook'];
    let current = localStorage.getItem('kras-theme') || 'system';
    const hint = document.createElement('span');
    hint.className = 'theme-hint';
    hint.hidden = true;
    btn.after(hint);
    function apply(t){
      doc.removeAttribute('data-theme');
      if(t !== 'system') doc.setAttribute('data-theme', t);
      btn.setAttribute('aria-pressed', t !== 'system');
    }
    function showHint(txt){
      if(!txt) return;
      hint.textContent = txt;
      hint.hidden = false;
      requestAnimationFrame(()=>hint.classList.add('show'));
      setTimeout(()=>{hint.classList.remove('show');hint.hidden=true;},3000);
    }
    apply(current);
    btn.addEventListener('click', ()=>{
      current = themes[(themes.indexOf(current)+1)%themes.length];
      localStorage.setItem('kras-theme', current);
      apply(current);
      const hints = (window.KRAS_STRINGS && window.KRAS_STRINGS.theme_hints) || {};
      showHint(hints[current]);
    });
  }

  function gateAnimations(){
    if(reduce) return;
    rIC(()=>doc.classList.remove('no-motion'));
  }

  function initDock(){
    const quote = document.querySelector('.dock-quote');
    const menuBtn = document.getElementById('dock-menu');
    quote && quote.addEventListener('click', e=>{
      const t = document.getElementById('kontakt');
      t && t.scrollIntoView({behavior:'smooth'});
      showHowTo();
    });
    menuBtn && menuBtn.addEventListener('click', openMenu);
  }

  let neon, lastFocus;
  function buildMenu(){
    const nav = neon.querySelector('.neon__nav');
    nav.innerHTML = '';
    const src = document.getElementById('site-nav');
    if(src && src.children.length){
      nav.innerHTML = src.innerHTML;
    }else if(window.KRAS_NAV && window.KRAS_NAV.items){
      const ul = document.createElement('ul');
      window.KRAS_NAV.items.forEach(it=>{
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = it.href;
        a.textContent = it.label;
        li.appendChild(a);
        ul.appendChild(li);
      });
      nav.appendChild(ul);
    }
    const langs = neon.querySelector('.neon__langs');
    if(langs){
      langs.innerHTML = '';
      const langData = (window.KRAS_NAV && window.KRAS_NAV.langs) || [];
      langData.forEach(l=>{
        const a = document.createElement('a');
        a.href = l.href;
        a.innerHTML = `<img src="${l.flag}" alt="" width="16" height="12"> ${l.label}`;
        langs.appendChild(a);
      });
    }
  }
  function trap(e){
    if(e.key === 'Escape'){ closeMenu(); return; }
    if(e.key !== 'Tab') return;
    const focusables = neon.querySelectorAll('a,button');
    if(!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length-1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  function openMenu(){
    if(!neon) return;
    buildMenu();
    neon.hidden = false;
    neon.classList.add('is-open');
    lastFocus = document.activeElement;
    document.addEventListener('keydown', trap);
    const f = neon.querySelector('a,button');
    f && f.focus();
  }
  function closeMenu(){
    if(!neon) return;
    neon.classList.remove('is-open');
    neon.hidden = true;
    document.removeEventListener('keydown', trap);
    lastFocus && lastFocus.focus();
  }
  function initNeonMenu(){
    neon = document.getElementById('neon-menu');
    if(!neon) return;
    neon.addEventListener('click', e=>{ if(e.target === neon) closeMenu(); });
    const closeBtn = neon.querySelector('.neon__close');
    closeBtn && closeBtn.addEventListener('click', closeMenu);
  }

  function offerReveal(){
    const el = document.querySelector('.offer-reveal');
    if(!el) return;
    const io = new IntersectionObserver(([ent])=>{
      if(ent.isIntersecting && ent.intersectionRatio>0.4){
        el.classList.add('is-on');
        io.disconnect();
      }
    },{threshold:0.4});
    io.observe(el);
  }

  function equalizeCards(){
    const sets = document.querySelectorAll('.cards[data-equalize]');
    if(!sets.length) return;
    const ro = new ResizeObserver(entries=>{
      entries.forEach(entry=>{
        const wrap = entry.target;
        if(window.matchMedia('(max-width:599px)').matches){
          wrap.querySelectorAll('.card > .pad').forEach(p=>p.style.minHeight='');
          return;
        }
        const pads = [...wrap.querySelectorAll('.card > .pad')];
        let max=0,min=Infinity;
        pads.forEach(p=>{const h=p.offsetHeight;max=Math.max(max,h);min=Math.min(min,h);});
        if(max-min>8){pads.forEach(p=>p.style.minHeight=max+'px');}
        else{pads.forEach(p=>p.style.minHeight='');}
      });
    });
    sets.forEach(set=>ro.observe(set));
  }

  let hideHowto;
  function showHowTo(){
    const box = document.getElementById('howto');
    if(!box || !box.hidden) return;
    box.hidden = false;
    const steps = box.querySelectorAll('li');
    steps.forEach(li=>li.hidden=true);
    let i=0; function step(){ if(i<steps.length){ steps[i].hidden=false; i++; setTimeout(step,800); } }
    step();
    function close(){ box.hidden=true; document.removeEventListener('keydown', esc); box.removeEventListener('click', close); clearTimeout(hideHowto); }
    function esc(e){ if(e.key==='Escape') close(); }
    document.addEventListener('keydown', esc);
    box.addEventListener('click', close);
    hideHowto = setTimeout(close,6000);
  }
  function initHowTo(){
    const cta = document.querySelector('.hero-cta .btn.primary');
    cta && cta.addEventListener('click', ()=>{ showHowTo(); });
  }

  function lazyBackgrounds(){
    const canvas = document.getElementById('bg-canvas');
    if(!canvas || reduce) return;
    rIC(()=>{
      canvas.hidden = false;
      const ctx = canvas.getContext('2d');
      let w=0,h=0,rafId,last=0;
      function resize(){ w=canvas.width=window.innerWidth; h=canvas.height=window.innerHeight; }
      resize(); window.addEventListener('resize', resize);
      const sticks = Array.from({length:30},()=>({x:Math.random()*w,y:Math.random()*h,l:20+Math.random()*40,vx:(Math.random()-.5)*0.3,vy:(Math.random()-.5)*0.3}));
      function draw(ts){
        if(document.hidden){ rafId=requestAnimationFrame(draw); return; }
        if(ts-last<33){ rafId=requestAnimationFrame(draw); return; }
        last=ts;
        ctx.clearRect(0,0,w,h);
        ctx.strokeStyle='rgba(255,145,64,.15)';
        sticks.forEach(s=>{
          s.x+=s.vx; s.y+=s.vy;
          if(s.x<0||s.x>w) s.vx*=-1;
          if(s.y<0||s.y>h) s.vy*=-1;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x+s.l*s.vx*5, s.y+s.l*s.vy*5);
          ctx.stroke();
        });
        rafId=requestAnimationFrame(draw);
      }
      rafId=requestAnimationFrame(draw);
      document.addEventListener('visibilitychange',()=>{ if(document.hidden) cancelAnimationFrame(rafId); else rafId=requestAnimationFrame(draw); });
    });
  }

  function init(){
    initTheme();
    initDock();
    initNeonMenu();
    offerReveal();
    equalizeCards();
    initHowTo();
    lazyBackgrounds();
    gateAnimations();
    const hero = document.getElementById('hero');
    hero && hero.classList.add('is-ready');
  }

  document.addEventListener('DOMContentLoaded', init);

  window.KRASUI = { openMenu, closeMenu, showHowTo };
})();
