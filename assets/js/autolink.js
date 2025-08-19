// Ochrona na zewn. linki + proste autolinki
document.querySelectorAll('a[href^="http"]').forEach(a=>{
if (!a.href.includes(location.host)) a.setAttribute('rel','noopener noreferrer');
});
