// Redirect na /{lang}/ z korzenia domeny
(function(){
const path = location.pathname;
const langs = ['pl','en','de','fr','it','ru','ua'];
const onLangRoot = new RegExp('^/(' + langs.join('|') + ')(/|$)').test(path);
if (onLangRoot) return;
if (path === '/' || path === '/index.html'){
const stored = localStorage.getItem('lang');
const nav = (navigator.language||'pl').slice(0,2);
const target = (stored && langs.includes(stored)) ? stored : (langs.includes(nav)?nav:'pl');
location.replace('/'+target+'/');
}
})();
