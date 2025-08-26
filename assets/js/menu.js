(function(){
  function closeAll(exceptId){
    document.querySelectorAll('.mega').forEach(m=>{
      if (!exceptId || m.id !== exceptId){
        m.hidden = true; m.setAttribute('aria-hidden','true');
        const btn = document.querySelector('.mega-toggle[aria-controls="'+m.id+'"]');
        if (btn) btn.setAttribute('aria-expanded','false');
      }
    });
  }

  function init(){
    const nav = document.querySelector('[data-nav]'); if (!nav) return;

    nav.addEventListener('click', (e)=>{
      const btn = e.target.closest('.mega-toggle');
      if(!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('aria-controls');
      const panel = document.getElementById(id);
      const willOpen = panel.hidden;
      closeAll(id);
      panel.hidden = !willOpen;
      panel.setAttribute('aria-hidden', String(!willOpen));
      btn.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) panel.querySelector('a,button,input,select,textarea')?.focus({preventScroll:true});
    });

    document.addEventListener('keydown',(e)=>{
      if(e.key==='Escape'){ closeAll(); document.querySelector('.mega-toggle[aria-expanded="true"]')?.focus(); }
    });

    document.addEventListener('click',(e)=>{
      if (!e.target.closest('.has-mega')) closeAll();
    });

    // Rozpoznaj aktywny język → oznacz aktywną ścieżkę
    try{
      const lang = document.documentElement.lang || 'pl';
      const here = location.pathname.replace(/\/+$/,'');
      document.querySelectorAll('#navList a.toplink').forEach(a=>{
        const p=a.getAttribute('href').replace(/\/+$/,'');
        if (p===here) a.classList.add('active');
      });
    }catch(_){ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else { init(); }
})();
