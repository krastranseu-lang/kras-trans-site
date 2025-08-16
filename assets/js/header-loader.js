// Dynamically load shared header
(async function(){
  try {
    const res = await fetch('/assets/header.html', {credentials:'omit'});
    if(!res.ok) return;
    const html = await res.text();
    document.body.insertAdjacentHTML('afterbegin', html);
  } catch(err) {
    console.warn('Header load failed', err);
  }
})();
