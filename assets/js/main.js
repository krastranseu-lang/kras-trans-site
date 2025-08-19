// Mega-menu: klawiatura + aria
const menuItems = document.querySelectorAll('.menu-item.has-mega > a');
menuItems.forEach(a => {
const mega = a.parentElement.querySelector('.mega');
if (!mega) return;
a.addEventListener('focus', () => a.setAttribute('aria-expanded','true'));
a.addEventListener('blur', () => a.setAttribute('aria-expanded','false'));
a.addEventListener('keydown', (e) => {
if (e.key === 'Escape') { a.setAttribute('aria-expanded','false'); a.blur(); }
});
});
