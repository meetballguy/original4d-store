(async function(){
  const listEl = document.getElementById('list');
  const countEl = document.getElementById('count');
  const btnMore = document.getElementById('loadMore');

  // Ambil sitemap same-origin
  let xml;
  try {
    const res = await fetch('/sitemap.xml', { cache: 'no-store' });
    xml = await res.text();
  } catch (e) {
    listEl.innerHTML = '<article class="card">Gagal memuat sitemap.</article>';
    countEl.textContent = '0 artikel';
    return;
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const urls = Array.from(doc.querySelectorAll('urlset > url')).map(n => {
    const loc = n.querySelector('loc')?.textContent?.trim() || '';
    const last = n.querySelector('lastmod')?.textContent?.trim() || '';
    let pathname = '';
    try { pathname = new URL(loc).pathname; } catch { pathname = loc; }
    // normalisasi trailing slash
    if (!pathname.endsWith('/')) pathname = pathname + '/';
    return { loc, pathname, lastmod: last };
  });

  // Ambil SEMUA artikel di /blog/news/ tanpa peduli domain di <loc>
  const posts = urls
    .filter(x => /^\/blog\/news\/[^/]+\/$/i.test(x.pathname))
    .sort((a,b) => new Date(b.lastmod||0) - new Date(a.lastmod||0));

  // Render
  const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeStyle:'short' });
  const toTitle = s => s.replace(/\/+$/,'').split('/').pop().replace(/-/g,' ')
                        .replace(/\b\w/g, m => m.toUpperCase());

  listEl.innerHTML = '';
  const PAGE = 20;
  let shown = 0;

  function renderMore(){
    const slice = posts.slice(shown, shown + PAGE);
    for (const p of slice){
      const aPath = p.pathname; // pakai path internal supaya pasti same-origin
      const title = toTitle(aPath);
      const dateTxt = p.lastmod ? fmt.format(new Date(p.lastmod)) : '—';

      const art = document.createElement('article');
      art.className = 'card';
      art.innerHTML = `
        <h2><a href="${aPath}">${title}</a></h2>
        <div class="meta">${dateTxt} • ${aPath}</div>
        <p class="desc">Baca selengkapnya: ${title}.</p>
      `;
      listEl.appendChild(art);
    }
    shown += slice.length;
    countEl.textContent = `${posts.length} artikel`;
    btnMore.hidden = shown >= posts.length;
  }

  if (posts.length === 0){
    listEl.innerHTML = '<article class="card">Belum ada artikel.</article>';
    countEl.textContent = '0 artikel';
    return;
  }

  renderMore();
  btnMore?.addEventListener('click', renderMore);

  // Pencarian sederhana
  const q = document.getElementById('q');
  q?.addEventListener('input', e => {
    const term = e.target.value.toLowerCase().trim();
    listEl.innerHTML = '';
    shown = 0;
    if (!term){
      renderMore();
      return;
    }
    const filtered = posts.filter(p => {
      const title = toTitle(p.pathname).toLowerCase();
      return title.includes(term) || p.pathname.toLowerCase().includes(term);
    });
    if (filtered.length === 0){
      listEl.innerHTML = '<article class="card">Tidak ada hasil.</article>';
      countEl.textContent = '0 artikel';
      btnMore.hidden = true;
      return;
    }
    // render semua hasil filter
    const fmt2 = new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'});
    for (const p of filtered){
      const aPath = p.pathname;
      const title = toTitle(aPath);
      const dateTxt = p.lastmod ? fmt2.format(new Date(p.lastmod)) : '—';
      const art = document.createElement('article');
      art.className = 'card';
      art.innerHTML = `
        <h2><a href="${aPath}">${title}</a></h2>
        <div class="meta">${dateTxt} • ${aPath}</div>
        <p class="desc">Baca selengkapnya: ${title}.</p>
      `;
      listEl.appendChild(art);
    }
    countEl.textContent = `${filtered.length} artikel`;
    btnMore.hidden = true;
  });
})();
