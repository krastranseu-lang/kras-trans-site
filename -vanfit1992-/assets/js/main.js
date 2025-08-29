// Bootstrapper (ES module) that loads classic scripts in order
// It keeps existing files unmodified and shares their global scope.

const baseUrl = new URL('.', import.meta.url);

function loadClassic(relPath) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(relPath, baseUrl).href;
    s.async = false; // hint ordered execution
    s.onload = () => resolve(relPath);
    s.onerror = (e) => reject(new Error(`Failed to load ${relPath}`));
    document.head.appendChild(s);
  });
}

async function boot() {
  // Order matters — mirrors original monolith layout
  const files = [
    // Core config/state first
    'config-i18n.js',
    'state.js',
    'util.js',
    // Provide renderAll and core render helpers before any calls
    'render3d-isometric.js', // defines renderAll, renderItems, etc.
    'vehicle-ui.js',         // renderSpecs
    'svg-export.js',         // buildSVG
    'render2d-floor.js',     // updateRulers, fitCanvasToVehicleWidth, render
    'sidecut-render.js',     // renderSection
    'presets.js',            // renderPresets
    'overlay-labels.js',
    // Build DOM (will call renderAll and renderPresets)
    'dom-build.js',
    // Interactions and features layered on top
    'viewport-zoompan.js',
    'items-api.js',
    'autopack.js',
    'drag-docking.js',       // installViewportKeys
    // Three.js subsystem (expects THREE from HTML CDN)
    'three-core.js',
    'three-postfx.js',
    'three-interactions.js',
    // Geometry helpers
    'geo-epal-pallet.js',
    'geo-cardboard-box.js',
    // Parsers (light first for fallback)
    'parser-megaprompt-light.js',
    'parser-bulk-ultra.js',
    // App init and self-tests
    'init.js',
    'selftest-labels.js',
    'selftest-2d.js',
    'selftest-3d.js',
    'selftest-run.js',
  ];

  for (const f of files) {
    // eslint-disable-next-line no-await-in-loop
    await loadClassic(f);
  }

  // Optional: mark as bootstrapped for guards
  try { window.VANFIT_BOOTSTRAPPED = true; } catch (_) {}
}

// Delay until DOM is ready to ensure #van-pack exists
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
