// /assets/js/blog.js
(async function () {
  const listEl   = document.getElementById('list');
  const countEl  = document.getElementById('count');
  const btnMore  = document.getElementById('loadMore');
  const qInput   = document.getElementById('q');

  // ==== helpers ====
  const esc = (s) => String(s || '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'
  }[m]));

  const normPath = (u) => {
    let p = '';
    try { p = new URL(u, location.origin).pathname; } catch { p = u || ''; }
    return p.endsWith('/') ? p : (p + '/');
  };

  const toTitleFromSlug = (p) =>
    p.replace(/\/+$/,'').split('/').pop()
     .replace(/-/g,' ')
     .replace(/\b\w/g, m => m.toUpperCase());

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeStyle:'short' }).format(d);
    } catch { return iso; }
  };

  // ==== fetch sitemap & feed (parallel) ====
  let sitemapXML = '';
  let feedJSON = null;

  try {
    const [sx, fj] = await Promise.allSettled([
      fetch('/sitemap.xml', { cache: 'no-store' }),
      fetch('/blog/feed.json', { cache: 'no-store' })
    ]);

    if (sx.status === 'fulfilled') sitemapXML = await sx.value.text();
    if (fj.status === 'fulfilled' && fj.value.ok) feedJSON = await fj.value.json();
  } catch {
    // biarkan jadi fallback di bawah
  }

  if (!sitemapXML) {
    listEl.innerHTML = '<article class="card">Gagal memuat sitemap.</article>';
    countEl.textContent = '0 artikel';
    return;
  }

  // ==== parse sitemap ====
  const doc  = new DOMParser().parseFromString(sitemapXML, 'application/xml');
  const urls = Array.from(doc.querySelectorAll('urlset > url')).map(n => {
    const loc  = n.querySelector('loc')?.textContent?.trim() || '';
    const last = n.querySelector('lastmod')?.textContent?.trim() || '';
    const path = normPath(loc);
    return { loc, pathname: path, lastmod: last };
  });

  // Ambil artikel /blog/news/:slug/
  const postsFromSitemap = urls
    .filter(x => /^\/blog\/news\/[^/]+\/$/i.test(x.pathname))
    .sort((a, b) => new Date(b.lastmod || 0) - new Date(a.lastmod || 0));

  if (postsFromSitemap.length === 0) {
    listEl.innerHTML = '<article class="card">Belum ada artikel.</article>';
    countEl.textContent = '0 artikel';
    return;
  }

  // ==== siapkan feed map (optional) ====
  const feedMap = new Map();
  if (feedJSON && Array.isArray(feedJSON.items)) {
    for (const it of feedJSON.items) {
      const p = normPath(it.url || '');
      feedMap.set(p, {
        title: it.title || '',
        description: it.description || '',
        datePublished: it.datePublished || '',
        dateModified: it.dateModified || ''
      });
    }
  }

  // ==== gabungkan data (sitemap + feed) ====
  const ENRICHED = postsFromSitemap.map(p => {
    const meta = feedMap.get(p.pathname) || {};
    const title = meta.title || toTitleFromSlug(p.pathname);
    const description = meta.description || `Baca selengkapnya: ${title}.`;
    // Prioritas tanggal: feed.dateModified > feed.datePublished > sitemap.lastmod
    const dateISO = meta.dateModified || meta.datePublished || p.lastmod || '';
    return {
      url: p.pathname,          // same-origin path
      path: p.pathname,
      title,
      description,
      dateISO
    };
  }).sort((a, b) =>
    new Date(b.dateISO || 0) - new Date(a.dateISO || 0)
  );

  // ==== render list + paging ====
  const PAGE = 20;
  let shown = 0;
  let CURRENT = ENRICHED.slice(); // akan diubah saat search

  const renderCard = (it) => {
    const dateTxt = fmtDate(it.dateISO);
    const timeAttr = it.dateISO ? ` datetime="${esc(it.dateISO)}"` : '';
    const lastUpdatedBlock = it.dateISO
      ? `<div class="last-updated" aria-label="Terakhir diperbarui">
           <span class="dot" aria-hidden="true"></span>
           <span>Terakhir diperbarui <time${timeAttr}>${esc(dateTxt)}</time></span>
         </div>`
      : '';

    return `
      <article class="card">
        <h2><a href="${esc(it.url)}" rel="noopener">${esc(it.title)}</a></h2>
        ${it.description ? `<p class="desc">${esc(it.description)}</p>` : ``}
        <p class="meta">${esc(it.path)}</p>
        ${lastUpdatedBlock}
      </article>
    `;
  };

  function renderMore () {
    const slice = CURRENT.slice(shown, shown + PAGE);
    const html = slice.map(renderCard).join('');
    if (shown === 0) listEl.innerHTML = html;
    else listEl.insertAdjacentHTML('beforeend', html);

    shown += slice.length;
    countEl.textContent = `${CURRENT.length} artikel`;
    btnMore.hidden = shown >= CURRENT.length;
  }

  renderMore();
  btnMore?.addEventListener('click', renderMore);

  // ==== pencarian (judul + deskripsi + path) ====
  qInput?.addEventListener('input', (e) => {
    const term = (e.target.value || '').toLowerCase().trim();
    shown = 0;

    if (!term) {
      CURRENT = ENRICHED.slice();
      listEl.innerHTML = '';
      renderMore();
      return;
    }

    CURRENT = ENRICHED.filter(it =>
      (it.title || '').toLowerCase().includes(term) ||
      (it.description || '').toLowerCase().includes(term) ||
      (it.path || '').toLowerCase().includes(term)
    );

    listEl.innerHTML = CURRENT.length
      ? ''
      : '<article class="card">Tidak ada hasil.</article>';

    if (CURRENT.length) renderMore();
    else {
      countEl.textContent = '0 artikel';
      btnMore.hidden = true;
    }
  });
})();
