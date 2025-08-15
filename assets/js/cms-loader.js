(() => {
  const url = window.CMS_URL || window.KRAS_CMS_URL || '/data/cms.json';
  fetch(url, {credentials: 'omit'})
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      const dict = data.strings || data;
      document.querySelectorAll('[data-cms-key]').forEach(el => {
        const key = el.getAttribute('data-cms-key');
        if (dict[key]) {
          el.textContent = dict[key];
        }
      });
    })
    .catch(err => console.warn('CMS load fail', err));
})();
