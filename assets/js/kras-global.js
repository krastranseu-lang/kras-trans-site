/* =========================================================================
   KRAS-TRANS • GLOBAL JS (UI + Animacje + UX)
   -------------------------------------------------------------------------
   Co włącza (automatycznie, jeśli są elementy):
   • Motywy: system → dark → light → paper (z zapisem w localStorage)
   • Sticky header: desktop zawsze; mobile chowa się przy scrollu w dół
   • „Scrolled” na headerze po 1px (dla tła/szadowania)
   • Hero video: leniwie, gra gdy w viewport (bez CLS)
   • Kafelki: równa wysokość w sekcji (data-equalize="true")
   • Poziomy scroll kart na mobile (wheel + drag)
   • Tilt 3D (subtelny) dla .tilt-cards na desktopie
   • Tło: canvas „patyczki” (pauza poza viewportem / zakładką)
   • Separatory „morphing-waves” (SVG, throttling ~12fps, pauza poza viewportem)
   • View Transitions (łagodne przejście między stronami – wspierane przeglądarki)
   • Przyciski z postępem: spinner → check (dla <form> z [data-progress])
   • Zewnętrzne linki z target=_blank → rel="noopener"
   • Hash-linki: płynne przewijanie z uwzględnieniem wysokości headera
   • (opcjonalnie) Budowa menu z okna window.KRAS_NAV (jeśli nie ma pozycji w DOM)

   WYMAGANE w HTML (jeśli chcesz dany efekt):
   - <header class="site-header">…</header>
   - <video class="hero-media" ...></video> (opcjonalne)
   - kontenery kart: <div class="cards …" data-equalize="true">…</div>
   - mobilny poziomy scroll: .cards--scroll
   - tilt (hover): .tilt-cards
   - tło: <canvas id="bg-canvas" aria-hidden="true"></canvas> (opcjonalne)
   - separatory: <div class="sep sep--morph" data-morph="wave-1|wave-2|wave-3"></div>
   - przełącznik motywu: <button id="theme-toggle" ...> (opcjonalne)
   - dock mobilny: <nav class="bottom-bar">…</nav> (opcjonalne)

   Zadbano o prefers-reduced-motion, wydajność (throttle, pauzy), brak błędów
   gdy elementów nie ma. Nie wymaga żadnych bibliotek.
   ======================================================================== */

(function () {
  "use strict";

  /* ---------- Utils ---------- */
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  const CFG = {
    THEME_KEY: "kras-theme",
    MOBILE_BP: 900, // px – zachowanie headera mobilnego
  };

  const isMobile = () => window.matchMedia(`(max-width:${CFG.MOBILE_BP}px)`).matches;
  const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Motywy: system → dark → light → paper → system ---------- */
  function setTheme(mode /* 'dark'|'light'|'paper'|null */) {
    const root = document.documentElement;
    if (mode) {
      root.dataset.theme = mode;
      localStorage.setItem(CFG.THEME_KEY, mode);
    } else {
      root.removeAttribute("data-theme");
      localStorage.removeItem(CFG.THEME_KEY);
    }
    const btn = $("#theme-toggle");
    if (btn) {
      let label = "System";
      if (mode === "dark") label = "Dark";
      else if (mode === "light") label = "Light";
      else if (mode === "paper") label = "Paper";
      btn.title = `Theme: ${label}`;
      btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    }
  }

  function initTheme() {
    setTheme(localStorage.getItem(CFG.THEME_KEY));
    const btn = $("#theme-toggle");
    if (!btn) return;
    on(btn, "click", () => {
      const cur = localStorage.getItem(CFG.THEME_KEY); // null=system
      const next =
        cur === null
          ? "dark"
          : cur === "dark"
          ? "light"
          : cur === "light"
          ? "paper"
          : null; // back to system
      setTheme(next);
    });
  }

  /* ---------- Header: scrolled + mobile hide-on-scroll ---------- */
  function initHeader() {
    const header = $(".site-header");
    if (!header) return;

    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;

      // 'scrolled' po 1px – dla tła/blur/shadow w CSS
      header.classList.toggle("scrolled", y > 1);

      // Mobile: chowamy header przy scrollu w dół, pokazujemy w górę
      if (isMobile()) {
        const goingDown = y > lastY && y - lastY > 4;
        const goingUp = y < lastY && lastY - y > 4;
        if (goingDown) header.classList.add("is-hidden");
        else if (goingUp) header.classList.remove("is-hidden");
      } else {
        header.classList.remove("is-hidden"); // na desktopie zawsze widoczny
      }
      lastY = y;
    };

    on(window, "scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    });
    update();
    on(window, "resize", update);
  }

  /* ---------- Hero video: lazy + gra tylko w viewport ---------- */
  function initHeroVideo() {
    const v = $(".hero-media");
    if (!v) return;

    const play = () => {
      v.load();
      v.oncanplay = () => {
        v.classList.add("active");
        v.play().catch(() => {});
      };
    };

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (e) => {
          if (e[0].isIntersecting) {
            play();
            io.disconnect();
          }
        },
        { threshold: 0.2 }
      );
      io.observe(v);
    } else {
      play();
    }
  }

  /* ---------- Kafelki: równa wysokość per sekcja ---------- */
  function equalizeCards() {
    $$('[data-equalize="true"]').forEach((grid) => {
      let maxH = 0;
      grid.style.setProperty("--equal-h", "auto");
      grid.querySelectorAll(".card > .pad").forEach((c) => {
        c.style.minHeight = "auto";
      });
      grid.querySelectorAll(".card").forEach((card) => {
        const pad = card.querySelector(".pad") || card;
        const h = pad.getBoundingClientRect().height;
        if (h > maxH) maxH = h;
      });
      if (maxH > 0) grid.style.setProperty("--equal-h", `${Math.ceil(maxH)}px`);
    });
  }

  function observeEqualizer() {
    const ro = new ResizeObserver(() => equalizeCards());
    $$('[data-equalize="true"]').forEach((g) => ro.observe(g));
    const mo = new MutationObserver(() => equalizeCards());
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    on(window, "load", equalizeCards);
    on(window, "resize", equalizeCards);
  }

  /* ---------- Poziomy scroll kart (wheel + drag) ---------- */
  function initHorizontalScroll() {
    $$(".cards--scroll").forEach((el) => {
      // wheel → poziomo
      on(el, "wheel", (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });

      // drag → poziomo
      let isDown = false, startX = 0, startLeft = 0;
      on(el, "pointerdown", (e) => {
        isDown = true;
        el.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startLeft = el.scrollLeft;
        el.classList.add("is-dragging");
      });
      on(el, "pointermove", (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        el.scrollLeft = startLeft - dx;
      }, { passive: true });
      const end = (e) => { if (!isDown) return; isDown = false; el.classList.remove("is-dragging"); };
      on(el, "pointerup", end); on(el, "pointercancel", end); on(el, "pointerleave", end);
    });
  }

  /* ---------- Tilt 3D (desktop only, subtelny) ---------- */
  function initTilt() {
    if (!window.matchMedia("(hover: hover)").matches) return;
    $$(".tilt-cards").forEach((wrap) => {
      let raf = 0;
      on(wrap, "mousemove", (e) => {
        const card = e.target.closest(".card");
        if (!card) return;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = card.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
          const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          card.style.transform = `translateY(-2px) scale(1.02) rotateX(${clamp(
            -dy * 8,
            -6,
            6
          )}deg) rotateY(${clamp(dx * 10, -8, 8)}deg)`;
          card.style.boxShadow = "var(--shadow-2)";
        });
      });
      on(wrap, "mouseleave", () =>
        wrap.querySelectorAll(".card").forEach((c) => {
          c.style.transform = "";
          c.style.boxShadow = "";
        })
      );
    });
  }

  /* ---------- Tło: „patyczki” na canvas ---------- */
  function initParticles() {
    if (prefersReduced()) return;
    const canvas = $("#bg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W, H, DPR, pts = [], running = true;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = (canvas.width = Math.floor(innerWidth * DPR));
      H = (canvas.height = Math.floor(innerHeight * DPR));
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      const density = 18000;
      const count = Math.max(24, Math.round((innerWidth * innerHeight) / density));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.10 * DPR,
        vy: (Math.random() - 0.5) * 0.10 * DPR,
      }));
    }

    function colors() {
      const root = document.documentElement;
      const dark =
        root.dataset.theme === "dark" ||
        (!root.dataset.theme &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      const dot = "rgba(217,119,6,.9)";
      const line = dark ? "rgba(217,119,6,.28)" : "rgba(217,119,6,.22)";
      return { dot, line };
    }

    function loop() {
      if (!running) return;
      const { dot, line } = colors();
      ctx.clearRect(0, 0, W, H);

      // update
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }

      // points
      ctx.fillStyle = dot;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }

      // lines
      const maxD = Math.min(W, H) * 0.18;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x,
            dy = pts[i].y - pts[j].y,
            d = Math.hypot(dx, dy);
          if (d < maxD) {
            ctx.globalAlpha = 1 - d / maxD;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      setTimeout(() => requestAnimationFrame(loop), 1000 / 45); // ~45fps
    }

    resize();
    loop();
    on(window, "resize", resize);
    on(document, "visibilitychange", () => {
      running = document.visibilityState === "visible";
      if (running) loop();
    });
  }

  /* ---------- Separatory „morphing-waves” (SVG, superformula) ---------- */
  function initMorphWaves() {
    if (prefersReduced()) return;
    const hosts = $$(".sep--morph");
    if (!hosts.length) return;

    // superformula → ścieżka SVG
    const sf = (m, n1, n2, n3, a = 1, b = 1, pts = 120, scale = 1, offX = 0, offY = 0) => {
      const path = [];
      for (let i = 0; i <= pts; i++) {
        const t = (i / pts) * Math.PI * 2;
        const ct = Math.cos((m * t) / 4) / a;
        const st = Math.sin((m * t) / 4) / b;
        const r = Math.pow(
          Math.pow(Math.abs(ct), n2) + Math.pow(Math.abs(st), n3),
          -1 / n1
        );
        const x = offX + r * Math.cos(t) * scale;
        const y = offY + r * Math.sin(t) * scale;
        path.push(`${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
      }
      return path.join(" ") + " Z";
    };

    const PRESETS = {
      "wave-1": [
        { m: 6, n1: 1, n2: 1.7, n3: 1.7 },
        { m: 6, n1: 0.9, n2: 1.3, n3: 2.2 },
      ],
      "wave-2": [
        { m: 4, n1: 0.8, n2: 1.2, n3: 1.9 },
        { m: 5, n1: 1.1, n2: 1.6, n3: 1.6 },
      ],
      "wave-3": [
        { m: 7, n1: 1.2, n2: 1.5, n3: 1.4 },
        { m: 7, n1: 0.9, n2: 1.2, n3: 1.9 },
      ],
    };

    hosts.forEach((host) => {
      const kind = host.dataset.morph in PRESETS ? host.dataset.morph : "wave-1";
      const [A, B] = PRESETS[kind];

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.setAttribute("viewBox", "0 0 1000 200");
      svg.setAttribute("preserveAspectRatio", "none");
      path.setAttribute("fill", "currentColor");
      path.style.opacity = 0.12;
      svg.appendChild(path);
      host.appendChild(svg);

      let t = 0,
        dir = 1,
        running = false;

      const draw = () => {
        const lerp = (a, b) => a + (b - a) * t;
        const p = { m: lerp(A.m, B.m), n1: lerp(A.n1, B.n1), n2: lerp(A.n2, B.n2), n3: lerp(A.n3, B.n3) };
        const d = sf(p.m, p.n1, p.n2, p.n3, 1, 1, 140, 60, 120, 100);
        path.setAttribute("d", d);

        const root = document.documentElement;
        const dark =
          root.dataset.theme === "dark" ||
          (!root.dataset.theme &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        path.style.color = dark ? "rgba(217,119,6,.5)" : "rgba(217,119,6,.45)";
      };

      // throttling ~12fps + pauza poza viewportem
      let raf = 0,
        timer = 0;
      const tick = () => {
        if (!running) return;
        timer = setTimeout(() => {
          t += 0.03 * dir;
          if (t >= 1) {
            t = 1;
            dir = -1;
          } else if (t <= 0) {
            t = 0;
            dir = 1;
          }
          draw();
          raf = requestAnimationFrame(tick);
        }, 1000 / 12);
      };

      const io = new IntersectionObserver(
        (e) => {
          if (e[0].isIntersecting) {
            if (!running) {
              running = true;
              tick();
            }
          } else {
            running = false;
            clearTimeout(timer);
            cancelAnimationFrame(raf);
          }
        },
        { threshold: 0.1 }
      );
      io.observe(host);

      draw();
      on(window, "resize", draw);
    });
  }

  /* ---------- View Transitions (łagodne przejścia) ---------- */
  function initTransitions() {
    if (!document.startViewTransition) return;
    on(document, "click", async (e) => {
      const a = e.target.closest("a[href]");
      if (!a || a.target || a.origin !== location.origin) return;
      const href = a.getAttribute("href");
      if (href.startsWith("#")) return; // local anchors bez VT
      e.preventDefault();
      document.startViewTransition(async () => {
        const res = await fetch(href, { mode: "same-origin" });
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        document.body.replaceWith(doc.body);
        window.history.pushState({}, "", href);
      });
    });
    on(window, "popstate", () => location.reload());
  }

  /* ---------- Progress buttons (spinner → check) ---------- */
  function initProgressButtons() {
    on(document, "submit", (e) => {
      const form = e.target.closest("form");
      if (!form) return;
      const btn = form.querySelector("[data-progress]");
      if (!btn) return;
      btn.classList.add("is-loading");

      if (form.hasAttribute("data-ajax")) {
        e.preventDefault();
        const fd = new FormData(form);
        fetch(form.action || "#", {
          method: form.method || "POST",
          body: fd,
        })
          .then((r) => (r.ok ? r.text() : Promise.reject(r)))
          .then(() => {
            btn.classList.remove("is-loading");
            btn.classList.add("is-success");
            setTimeout(() => btn.classList.remove("is-success"), 1400);
          })
          .catch(() => btn.classList.remove("is-loading"));
      }
    });
  }

  /* ---------- target=_blank → rel="noopener" ---------- */
  function patchExternalLinks() {
    $$('a[target="_blank"]').forEach((a) => {
      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (!rel.includes("noopener")) rel.push("noopener");
      a.setAttribute("rel", rel.join(" ").trim());
    });
  }

  /* ---------- Hash-linki: płynny scroll z offsetem headera ---------- */
  function initHashScroll() {
    const header = $(".site-header");
    const headerH = () => (header ? header.getBoundingClientRect().height : 0);
    // klik
    on(document, "click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (id.length <= 1) return;
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      const y =
        window.scrollY +
        el.getBoundingClientRect().top -
        headerH() -
        8; /* mały margines */
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
    // wejście z #hash w URL
    if (location.hash && $(location.hash)) {
      setTimeout(() => {
        const el = $(location.hash);
        const y =
          window.scrollY +
          el.getBoundingClientRect().top -
          headerH() -
          8;
        window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
      }, 0);
    }
  }

  /* ---------- (Opcjonalnie) Budowa menu z window.KRAS_NAV ---------- */
  function initMenuBuilder() {
    const navHost = $("#site-nav");
    if (!navHost) return;

    const existing = navHost.querySelector(".nav-list li");
    if (existing) return; // już jest menu

    const data = window.KRAS_NAV;
    if (!Array.isArray(data) || !data.length) return;

    const ul = document.createElement("ul");
    ul.className = "nav-list";
    data.forEach((item) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.href || item.url || "#";
      a.textContent = item.label || item.title || "—";
      li.appendChild(a);
      ul.appendChild(li);
    });
    navHost.prepend(ul);
  }

  /* ---------- INIT ---------- */
  function init() {
    initTheme();
    initHeader();
    initHeroVideo();
    equalizeCards();
    observeEqualizer();
    initHorizontalScroll();
    initTilt();
    initParticles();
    initMorphWaves();
    initTransitions();
    initProgressButtons();
    patchExternalLinks();
    initHashScroll();
    initMenuBuilder();
  }

  // start
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
// Po załadowaniu fontów przelicz równe wysokości
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(()=> equalizeCards());
}
/* === NAV: zaznacz aktywną pozycję === */
function setActiveNav(){
  const cur = location.pathname.replace(/\/+$/,''); // bez końcowego /
  document.querySelectorAll('#site-nav a[href^="/"]').forEach(a=>{
    const href = a.getAttribute('href').replace(/\/+$/,'');
    if (href && href === cur) a.setAttribute('aria-current','page');
  });
}

/* === Mobile: chowaj header przy scrollu w dół === */
function initHideHeaderOnScroll(){
  const header = document.querySelector('.site-header');
  if(!header) return;
  let lastY = window.scrollY, hidden = false;
  const onScroll = ()=>{
    if (window.innerWidth > 900) { header.classList.remove('is-hidden'); return; }
    const y = window.scrollY;
    const down = y > lastY + 10;
    const up   = y < lastY - 10;
    if (down && y > 60 && !hidden){ header.classList.add('is-hidden'); hidden = true; }
    else if (up && hidden){ header.classList.remove('is-hidden'); hidden = false; }
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, {passive:true});
}

document.addEventListener('DOMContentLoaded', ()=>{
  setActiveNav();
  initHideHeaderOnScroll();
});
