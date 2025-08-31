// /assets/js/crumbs.js
(() => {
  const el = document.getElementById('breadcrumb');
  if (!el) return;

  const norm = (p) => (p || '').replace(/\/+$/, '/') || '/';
  const here = norm(location.pathname);
  const atBlogIndex = here === '/blog/';

  const base = [
    { name: 'Beranda', url: '/' },
    { name: 'Blog',    url: '/blog/' }
  ];

  // Render helper
  const escape = (s) => String(s||'').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  }[m]));
  const render = (current) => {
    el.innerHTML =
      base.map(b => `<a href="${b.url}">${escape(b.name)}</a><span class="sep" aria-hidden="true">›</span>`).join('')
      + `<span aria-current="page">${escape(current || (atBlogIndex?'Blog':''))}</span>`;
  };

  if (atBlogIndex) {
    render('Blog');
    return;
  }

  // Halaman artikel: coba ambil H1 dulu, fallback dari feed.json bila perlu
  let title = document.querySelector('h1')?.textContent?.trim();
  if (title) return render(title);

  fetch('/blog/feed.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(feed => {
      const item = (feed.items || []).find(it => norm(it.url) === here);
      render(item?.title || decodeURIComponent(here.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')));
    })
    .catch(() => render(decodeURIComponent(here.split('/').filter(Boolean).pop()?.replace(/-/g, ' '))));
})();
