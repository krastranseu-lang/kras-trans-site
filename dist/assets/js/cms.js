/**
 * Mega-menu SWR-only:
 *    - NIE renderuje na starcie (używamy SSR z HTML-a)
 *    - TYLKO sprawdza wersję bundla i w razie zmiany podmienia menu
 *    - pobiera z /assets/data/menu/bundle_{lang}.json
 *
 * @format
 */

(function () {
  const UL_ID = "navList";
  const META_NAME = "menu-bundle-version";
  const PREFIX = "/assets/data/menu";

  const $ = (s) => document.querySelector(s);

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function slug(s) {
    return (s || "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  function buildHTML(bundle) {
    if (!bundle || !Array.isArray(bundle.items)) return "";
    return bundle.items
      .slice()
      .sort(
        (a, b) =>
          (a.order || 999) - (b.order || 999) ||
          String(a.label).localeCompare(String(b.label))
      )
      .map((it, i) => {
        const label = esc(it.label || "");
        const href = esc(it.href || "/");
        if (Array.isArray(it.cols) && it.cols.length) {
          const id = slug(label) || `m-${i}`;
          return `<li class="has-mega" data-panel="${id}">
            <button type="button" class="mega-toggle" aria-expanded="false" aria-controls="panel-${id}">${label}</button>
          </li>`;
        } else {
          return `<li><a href="${href}">${label}</a></li>`;
        }
      })
      .join("");
  }

  function buildPanels(bundle) {
    if (!bundle || !Array.isArray(bundle.items)) return "";
    return bundle.items
      .slice()
      .sort(
        (a, b) =>
          (a.order || 999) - (b.order || 999) ||
          String(a.label).localeCompare(String(b.label))
      )
      .filter((it) => Array.isArray(it.cols) && it.cols.length)
      .map((it, i) => {
        const label = esc(it.label || "");
        const id = slug(label) || `m-${i}`;
        const colsHTML = it.cols
          .map((col) => {
            const lis = (col || [])
              .map(
                (ch) =>
                  `<li><a href="${esc(ch.href || "/")}">${esc(
                    ch.label || ""
                  )}</a></li>`
              )
              .join("");
            return `<div><ul>${lis}</ul></div>`;
          })
          .join("");
        return `<section id="panel-${id}" class="mega mega__section" data-panel="${id}" hidden aria-hidden="true"><div class="mega__grid">${colsHTML}</div></section>`;
      })
      .join("");
  }

  function currentVersion() {
    const m = document.querySelector(`meta[name="${META_NAME}"]`);
    return (m && m.getAttribute("content")) || "";
  }
  function setVersion(v) {
    let m = document.querySelector(`meta[name="${META_NAME}"]`);
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", META_NAME);
      document.head.appendChild(m);
    }
    m.setAttribute("content", v || "");
  }

  async function revalidate() {
    try {
      const lang = (
        document.documentElement.getAttribute("lang") || "pl"
      ).toLowerCase();
      const url = `${PREFIX}/bundle_${lang}.json`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        console.warn("[cms] navigation bundle fetch failed");
        return;
      }
      const data = await res.json();
      if (
        !data ||
        !data.version ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        console.warn("[cms] navigation data missing");
        return;
      }

      const ul = document.getElementById(UL_ID);
      if (!ul) {
        console.warn("[cms] nav list element missing");
        return;
      }

      // Podmień tylko gdy SSR jest puste LUB wersja się zmieniła
      if (ul.children.length === 0 || data.version !== currentVersion()) {
        const html = buildHTML(data);
        const panels = buildPanels(data);
        ul.innerHTML = html;
        const mob = document.getElementById("mobileList");
        if (mob) mob.innerHTML = html;
        const panelWrap = document.getElementById("megaPanels");
        if (panelWrap) panelWrap.innerHTML = panels;
        if (typeof window.initHeaderSquarespace === "function")
          window.initHeaderSquarespace();
        setVersion(data.version);
      }
    } catch (e) {
      console.warn("[cms] navigation update failed", e);
    }
  }
  function start() {
    if ("requestIdleCallback" in window) requestIdleCallback(revalidate);
    else setTimeout(revalidate, 600);
    setInterval(revalidate, 5 * 60 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ===== KRAS-TRANS • Mega menu (delegated, aria, mobile support) ===== */
(function () {
  if (typeof window !== "undefined" && window.__ktMegaBound) return;
  if (typeof window !== "undefined") window.__ktMegaBound = true;

  const d = document;
  const $ = (sel, root = d) => root.querySelector(sel);
  const $$ = (sel, root = d) => Array.from(root.querySelectorAll(sel));

  // Cache lang switcher refs
  const lang = d.querySelector(".lang");
  const langBtn = lang?.querySelector(".lang-toggle");
  const langPanel = lang?.querySelector(".lang-panel");

  // Timeout for hover delay
  let langTimeout = null;

  // Helper: detect if mobile drawer is open
  function isMobileDrawerOpen() {
    const navToggle = $(".nav-toggle");
    return navToggle && navToggle.getAttribute("aria-expanded") === "true";
  }

  // Helper: close all mega panels except the one with exceptId
  function closeAllMega(exceptId) {
    $$('.mega-toggle[aria-expanded="true"]').forEach((btn) => {
      const id = btn.getAttribute("aria-controls");
      if (id !== exceptId) {
        btn.setAttribute("aria-expanded", "false");
        const panel = id && d.getElementById(id);
        if (panel) {
          panel.hidden = true;
          panel.setAttribute("aria-hidden", "true");
        }
      }
    });
  }

  // Helper: close all mega panels
  function closeAllMegaPanels() {
    closeAllMega(null);
  }

  // Helper: close language panel
  function closeLangPanel() {
    if (langBtn && langPanel) {
      langBtn.setAttribute("aria-expanded", "false");
      langPanel.hidden = true;
      langPanel.setAttribute("aria-hidden", "true");
    }
  }

  // Helper: open language panel
  function openLangPanel() {
    if (langBtn && langPanel) {
      langBtn.setAttribute("aria-expanded", "true");
      langPanel.hidden = false;
      langPanel.setAttribute("aria-hidden", "false");
    }
  }

  // Helper: switch language
  function switchLang(code) {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length > 0) parts[0] = code;
    else parts.unshift(code);
    const rest =
      "/" + parts.join("/") + (location.search || "") + (location.hash || "");
    location.assign(rest);
  }

  // Helper: open a mega panel for a given button
  function openMega(btn) {
    if (!btn) return;
    const id = btn.getAttribute("aria-controls");
    if (!id) return;
    const panel = d.getElementById(id);
    if (!panel) return;
    closeAllMega(id);
    btn.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    // --- Focus trap could be added here for accessibility ---
  }

  // Helper: close a mega panel for a given button
  function closeMega(btn) {
    if (!btn) return;
    const id = btn.getAttribute("aria-controls");
    if (!id) return;
    const panel = d.getElementById(id);
    if (!panel) return;
    btn.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }

  // Toggle mega panel for a button
  function toggleMega(btn) {
    if (!btn) return;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    if (expanded) {
      closeMega(btn);
    } else {
      openMega(btn);
    }
  }

  // Mobile drawer support: toggle nav open/close
  function toggleNavDrawer(open) {
    const navToggle = $(".nav-toggle");
    const nav = $("#main-nav") || $(".nav");
    if (!navToggle || !nav) return;
    navToggle.setAttribute("aria-expanded", String(open));
    nav.setAttribute("data-open", String(open));
    if (open) {
      document.body.classList.add("nav-open");
    } else {
      document.body.classList.remove("nav-open");
    }
  }

  // Language switcher hover events (desktop only)
  if (lang && langBtn && langPanel) {
    lang.addEventListener("mouseenter", function () {
      if (!isMobileDrawerOpen()) {
        if (langTimeout) {
          clearTimeout(langTimeout);
          langTimeout = null;
        }
        openLangPanel();
      }
    });

    lang.addEventListener("mouseleave", function () {
      if (!isMobileDrawerOpen()) {
        if (langTimeout) {
          clearTimeout(langTimeout);
        }
        langTimeout = setTimeout(() => {
          closeLangPanel();
          langTimeout = null;
        }, 100);
      }
    });
  }

  // Delegated click for mega-toggle, nav-toggle, and lang-toggle
  d.addEventListener(
    "click",
    function (e) {
      // Language item click
      const langItem = e.target.closest(".lang-item");
      if (langItem) {
        e.preventDefault();
        const code = langItem.getAttribute("data-lang");
        if (code) {
          switchLang(code);
        }
        return;
      }

      // Language toggle click
      const langToggle = e.target.closest(".lang-toggle");
      if (langToggle) {
        e.preventDefault();
        const expanded = langToggle.getAttribute("aria-expanded") === "true";
        if (expanded) {
          closeLangPanel();
        } else {
          openLangPanel();
        }
        return;
      }

      // Mega menu toggle
      const megaBtn = e.target.closest(".mega-toggle");
      if (megaBtn) {
        e.preventDefault();
        toggleMega(megaBtn);
        return;
      }
      // Mobile nav toggle
      const navBtn = e.target.closest(".nav-toggle");
      if (navBtn) {
        e.preventDefault();
        const expanded = navBtn.getAttribute("aria-expanded") === "true";
        toggleNavDrawer(!expanded);
        return;
      }
      // Click outside: close all mega panels, lang panel, and nav drawer
      if (
        !e.target.closest(
          "nav, .nav, #main-nav, #navList, .kt-nav, .nav-toggle, .lang"
        )
      ) {
        closeAllMegaPanels();
        closeLangPanel();
        toggleNavDrawer(false);
      }
    },
    false
  );

  // Close mega panels and lang panel on Escape
  d.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllMegaPanels();
      closeLangPanel();
      toggleNavDrawer(false);
      // Optionally, focus could be restored to the last toggle here
    }
  });

  // Export for debug/test
  if (typeof window !== "undefined") {
    window.ktNav = window.ktNav || {};
    window.ktNav.toggleMega = toggleMega;
    window.ktNav.closeAllMegaPanels = closeAllMegaPanels;
    window.ktNav.toggleNavDrawer = toggleNavDrawer;
    window.ktNav.switchLang = switchLang;
    window.ktNav.closeLangPanel = closeLangPanel;
    window.ktNav.openLangPanel = openLangPanel;
  }

  // --- To extend: focus-trap logic can be added in openMega() for accessibility ---
})();
