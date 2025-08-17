(function(){
  'use strict';

  // --------- Data fetch ---------
  async function loadCMS(){
    if(window.CMS_DATA && window.CMS_DATA.nav){
      return window.CMS_DATA;
    }
    try{
      const res = await fetch('/data/cms.json', {credentials:'omit'});
      if(res.ok) return await res.json();
    }catch(err){
      console.warn('CMS fetch fail', err);
    }
    return {nav:[], strings:[], hreflang:{}};
  }

  function slugify(str){
    return str.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  }

  function samePath(href){
    try{
      const u=new URL(href, location.origin);
      return u.pathname.replace(/\/+$/,'/')===location.pathname.replace(/\/+$/,'/');
    }catch(_){ return false; }
  }

  function build(data){
    const siteNav=document.getElementById('site-nav');
    const megaRoot=document.getElementById('mega-root');
    const neon=document.getElementById('neon-menu');
    if(!siteNav) return;

    const total=(data.nav||[]).length;
    console.debug('[menu] nav rows:', total);

    const lang=(window.CMS_PAGE&&window.CMS_PAGE.lang)||document.documentElement.lang||'pl';
    const slugKey=(window.CMS_PAGE&&window.CMS_PAGE.slugKey)||'';
    const navItems=(data.nav||[]).filter(it=>it.lang===lang && it.enabled!=='FALSE' && it.href && !/^#/.test(it.href) && it.href!=='/#/');
    console.debug('[menu] nav items for', lang+':', navItems.length);
    navItems.sort((a,b)=>(+a.order||0)-(+b.order||0));
    if(!total || !navItems.length){
      console.warn('[menu] nav empty – using fallback menu');
      const ul=document.createElement('ul');
      ul.className='nav__list';
      [
        {href:'/',label:'Home'},
        {href:'/pl/',label:'PL'},
        {href:'/pl/kontakt/',label:'Kontakt'}
      ].forEach(it=>{
        const li=document.createElement('li');
        const a=document.createElement('a');
        a.href=it.href;
        a.textContent=it.label;
        li.appendChild(a);
        ul.appendChild(li);
      });
      siteNav.innerHTML='';
      siteNav.appendChild(ul);
      siteNav.hidden=false;
      return;
    }

    const groups={};
    navItems.forEach(it=>{ if(it.parent){ const p=it.parent.trim(); (groups[p]=groups[p]||[]).push(it); } });
    const top=navItems.filter(it=>!it.parent);

    // ---- topbar ----
    const ul=document.createElement('ul');
    ul.className='nav__list';
    top.forEach((item,i)=>{
      const key=slugify(item.label||('grp'+i));
      const li=document.createElement('li');
      if(groups[item.label]) li.classList.add('has-panel');
      let el;
      if(groups[item.label]){
        el=document.createElement('button');
        el.type='button';
        el.className='nav__btn';
        el.dataset.panel=key;
        el.setAttribute('aria-haspopup','true');
        el.setAttribute('aria-expanded','false');
        el.addEventListener('click', ()=>togglePanel(key));
        el.addEventListener('mouseenter',()=>togglePanel(key,true));
      }else{
        el=document.createElement('a');
        el.href=item.href;
        if(samePath(item.href)) el.setAttribute('aria-current','page');
      }
      el.textContent=item.label;
      li.appendChild(el);
      ul.appendChild(li);
    });
    siteNav.innerHTML='';
    siteNav.appendChild(ul);
    siteNav.hidden=false;

    // ---- mega panels ----
    megaRoot.innerHTML='';
    Object.entries(groups).forEach(([name, items])=>{
      const key=slugify(name);
      const panel=document.createElement('div');
      panel.className='panel';
      panel.dataset.panel=key;
      panel.hidden=true;
      const grid=document.createElement('div');
      grid.className='panel__grid';
      items.sort((a,b)=>(+a.order||0)-(+b.order||0)).forEach(ch=>{
        const a=document.createElement('a');
        a.href=ch.href;
        a.textContent=ch.label;
        grid.appendChild(a);
      });
      panel.appendChild(grid);
      megaRoot.appendChild(panel);
    });

    // ---- neon menu ----
    if(neon){
      const dock=document.getElementById('dock-menu');
      const closeBtn=neon.querySelector('.neon__close');
      const navEl=neon.querySelector('.neon__nav');
      const langsEl=neon.querySelector('.neon__langs');
      navEl.innerHTML='';
      const list=document.createElement('ul');
      top.forEach((item,i)=>{
        const li=document.createElement('li');
        const a=document.createElement('a');
        a.href=item.href;
        a.textContent=item.label;
        li.appendChild(a);
        if(groups[item.label]){
          const sub=document.createElement('ul');
          groups[item.label].forEach(ch=>{
            const si=document.createElement('li');
            const sa=document.createElement('a');
            sa.href=ch.href; sa.textContent=ch.label; si.appendChild(sa); sub.appendChild(si);
          });
          li.appendChild(sub);
        }
        list.appendChild(li);
      });
      navEl.appendChild(list);

      // languages
      langsEl.innerHTML='';
      const langs=(data.hreflang||{})[slugKey]||{};
      Object.entries(langs).forEach(([L,href])=>{
        const a=document.createElement('a');
        a.href=href;
        a.lang=L==='ua'?'uk':L;
        a.textContent=a.lang;
        langsEl.appendChild(a);
      });

      let lastFocus=null;
      function trapTab(e){
        if(e.key!=='Tab') return;
        const f=neon.querySelectorAll('a,button');
        if(!f.length) return;
        const first=f[0], last=f[f.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
      function openNeon(){
        lastFocus=document.activeElement;
        neon.classList.add('is-open');
        neon.hidden=false;
        document.addEventListener('keydown',trapTab);
        neon.addEventListener('keydown',neonEsc);
        navEl.querySelector('a,button')?.focus();
      }
      function closeNeon(){
        neon.classList.remove('is-open');
        neon.hidden=true;
        document.removeEventListener('keydown',trapTab);
        neon.removeEventListener('keydown',neonEsc);
        lastFocus?.focus();
      }
      function neonEsc(e){ if(e.key==='Escape') closeNeon(); }
      dock?.addEventListener('click',openNeon);
      closeBtn?.addEventListener('click',closeNeon);
      neon.addEventListener('click',e=>{ if(e.target===neon) closeNeon(); });
    }

    // ---- panel interactions ----
    const header=document.querySelector('.site-header');
    let open=null;
    function togglePanel(key,fromHover=false){
      const panel=megaRoot.querySelector(`.panel[data-panel="${key}"]`);
      const btn=siteNav.querySelector(`.nav__btn[data-panel="${key}"]`);
      if(open && open.panel!==panel){ closePanel(); }
      if(panel && (open?.panel!==panel || fromHover)){
        const willOpen=panel.hidden;
        closePanel();
        if(willOpen){
          panel.hidden=false; panel.classList.add('is-open');
          btn.setAttribute('aria-expanded','true');
          open={panel,btn};
          if(document.activeElement===btn) panel.querySelector('a')?.focus();
        }
      }else{
        closePanel();
      }
    }
    function closePanel(){
      if(!open) return;
      open.panel.hidden=true;
      open.panel.classList.remove('is-open');
      open.btn.setAttribute('aria-expanded','false');
      open=null;
    }
    header?.addEventListener('mouseleave', closePanel);
    document.addEventListener('click',e=>{ if(open && !header.contains(e.target)) closePanel(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closePanel(); });

    // keyboard nav for top level
    siteNav.addEventListener('keydown',e=>{
      const items=[...siteNav.querySelectorAll('.nav__list > li > .nav__btn, .nav__list > li > a')];
      const i=items.indexOf(document.activeElement);
      if(i>-1){
        if(e.key==='ArrowRight'){ e.preventDefault(); (items[i+1]||items[0]).focus(); }
        if(e.key==='ArrowLeft'){ e.preventDefault(); (items[i-1]||items.at(-1)).focus(); }
        if(e.key==='ArrowDown' && document.activeElement.classList.contains('nav__btn')){ e.preventDefault(); togglePanel(document.activeElement.dataset.panel); }
        if(e.key==='Escape'){ e.preventDefault(); closePanel(); items[0].focus(); }
      }
    });
  }

  loadCMS().then(build);
})();
