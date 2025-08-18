<script>
(function () {
  // ===== Theme toggle (system → light → dark) =====
  const root = document.documentElement;
  const btn  = document.getElementById('themeToggle');
  const KEY  = 'theme';
  function apply(t){
    if (!t || t==='system') {
      root.dataset.theme = 'system';
      localStorage.removeItem(KEY);
    } else {
      root.dataset.theme = t;
      localStorage.setItem(KEY, t);
    }
  }
  apply(localStorage.getItem(KEY)||'system');
  btn && btn.addEventListener('click', () => {
    const cur = localStorage.getItem(KEY) || 'system';
    const nxt = (cur==='system') ? 'light' : (cur==='light' ? 'dark' : 'system');
    apply(nxt);
  });

  // ===== Lang dropdown =====
  const langWrap = document.querySelector('.lang[data-lang]');
  if (langWrap){
    const toggle = langWrap.querySelector('button');
    const panel  = langWrap.querySelector('.lang__panel');
    const closeAll = () => { toggle.setAttribute('aria-expanded','false'); panel.hidden = true; };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
    document.addEventListener('click', (e)=>{
      if(!langWrap.contains(e.target)) closeAll();
    });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeAll(); });
  }

  // ===== Mega menu (hover desktop, click mobile) =====
  const mqDesktop = window.matchMedia('(pointer:fine) and (min-width: 1024px)');
  const header = document.getElementById('header');
  const btns = header?.querySelectorAll('.nav__btn[data-panel]') || [];
  const panels = header?.querySelectorAll('.panel') || [];

  function hideAll(){ panels.forEach(p=>p.hidden=true); btns.forEach(b=>b.setAttribute('aria-expanded','false')); }

  btns.forEach(btn=>{
    const id = btn.getAttribute('data-panel');
    const panel = document.getElementById(id);
    if(!panel) return;

    // Hover (desktop)
    btn.addEventListener('mouseenter', ()=>{ if(mqDesktop.matches){ hideAll(); panel.hidden=false; btn.setAttribute('aria-expanded','true'); }});
    panel.addEventListener('mouseenter', ()=>{ if(mqDesktop.matches){ btn.setAttribute('aria-expanded','true'); panel.hidden=false; }});
    header.addEventListener('mouseleave', ()=>{ if(mqDesktop.matches){ hideAll(); }});

    // Click (mobile & fallback)
    btn.addEventListener('click', (e)=>{
      if(mqDesktop.matches) return; // na desktopie wystarczy hover
      const open = btn.getAttribute('aria-expanded')==='true';
      hideAll();
      if(!open){ panel.hidden=false; btn.setAttribute('aria-expanded','true'); }
    });
  });

  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hideAll(); });
  document.addEventListener('click', (e)=>{
    if(!header.contains(e.target)) hideAll();
  });
})();
</script>
