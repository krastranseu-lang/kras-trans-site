/* Proste menu generowane w JS.
   Zastąp window.MENU_PL własnym drzewem na podstawie menu-builder, jeśli chcesz. */
window.MENU_PL = [
  { label: "Usługi", url: "/pl/uslugi/", children: [
    { label: "Transport międzynarodowy 3,5t", url: "/pl/transport-miedzynarodowy/" },
    { label: "Transport ekspresowy", url: "/pl/transport-ekspresowy/" },
    { label: "Transport ADR 3,5t", url: "/pl/transport-adr/" },
    { label: "Transport paletowy", url: "/pl/transport-paletowy/" }
  ]},
  { label: "Kraje", url: "/pl/kraje/", children: [
    { label: "Niemcy", url: "/pl/transport-do-niemiec/" },
    { label: "Włochy", url: "/pl/transport-do-wloch/" },
    { label: "Francja", url: "/pl/transport-do-francji/" }
  ]},
  { label: "Flota", url: "/pl/flota/" },
  { label: "Blog", url: "/pl/blog/" },
  { label: "O nas", url: "/pl/o-nas/" },
  { label: "Kontakt", url: "/pl/kontakt/" }
];

(function(){
  function el(name, attrs={}, children=[]) {
    const n = document.createElement(name);
    Object.entries(attrs).forEach(([k,v]) => { if(v!=null) n.setAttribute(k,v); });
    children.forEach(c => n.appendChild(typeof c==="string" ? document.createTextNode(c) : c));
    return n;
  }
  function buildMenu(items){
    const ul = el("ul", {class:"menu"});
    items.forEach(item => {
      const li = el("li");
      const a = el("a", {href:item.url}, [item.label]);
      li.appendChild(a);
      if (item.children && item.children.length){
        li.classList.add("has-children");
        const sub = buildMenu(item.children);
        li.appendChild(sub);
      }
      ul.appendChild(li);
    });
    return ul;
  }
  document.addEventListener("DOMContentLoaded", function(){
    const nav = document.querySelector("nav.nav");
    if(!nav) return;
    const menu = buildMenu(window.MENU_PL || []);
    nav.insertBefore(menu, nav.firstChild);
  });
})();
