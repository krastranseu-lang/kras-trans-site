/* =========================================================================
   KRAS-TRANS • MENU BUILDER (vanilla JS, ARIA, mobile/desktop)
   -------------------------------------------------------------------------
   Skąd bierze dane (kolejność priorytetu):
   1) window.KRAS_NAV (Array lub {items, langs})
   2) <nav id="site-nav" data-src="/static/nav.json">  (fetch JSON same-origin)
   3) istniejące <ul> w #site-nav (nic nie robi, tylko poprawia ARIA/active)

   Oczekiwany format danych (przykład):
   window.KRAS_NAV = {
     items: [
       { label:"Oferta", href:"/pl/#oferta" },
       { label:"Usługi", href:"/pl/uslugi/", children:[
           { label:"Transport ekspresowy", href:"/pl/transport-ekspresowy/" },
           { label:"Transport paletowy",   href:"/pl/transport-paletowy/" }
       ]},
       { label:"FAQ",     href:"/pl/#faq" },
       { label:"Kontakt", href:"/pl/#kontakt" }
     ],
     langs: [
       { code:"pl", label:"PL", href:"/pl/", flag_src:"/assets/img/flags/pl.svg" },
       { code:"en", label:"EN", href:"/en/", flag_src:"/assets/img/flags/gb.svg" }
     ]
   };

   Cechy:
   • Mobile toggle (hamburger) – aria-controls/expanded, Esc i klik poza zamyka
   • Dropdown (disclosure) dla dzieci – aria-controls/expanded, Esc/outside close
   • Active link (aria-current="page") na podstawie location.pathname
   • Overflow na małych ekranach (poziomy scroll – CSS ogarnia; JS tylko menu)
   • Bezpieczne rel="noopener" dla target=_blank
   • Brak błędów, jeśli nic nie znajdzie – po prostu nic nie robi
   • Zero zależności, 3.5 KB min (~po gzip znacznie mniej)
   ======================================================================== */

(function () {
  "use strict";
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const isSameOrigin = (url) => {
    try { const u = new URL(url, location.href); return u.origin === location.origin; }
    catch { return false; }
  };

  const NAV_ID = "site-nav";

  async function getData(navEl) {
    // 1) Global
    if (window.KRAS_NAV) {
      const raw = window.KRAS_NAV;
      if (Array.isArray(raw)) return { items: raw, langs: [] };
      if (raw && Array.isArray(raw.items)) return { items: raw.items, langs: raw.langs || [] };
    }
    // 2) data-src JSON
    const src = navEl?.dataset?.src || window.KRAS_NAV_URL;
    if (src && isSameOrigin(src)) {
      try {
        const res = await fetch(src, { credentials: "same-origin" });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j)) return { items: j, langs: [] };
          if (j && Array.isArray(j.items)) return { items: j.items, langs: j.langs || [] };
        }
      } catch { /* ignore */ }
    }
    // 3) fallback: istniejący UL → nic nie budujemy (tylko potem ARIA/active)
    return null;
  }

  function sanitizeItem(it) {
    const o = {
      label: (it.label || it.title || "").trim(),
      href:  (it.href  || it.url   || "#").trim(),
      target: (it.target || "").trim(),
      rel:    (it.rel    || "").trim(),
      children: Array.isArray(it.children) ? it.children.map(sanitizeItem) : []
    };
    return o;
  }

  function buildDOM(navEl, data) {
    // jeśli w #site-nav już jest UL z elementami – nie nadpisuj (tylko uzupełnimy później ARIA)
    if (navEl.querySelector("ul")) return;

    const wrapper = document.createDocumentFragment();

    // Toggle (mobile)
    const toggle = document.createElement("button");
    toggle.className = "nav__toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "nav__list");
    toggle.setAttribute("aria-label", "Otwórz menu");
    toggle.innerHTML = `<span class="nav__burger" aria-hidden="true"></span><span class="nav__label">Menu</span>`;
    wrapper.appendChild(toggle);

    // Lista główna
    const ul = document.createElement("ul");
    ul.className = "nav-list";
    ul.id = "nav__list";
    ul.hidden = true;

    (data.items || []).map(sanitizeItem).forEach((it, idx) => {
      const li = document.createElement("li");

      if (it.children && it.children.length) {
        // Disclosure (mega/dropdown – wersja dostępna)
        const btn = document.createElement("button");
        const subId = `nav__sub_${idx}`;
        btn.type = "button";
        btn.className = "nav__btn";
        btn.textContent = it.label || "—";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", subId);
        li.appendChild(btn);

        const sub = document.createElement("ul");
        sub.className = "nav__sub";
        sub.id = subId;
        sub.hidden = true;

        it.children.map(sanitizeItem).forEach((ch) => {
          const sli = document.createElement("li");
          const a = document.createElement("a");
          a.href = ch.href || "#";
          a.textContent = ch.label || "—";
          if (ch.target) a.target = ch.target;
          if (a.target === "_blank") a.rel = (ch.rel || "noopener").includes("noopener") ? ch.rel : (ch.rel ? ch.rel + " noopener" : "noopener");
          sli.appendChild(a);
          sub.appendChild(sli);
        });

        li.appendChild(sub);
      } else {
        // Zwykły link
        const a = document.createElement("a");
        a.href = it.href || "#";
        a.textContent = it.label || "—";
        if (it.target) a.target = it.target;
        if (a.target === "_blank") a.rel = (it.rel || "noopener").includes("noopener") ? it.rel : (it.rel ? it.rel + " noopener" : "noopener");
        li.appendChild(a);
      }
      ul.appendChild(li);
    });

    wrapper.appendChild(ul);

    // Języki (jeśli są)
    if (Array.isArray(data.langs) && data.langs.length) {
      const langs = document.createElement("ul");
      langs.className = "nav-langs";
      langs.setAttribute("aria-label", "Wybór języka");
      data.langs.forEach((lng) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = lng.href || "#";
        a.title = lng.label || lng.code || "";
        if (lng.flag_src) {
          const img = document.createElement("img");
          img.src = lng.flag_src;
          img.alt = lng.code || "";
          img.width = 18; img.height = 12;
          img.loading = "lazy";
          a.appendChild(img);
        } else {
          a.textContent = (lng.label || lng.code || "").toUpperCase();
        }
        // zaznaczenie aktualnego
        try {
          const cur = (document.documentElement.getAttribute("lang") || "pl").toLowerCase();
          if ((lng.code || "").toLowerCase() === cur) {
            a.setAttribute("aria-current", "true");
            a.classList.add("is-current");
          }
        } catch {}
        li.appendChild(a);
        langs.appendChild(li);
      });
      wrapper.appendChild(langs);
    }

    navEl.appendChild(wrapper);
  }

  function enhanceARIA(navEl) {
    // toggle (mobile)
    const toggle = navEl.querySelector(".nav__toggle");
    const list   = navEl.querySelector("#nav__list");

    if (toggle && list) {
      const closeAll = () => {
        list.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        // schowaj sublisty
        $$(".nav__sub", navEl).forEach((s) => (s.hidden = true));
        $$(".nav__btn", navEl).forEach((b) => b.setAttribute("aria-expanded", "false"));
      };
      const open = () => { list.hidden = false; toggle.setAttribute("aria-expanded", "true"); };

      on(toggle, "click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        if (expanded) closeAll();
        else open();
      });

      // klik poza nav zamyka menu
      on(document, "click", (e) => {
        if (!navEl.contains(e.target)) closeAll();
      });
      // Esc zamyka
      on(document, "keydown", (e) => {
        if (e.key === "Escape") closeAll();
      });

      // desktop → zawsze otwarte (bez toggle)
      const media = window.matchMedia("(min-width: 901px)");
      const adapt = () => {
        if (media.matches) {
          list.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
        } else {
          list.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
        }
      };
      adapt();
      on(media, "change", adapt);
    }

    // sub-menu (disclosure)
    $$(".nav__btn", navEl).forEach((btn) => {
      const subId = btn.getAttribute("aria-controls");
      const panel = subId && document.getElementById(subId);
      if (!panel) return;

      const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
      const open  = () => { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); };

      on(btn, "click", () => {
        const ex = btn.getAttribute("aria-expanded") === "true";
        if (ex) close(); else {
          // zamknij inne
          $$(".nav__btn", navEl).forEach((b) => {
            if (b !== btn) {
              const id = b.getAttribute("aria-controls");
              const p = id && document.getElementById(id);
              if (p) { p.hidden = true; b.setAttribute("aria-expanded", "false"); }
            }
          });
          open();
        }
      });

      // klik poza submenu → zamknij (tylko mobile)
      on(document, "click", (e) => {
        if (window.matchMedia("(max-width:900px)").matches) {
          if (!panel.contains(e.target) && e.target !== btn) {
            close();
          }
        }
      });

      // Esc zamyka panel
      on(panel, "keydown", (e) => { if (e.key === "Escape") close(); });
    });
  }

  function markActive(navEl) {
    const cur = location.pathname.replace(/\/+$/, "") || "/";
    $$("a[href]", navEl).forEach((a) => {
      try {
        const href = new URL(a.href, location.origin);
        // dopasowanie: pełne lub prefix (dla sekcji /pl/uslugi/…)
        const path = href.pathname.replace(/\/+$/, "") || "/";
        if (path === cur || (path !== "/" && cur.startsWith(path))) {
          a.setAttribute("aria-current", "page");
          a.classList.add("is-active");
        }
      } catch {}
    });
  }

  function patchBlankRel(navEl) {
    $$('a[target="_blank"]', navEl).forEach((a) => {
      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (!rel.includes("noopener")) rel.push("noopener");
      a.setAttribute("rel", rel.join(" ").trim());
    });
  }

  async function init() {
    const nav = document.getElementById(NAV_ID);
    if (!nav) return;

    const data = await getData(nav);
    if (data) buildDOM(nav, data);
    enhanceARIA(nav);
    markActive(nav);
    patchBlankRel(nav);
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
