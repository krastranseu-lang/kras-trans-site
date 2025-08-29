// VanFit minimal loader (standalone)
(function(){
  const root = document.getElementById('vanfit-app');
  if(!root) return;
  const container = document.createElement('div');
  container.style.maxWidth = '960px';
  container.style.width = '100%';
  container.style.margin = '0 auto';
  container.style.padding = '24px';
  container.style.textAlign = 'center';
  container.style.border = '1px solid #1f2a37';
  container.style.borderRadius = '12px';
  container.style.background = '#0e131a';
  const title = document.createElement('h2');
  title.textContent = 'VanFit — standalone działa';
  title.style.marginTop = '0';
  const info = document.createElement('p');
  info.textContent = 'To jest niezależny build VanFit kopiowany do /dist/vanfit/';
  const ts = document.createElement('p');
  ts.style.opacity = '0.8';
  ts.style.fontSize = '12px';
  ts.textContent = 'Załadowano: ' + new Date().toLocaleString();
  container.appendChild(title);
  container.appendChild(info);
  container.appendChild(ts);
  const placeholder = root.querySelector('.placeholder');
  if(placeholder) root.removeChild(placeholder);
  root.appendChild(container);
})();

