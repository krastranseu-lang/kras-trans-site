/* =========================================================
   MENU BUILDER — generuje header/footer z JSON
   - bazuje na <html lang="..">
   - wymaga kontenerów: #site-nav i #footer-columns
   ========================================================= */
(function(){
  const DATA = {
    "menu_header":{
      "pl":{"items":[
        {"id":"offer","label":"Oferta","type":"dropdown","items":[
          {"id":"pillar_international","label":"Transport międzynarodowy","url":"/pl/transport-miedzynarodowy/"},
          {"id":"express","label":"Transport ekspresowy","url":"/pl/transport-ekspresowy/"},
          {"id":"adr","label":"Transport ADR","url":"/pl/transport-adr/"},
          {"id":"paletowy","label":"Transport paletowy","url":"/pl/transport-paletowy/"},
          {"id":"cennik","label":"Cennik","url":"/pl/cennik/"}
        ]},
        {"id":"routes","label":"Kierunki","type":"dropdown","items":[
          {"label":"Niemcy","url":"/pl/transport-do-niemiec/"},
          {"label":"Włochy","url":"/pl/transport-do-wloch/"},
          {"label":"Francja","url":"/pl/transport-do-francji/"},
          {"label":"Hiszpania","url":"/pl/transport-do-hiszpanii/"},
          {"label":"Holandia","url":"/pl/transport-do-holandii/"}
        ]},
        {"id":"blog","label":"Blog","url":"/pl/blog/"}
      ]}
    },
    "menu_footer":{
      "pl":{"columns":{
        "Oferta":[
          {"label":"Transport międzynarodowy","url":"/pl/transport-miedzynarodowy/"},
          {"label":"Transport ekspresowy","url":"/pl/transport-ekspresowy/"},
          {"label":"Transport ADR","url":"/pl/transport-adr/"},
          {"label":"Transport paletowy","url":"/pl/transport-paletowy/"},
          {"label":"Cennik","url":"/pl/cennik/"}
        ],
        "Kierunki":{"columns":[[
          {"label":"Francja","url":"/pl/transport-do-francji/"},
          {"label":"Hiszpania","url":"/pl/transport-do-hiszpanii/"},
          {"label":"Holandia","url":"/pl/transport-do-holandii/"},
          {"label":"Niemcy","url":"/pl/transport-do-niemiec/"},
          {"label":"Włochy","url":"/pl/transport-do-wloch/"}
        ]]}
      }}
    }
  };

  function h(tag,attrs={},children=[]){
    const el=document.createElement(tag);
    Object.entries(attrs||{}).forEach(([k,v])=>{
      if(v===null||v===undefined) return;
      if(k==='class') el.className=v; else if(k==='html') el.innerHTML=v; else el.setAttribute(k,v);
    });
    (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=> el.appendChild(typeof c==='string'?document.createTextNode(c):c));
    return el;
  }
  function buildHeader(lang){
    const nav=document.getElementById('site-nav'); if(!nav) return;
    const conf=(DATA.menu_header[lang]||DATA.menu_header.pl);
    conf.items.forEach(item=>{
      if(item.type==='dropdown'){
        const btn=h('button',{class:'btn', 'aria-expanded':'false','aria-haspopup':'true'} , item.label);
        const panel=h('div',{class:'dropdown', hidden:''},
          h('ul',{}, item.items.map(it=> h('li',{}, h('a',{href:it.url}, it.label)))) );
        const wrap=h('div',{class:'dropdown-wrap'},[btn,panel]);
        btn.addEventListener('click',()=>{
          const open=btn.getAttribute('aria-expanded')==='true';
          btn.setAttribute('aria-expanded', !open); panel.hidden=open;
        });
        nav.appendChild(wrap);
      }else{
        nav.appendChild(h('a',{href:item.url||'#'}, item.label));
      }
    });
  }
  function buildFooter(lang){
    const host=document.getElementById('footer-columns'); if(!host) return;
    const conf=(DATA.menu_footer[lang]||DATA.menu_footer.pl).columns;
    Object.keys(conf).forEach(col=>{
      const colEl=h('div',{class:'foot-col'}, [h('strong',{}, col)]);
      const list = Array.isArray(conf[col]) ? conf[col] : (conf[col].columns||[]).flat();
      list.forEach(it=> colEl.appendChild(h('a',{href:it.url}, it.label)));
      host.appendChild(colEl);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const lang=document.documentElement.lang||'pl';
    buildHeader(lang); buildFooter(lang);
  });
})();
