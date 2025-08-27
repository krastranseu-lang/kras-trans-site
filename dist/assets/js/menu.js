/** @format */

// assets/js/menu.js
(function () {
  const mqDesktop = window.matchMedia("(min-width:1025px)");
  const header = document.querySelector(".site-header");
  if (!header) return;

  // --- Mega: open/close helpers
  let hoverTimer = null;
  function closeAll() {
    header.querySelectorAll(".nav__item.is-open").forEach((li) => {
      li.classList.remove("is-open");
      const btn = li.querySelector('[data-menu="mega"]');
      if (btn) btn.setAttribute("aria-expanded", "false");
      const panel = li.querySelector(".mega");
      if (panel) panel.hidden = true;
    });
  }
  function openItem(li) {
    closeAll();
    li.classList.add("is-open");
    const btn = li.querySelector('[data-menu="mega"]');
    const panel = li.querySelector(".mega");
    if (btn) btn.setAttribute("aria-expanded", "true");
    if (panel) panel.hidden = false;
  }

  // --- Bind each item with children
  header.querySelectorAll(".nav__item.has-children").forEach((li) => {
    const btn = li.querySelector('[data-menu="mega"]');
    if (!btn) return;

    // Click (mobile & desktop)
    btn.addEventListener("click", (e) => {
      const wasOpen = li.classList.contains("is-open");
      if (wasOpen) {
        closeAll();
      } else {
        openItem(li);
      }
    });

    // Hover (desktop)
    li.addEventListener("mouseenter", () => {
      if (!mqDesktop.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => openItem(li), 120);
    });
    li.addEventListener("mouseleave", () => {
      if (!mqDesktop.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => closeAll(), 160);
    });

    // Keyboard focus
    li.addEventListener("focusin", () => openItem(li));
    li.addEventListener("focusout", (e) => {
      if (!li.contains(e.relatedTarget)) closeAll();
    });
  });

  // --- Mobile burger
  const burger = header.querySelector(".hamburger");
  const mobile = document.getElementById("mobileMenu");
  if (burger && mobile) {
    burger.addEventListener("click", () => {
      const open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      mobile.hidden = open;
      document.body.classList.toggle("no-scroll", !open);
    });
  }

  // --- Theme toggle (dark / light / auto)
  const KEY = "kt_theme";
  const themeBtn = header.querySelector(".theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const saved = localStorage.getItem(KEY) || "auto";
      const next =
        saved === "dark" ? "light" : saved === "light" ? "auto" : "dark";
      localStorage.setItem(KEY, next);
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.documentElement.classList.toggle(
        "theme-dark",
        next === "dark" || (next === "auto" && prefersDark)
      );
    });
  }

  // Close mega when clicking outside
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) closeAll();
  });
})();
