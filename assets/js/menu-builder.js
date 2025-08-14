/* KRAS • Menu Builder PRO (2025)
   - źródła: #site-nav[data-src] → window.KRAS_NAV_SRC → window.KRAS_NAV → fallback z DOM
   - hover desktop / click mobile, klawiatura (Up/Down/Left/Right/Home/End/Esc)
   - focus trap w submenu, zamykanie poza, aktiivna ścieżka, języki (flagi)
   - overflow shadows, lekkie API (window.KRASMenu)
*/

(function () {
  "use strict";

  const state = {
    cfg: null,
    nav: null,
    list: null,
    langs: null,
    isTouch: matchMedia("(hover: none)").matches,
    hoverDelay: 120,
    closeDelay: 160,
    timers: new WeakMap(), // dla hover open/close
  };

  const API = {
    async init() {
      state.nav = document.getElementById("site-nav");
      if (!state.nav) return;

      const cfg = await loadConfig();
      state.cfg = cfg;
      buildNav(cfg);
      attachGlobalHandlers();
      fire("kras:menu:ready", { cfg });
    },
    rebuild(newCfg) {
      state.cfg = newCfg || state.cfg || { items: [], langs: [] };
      buildNav(state.cfg);
      fire("kras:menu:rebuild", { cfg: state.cfg });
    },
    set(newCfg) {
      window.KRAS_NAV = newCfg;
      API.rebuild(newCfg);
    },
    closeAll() {
      closeAll();
    },
  };

  // ------------- Helpers -------------
  function fire(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function norm(url) {
    try {
      return new URL(url, location.origin).pathname.replace(/\/+$/, "") + "/";
    } catch (_) {
      return "/";
    }
  }

  function currentPath() {
    return norm(location.pathname);
  }

  function qsa(sel, ctx = document) {
    return Array.from(ctx.querySelectorAll(sel));
  }

  function setTimer(el, fn, delay) {
    clearTimer(el);
    const id = setTimeout(fn, delay);
    state.timers.set(el, id);
  }

  function clearTimer(el) {
    const id = state.timers.get(el);
    if (id) clearTimeout(id);
    state.timers.delete(el);
  }

  // ------------- Data sources -------------
  async function loadConfig() {
    // 1) data-src na #site-nav
    const srcAttr = state.nav?.dataset?.src;
    if (srcAttr) {
      const cfg = await fetchJSON(srcAttr);
      if (cfg && (cfg.items?.length || cfg.langs?.length)) return cfg;
    }
    // 2) window.KRAS_NAV_SRC (np. z Apps Script) – JSON endpoint
    if (window.KRAS_NAV_SRC) {
      const cfg = await fetchJSON(window.KRAS_NAV_SRC);
      if (cfg && (cfg.items?.length || cfg.langs?.length)) return cfg;
    }
    // 3) window.KRAS_NAV (obiekt wstępnie wstrzyknięty w HTML)
    if (window.KRAS_NAV && (window.KRAS_NAV.items?.length || window.KRAS_NAV.langs?.length)) {
      return window.KRAS_NAV;
    }
    // 4) fallback: parsuj istniejący markup (prosty)
    const fallback = parseExistingMarkup();
    return fallback;
  }

  async function fetchJSON(url) {
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function parseExistingMarkup() {
    const items = [];
    const ul = state.nav.querySelector("ul,ol");
    if (ul) {
      ul.querySelectorAll(":scope > li").forEach((li) => {
        const a = li.querySelector(":scope > a");
        const btn = li.querySelector(":scope > button");
        const entry = { label: "", href: "#", children: null };
        if (a) {
          entry.label = a.textContent.trim();
          entry.href = a.getAttribute("href") || "#";
        } else if (btn) {
          entry.label = btn.textContent.trim();
          entry.href = "#";
        }
        const sub = li.querySelector(":scope > ul, :scope > .sub");
        if (sub) {
          entry.children = [];
          sub.querySelectorAll(":scope > li > a").forEach((aa) => {
            entry.children.push({ label: aa.textContent.trim(), href: aa.getAttribute("href") || "#" });
          });
        }
        if (entry.label) items.push(entry);
      });
    }
    const langs = [];
    qsa(".nav-langs .lang").forEach((a) => {
      langs.push({ code: a.dataset.lang || a.textContent.trim(), label: a.textContent.trim(), href: a.href });
    });
    return { items, langs };
  }

  // ------------- Build -------------
  function buildNav(cfg) {
    const nav = state.nav;
    nav.innerHTML = "";

    // wrapper
    const shell = document.createElement("div");
    shell.className = "nav-shell";
    nav.appendChild(shell);

    // list
    const list = document.createElement("ul");
    list.className = "nav-list";
    list.setAttribute("role", "menubar");
    shell.appendChild(list);
    state.list = list;

    // items
    const path = currentPath();
    for (const it of cfg.items || []) {
      const li = document.createElement("li");
      li.setAttribute("role", "none");

      if (it.children && it.children.length) {
        li.className = "has-sub";
        li.setAttribute("aria-expanded", "false");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-toggle";
        btn.innerHTML = `<span>${it.label}</span>`;
        btn.setAttribute("role", "menuitem");
        btn.setAttribute("aria-haspopup", "true");
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", () => toggleDropdown(li, true));

        if (!state.isTouch) {
          li.addEventListener("mouseenter", () => setTimer(li, () => toggleDropdown(li, true), state.hoverDelay));
          li.addEventListener("mouseleave", () => setTimer(li, () => toggleDropdown(li, false), state.closeDelay));
        }

        const sub = document.createElement("ul");
        sub.className = "sub";
        sub.hidden = true;
        sub.setAttribute("role", "menu");

        for (const ch of it.children) {
          const li2 = document.createElement("li");
          li2.setAttribute("role", "none");
          const a = document.createElement("a");
          a.href = ch.href;
          a.textContent = ch.label;
          a.setAttribute("role", "menuitem");
          if (norm(a.href) === path) a.classList.add("active");
          li2.appendChild(a);
          sub.appendChild(li2);
        }

        li.append(btn, sub);
      } else {
        const a = document.createElement("a");
        a.href = it.href || "#";
        a.textContent = it.label;
        a.setAttribute("role", "menuitem");
        try {
          if (norm(a.href) === path) a.classList.add("active");
        } catch (_) {}
        li.appendChild(a);
      }
      list.appendChild(li);
    }

    // languages
    const langWrap = document.createElement("div");
    langWrap.className = "nav-langs";
    shell.appendChild(langWrap);
    state.langs = langWrap;

    (cfg.langs || []).forEach((lng) => {
      const a = document.createElement("a");
      a.className = "lang";
      a.href = lng.href || "#";
      const code = (lng.code || "").toLowerCase();
      a.setAttribute("data-lang", code);
      a.innerHTML = `<span class="flag" aria-hidden="true"></span><span class="sr-only">${lng.label || code}</span>`;
      // current language mark
      try {
        if (norm(a.href) === path) a.classList.add("active");
      } catch (_) {}
      langWrap.appendChild(a);
    });

    // overflow shadows on nav-list
    attachOverflowShadows(list);
    nav.hidden = false;
  }

  // ------------- Dropdown control -------------
  function closeAll(except) {
    qsa(".has-sub[aria-expanded='true']", state.nav).forEach((li) => {
      if (except && li === except) return;
      li.setAttribute("aria-expanded", "false");
      const sub = li.querySelector(".sub");
      if (sub) sub.hidden = true;
      const btn = li.querySelector(".nav-toggle");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
    document.removeEventListener("click", onOutsideClick, true);
  }

  function toggleDropdown(li, wantToggle) {
    clearTimer(li);
    const open = li.getAttribute("aria-expanded") === "true";
    const willOpen = typeof wantToggle === "boolean" ? wantToggle : !open;

    if (willOpen) {
      closeAll(li);
      li.setAttribute("aria-expanded", "true");
      const sub = li.querySelector(".sub");
      if (sub) sub.hidden = false;
      const btn = li.querySelector(".nav-toggle");
      if (btn) btn.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onOutsideClick, true);
      // focus first link when opened by keyboard
      if (document.activeElement === btn) {
        const first = li.querySelector(".sub a");
        first && first.focus();
      }
    } else {
      li.setAttribute("aria-expanded", "false");
      const sub = li.querySelector(".sub");
      if (sub) sub.hidden = true;
      const btn = li.querySelector(".nav-toggle");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  }

  function onOutsideClick(e) {
    if (!state.nav.contains(e.target)) closeAll();
  }

  // ------------- Keyboard -------------
  function attachGlobalHandlers() {
    // keyboard on menubar + submenus (delegated)
    state.nav.addEventListener("keydown", (e) => {
      const tgt = e.target;
      const topItems = qsa(".nav-list > li > a, .nav-list > li > .nav-toggle", state.nav);
      const idx = topItems.indexOf(tgt);

      // Menubar level
      if (idx > -1) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          (topItems[idx + 1] || topItems[0])?.focus();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          (topItems[idx - 1] || topItems.at(-1))?.focus();
        }
        if (e.key === "Home") {
          e.preventDefault();
          topItems[0]?.focus();
        }
        if (e.key === "End") {
          e.preventDefault();
          topItems.at(-1)?.focus();
        }
        if (e.key === "ArrowDown") {
          // open submenu if present
          const host = tgt.closest(".has-sub");
          if (host) {
            e.preventDefault();
            toggleDropdown(host, true);
            host.querySelector(".sub a")?.focus();
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeAll();
          topItems[0]?.focus();
        }
        return;
      }

      // Inside submenu
      const sub = tgt.closest(".sub");
      if (sub) {
        const items = qsa("a", sub);
        const i = items.indexOf(tgt);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          (items[i + 1] || items[0])?.focus();
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          (items[i - 1] || items.at(-1))?.focus();
        }
        if (e.key === "Home") {
          e.preventDefault();
          items[0]?.focus();
        }
        if (e.key === "End") {
          e.preventDefault();
          items.at(-1)?.focus();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          const host = sub.closest(".has-sub");
          toggleDropdown(host, false);
          host.querySelector(".nav-toggle")?.focus();
        }
      }
    });

    // Rebuild on resize if needed (głównie cienie overflow)
    addEventListener("resize", () => {
      attachOverflowShadows(state.list);
      closeAll();
    });
  }

  // ------------- Overflow shadows -------------
  function attachOverflowShadows(scroller) {
    if (!scroller) return;
    function update() {
      const left = scroller.scrollLeft > 0;
      const right = Math.ceil(scroller.scrollLeft + scroller.clientWidth) < scroller.scrollWidth;
      scroller.classList.toggle("shadow-left", left);
      scroller.classList.toggle("shadow-right", right);
    }
    scroller.addEventListener("scroll", update, { passive: true });
    // po krótkiej chwili (fonts) zaktualizuj
    setTimeout(update, 120);
  }

  // ------------- Kick-off -------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", API.init, { once: true });
  } else {
    API.init();
  }

  window.KRASMenu = API;
})();
