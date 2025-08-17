(() => {
  'use strict';
  const doc = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rIC = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

  // Inicjalizacja motywu: obsługa przełącznika trybów i zapamiętywanie wyboru
  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const themes = ['system', 'dark', 'light', 'ebook'];
    let current = localStorage.getItem('kras-theme') || 'system';
    // Element dymka z podpowiedzią
    const hint = document.createElement('span');
    hint.className = 'theme-hint';
    hint.hidden = true;
    btn.after(hint);
    function applyTheme(theme) {
      doc.removeAttribute('data-theme');
      if (theme !== 'system') doc.setAttribute('data-theme', theme);
      // aria-pressed = true jeśli wybrano konkretny motyw (nie systemowy)
      btn.setAttribute('aria-pressed', theme !== 'system');
    }
    function showHint(text) {
      if (!text) return;
      hint.textContent = text;
      hint.hidden = false;
      requestAnimationFrame(() => hint.classList.add('show'));
      // Schowanie dymka po 3 sekundach
      setTimeout(() => {
        hint.classList.remove('show');
        hint.hidden = true;
      }, 3000);
    }
    // Ustaw motyw początkowy (z localStorage lub systemowy)
    applyTheme(current);
    // Obsługa kliknięcia przełącznika: zmiana motywu cyklicznie
    btn.addEventListener('click', () => {
      current = themes[(themes.indexOf(current) + 1) % themes.length];
      localStorage.setItem('kras-theme', current);
      applyTheme(current);
      // Wyświetlenie podpowiedzi jaki motyw ustawiono (napisy z CMS dla różnych motywów)
      const hints = (window.KRAS_STRINGS && window.KRAS_STRINGS.theme_hints) || {};
      showHint(hints[current] || '');
    });
  }

  // Zdjęcie klasy .no-motion po załadowaniu (umożliwia animacje, jeśli motion nie zredukowany)
  function gateAnimations() {
    if (reduceMotion) return;
    rIC(() => doc.classList.remove('no-motion'));
  }

  // Inicjalizacja dolnego docka: obsługa przycisków oraz ukrywanie przy stopce
  function initDock() {
    const quoteBtn = document.querySelector('.dock-quote');
    const menuBtn = document.getElementById('dock-menu');
    // Kliknięcie "Wyceń" przewija do sekcji kontakt (stopki) i pokazuje dymek how-to
    quoteBtn?.addEventListener('click', () => {
      document.getElementById('kontakt')?.scrollIntoView({ behavior: 'smooth' });
      showHowTo();
    });
    // Kliknięcie "Menu" otwiera neon menu
    menuBtn?.addEventListener('click', openMenu);
    // Ukrywanie docka, gdy stopka (kontakt) jest widoczna
    const dock = document.querySelector('.bottom-dock');
    const footer = document.querySelector('.site-footer');
    if (dock && footer && 'IntersectionObserver' in window) {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) dock.classList.add('is-hidden');
        else dock.classList.remove('is-hidden');
      });
      obs.observe(footer);
    }
  }

  let neonMenuEl = null;
  let lastFocus = null;
  // Funkcja uzupełniająca dane w neon menu (linki, języki)
  function buildMenu() {
    const navContainer = neonMenuEl.querySelector('.neon__nav');
    navContainer.innerHTML = '';
    // Jeśli w #site-nav są już elementy (mega menu zbudowane), klonujemy je
    const sourceNav = document.getElementById('site-nav');
    if (sourceNav && sourceNav.children.length) {
      navContainer.innerHTML = sourceNav.innerHTML;
    } else if (window.KRAS_NAV && window.KRAS_NAV.items) {
      // W przeciwnym razie budujemy listę z konfiguracji KRAS_NAV
      const ul = document.createElement('ul');
      window.KRAS_NAV.items.forEach(item => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.label;
        li.appendChild(a);
        ul.appendChild(li);
      });
      navContainer.appendChild(ul);
    }
    // Sekcja linków językowych
    const langsContainer = neonMenuEl.querySelector('.neon__langs');
    if (langsContainer) {
      langsContainer.innerHTML = '';
      const langs = (window.KRAS_NAV && window.KRAS_NAV.langs) || [];
      langs.forEach(l => {
        const a = document.createElement('a');
        a.href = l.href;
        a.innerHTML = `<img src="${l.flag}" alt="" width="16" height="12"> ${l.label}`;
        langsContainer.appendChild(a);
      });
    }
  }
  // Pułapka focusu w menu (zamykanie Esc, obsługa Tab w ramach modala)
  function trapFocus(e) {
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key !== 'Tab') return;
    const focusable = neonMenuEl.querySelectorAll('a, button');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }
  // Funkcja otwierająca neon menu
  function openMenu() {
    if (!neonMenuEl) return;
    buildMenu();
    neonMenuEl.hidden = false;
    neonMenuEl.classList.add('is-open');
    lastFocus = document.activeElement;
    document.addEventListener('keydown', trapFocus);
    // Ustaw fokus na pierwszy link w menu po otwarciu
    const firstFocusable = neonMenuEl.querySelector('a, button');
    firstFocusable?.focus();
  }
  // Funkcja zamykająca neon menu
  function closeMenu() {
    if (!neonMenuEl) return;
    neonMenuEl.classList.remove('is-open');
    neonMenuEl.hidden = true;
    document.removeEventListener('keydown', trapFocus);
    // Przywrócenie fokusu na ostatnio aktywny element przed otwarciem menu
    lastFocus?.focus();
  }
  // Inicjalizacja neon menu: dodanie obsługi zamykania po kliknięciu tła i przycisku
  function initNeonMenu() {
    neonMenuEl = document.getElementById('neon-menu');
    if (!neonMenuEl) return;
    // Kliknięcie poza menu (w tło) – zamyka
    neonMenuEl.addEventListener('click', (e) => {
      if (e.target === neonMenuEl) closeMenu();
    });
    const closeBtn = neonMenuEl.querySelector('.neon__close');
    closeBtn?.addEventListener('click', closeMenu);
  }

  // Animacja sekcji oferty (split-hero) podczas scrollowania – płynne odsłanianie kafelków
  function initOfferReveal() {
    const host = document.getElementById('offer-reveal');
    if (!host) return;
    const sticky = host.querySelector('.split-hero__sticky');
    const rail = host.querySelector('.split-hero__rail');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Jeśli użytkownik ogranicza animacje – pokaż wszystko od razu
      host.style.setProperty('--p', 1);
      if (rail) rail.style.pointerEvents = 'auto';
      return;
    }
    // Oblicz progres przewinięcia sekcji (p from 0 to 1)
    const calcProgress = () => {
      const rect = host.getBoundingClientRect();
      const full = (host.offsetHeight - sticky.offsetHeight) || 1;
      const scrolled = Math.min(Math.max(-rect.top, 0), full);
      const p = Math.min(Math.max(scrolled / full, 0), 1);
      host.style.setProperty('--p', p.toFixed(4));
      if (rail) rail.style.pointerEvents = (p > 0.15 ? 'auto' : 'none');
    };
    // Throttle scroll events using requestAnimationFrame
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; calcProgress(); });
    };
    // Observer uruchamiający nasłuchiwanie scrolla gdy sekcja pojawi się w viewport
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        calcProgress();
      } else {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    });
    io.observe(host);
  }

  // Wyrównanie wysokości kafelków (np. w gridzie USP czy floty) za pomocą ResizeObserver
  function equalizeCards() {
    const sets = document.querySelectorAll('.cards[data-equalize]');
    if (!sets.length) return;
    const ro = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const wrap = entry.target;
        const pads = wrap.querySelectorAll('.card > .pad');
        if (window.matchMedia('(max-width: 599px)').matches) {
          // Na mobile – reset wysokości (stacking, więc auto dopasowanie)
          pads.forEach(p => p.style.minHeight = '');
          return;
        }
        // Na większych ekranach: wyrównaj min-wysokość do najwyższej karty
        let max = 0, min = Infinity;
        pads.forEach(p => {
          const h = p.offsetHeight;
          max = Math.max(max, h);
          min = Math.min(min, h);
        });
        if (max - min > 8) {
          pads.forEach(p => p.style.minHeight = max + 'px');
        } else {
          pads.forEach(p => p.style.minHeight = '');
        }
      });
    });
    sets.forEach(set => ro.observe(set));
  }

  // Mechanizm wyświetlania dymka "Jak to działa"
  let howtoTimeout;
  function showHowTo() {
    const box = document.getElementById('howto');
    if (!box || !box.hidden) return;
    box.hidden = false;
    // Pokazuj punkty listy po kolei
    const steps = box.querySelectorAll('li');
    steps.forEach(li => (li.hidden = true));
    let i = 0;
    (function revealStep() {
      if (i < steps.length) {
        steps[i].hidden = false;
        i++;
        setTimeout(revealStep, 800);
      }
    })();
    // Funkcje zamykające dymek
    function closeBubble() {
      box.hidden = true;
      document.removeEventListener('keydown', onEsc);
      box.removeEventListener('click', closeBubble);
      clearTimeout(howtoTimeout);
    }
    function onEsc(e) {
      if (e.key === 'Escape') closeBubble();
    }
    document.addEventListener('keydown', onEsc);
    box.addEventListener('click', closeBubble);
    // Automatyczne schowanie po 6 sekundach
    howtoTimeout = setTimeout(closeBubble, 6000);
  }
  // Inicjalizacja dymka "Jak to działa" – powiązanie z głównym CTA
  function initHowTo() {
    const primaryCta = document.querySelector('.hero-cta .btn.primary');
    primaryCta?.addEventListener('click', () => { showHowTo(); });
  }

  // Efekt znikania przycisku przed przejściem na nową stronę
  function initDisappear() {
    document.addEventListener('click', e => {
      const el = e.target.closest('a[data-disappear],button[data-disappear]');
      if (!el) return;
      if (el.dataset.firing) { e.preventDefault(); return; }
      el.dataset.firing = '1';
      const rect = el.getBoundingClientRect();
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      el.classList.add('bye');
      el.setAttribute('aria-disabled', 'true');
      const url = el.getAttribute('href') || el.dataset.href || '#';
      const target = el.getAttribute('target');
      const delay = parseInt(el.dataset.delay || '140', 10);
      e.preventDefault();
      window.setTimeout(() => {
        if (target === '_blank') {
          window.open(url, '_blank', 'noopener');
        } else {
          window.location.assign(url);
        }
      }, delay);
    });
  }

  // Leniwe wczytanie tła canvas (animacja patyczków) po pewnym czasie bezczynności
  function lazyBackgrounds() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || reduceMotion) return;
    rIC(() => {
      canvas.hidden = false;
      const ctx = canvas.getContext('2d');
      let w = 0, h = 0, last = 0, rafId;
      function resize() { 
        w = canvas.width = window.innerWidth; 
        h = canvas.height = window.innerHeight; 
      }
      resize();
      window.addEventListener('resize', resize);
      // Tworzenie "patyczków" – losowe linie poruszające się po ekranie
      const sticks = Array.from({ length: 30 }, () => ({
        x: Math.random() * w, 
        y: Math.random() * h, 
        l: 20 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3
      }));
      function draw(timestamp) {
        if (document.hidden) {
          rafId = requestAnimationFrame(draw);
          return;
        }
        if (timestamp - last < 33) {
          // ~30fps throttle
          rafId = requestAnimationFrame(draw);
          return;
        }
        last = timestamp;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,145,64,0.15)';  // kolor (pomarańcz) z transparentnością
        sticks.forEach(s => {
          s.x += s.vx; s.y += s.vy;
          // odbijanie od krawędzi
          if (s.x < 0 || s.x > w) s.vx *= -1;
          if (s.y < 0 || s.y > h) s.vy *= -1;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + s.l * s.vx * 5, s.y + s.l * s.vy * 5);
          ctx.stroke();
        });
        rafId = requestAnimationFrame(draw);
      }
      rafId = requestAnimationFrame(draw);
      // Wstrzymanie animacji gdy strona nieaktywna (przy przejściu do innej karty)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(rafId);
        else rafId = requestAnimationFrame(draw);
      });
    });
  }

  // Leniwe osadzenie mapy kierunków (iframe) gdy dojdziemy do sekcji
  function initMapEmbed() {
    const iframe = document.querySelector('.routes-map');
    if (!iframe) return;
    const dataSrc = iframe.getAttribute('data-src');
    if (!dataSrc) return;
    // Jeśli przeglądarka obsługuje native lazy (loading="lazy"), zostawiamy atrybut
    if ('loading' in HTMLIFrameElement.prototype) {
      // (Iframe już ma loading=lazy w HTML, nie trzeba nic robić)
      return;
    }
    // Dla starszych – używamy IntersectionObserver do nadania src
    const mapObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        iframe.src = dataSrc;
        mapObserver.disconnect();
      }
    }, { rootMargin: '100px' });
    mapObserver.observe(iframe);
  }

  // Główna inicjalizacja po załadowaniu DOM
  function init() {
    initTheme();
    initDock();
    initNeonMenu();
    initOfferReveal();
    equalizeCards();
    initHowTo();
    lazyBackgrounds();
    initMapEmbed();
    initDisappear();
    gateAnimations();
    // Odsłonięcie hero (np. dla fade-in obrazu)
    const hero = document.getElementById('hero');
    hero && hero.classList.add('is-ready');
  }

  // Start po załadowaniu dokumentu
  document.addEventListener('DOMContentLoaded', init);

  // Ujawnienie globalnych funkcji (opcjonalnie, do debug lub wywołań zewnętrznych)
  window.KRASUI = { openMenu, closeMenu, showHowTo };
})();
