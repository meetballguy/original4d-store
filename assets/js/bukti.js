// /assets/js/bukti.js — Bukti kemenangan listing (fix skeleton, debounce, robust)
(async function () {
  const listEl   = document.getElementById('list');
  const countEl  = document.getElementById('count');
  const btnMore  = document.getElementById('loadMore');
  const qInput   = document.getElementById('q');
  if (!listEl || !countEl) return;

  // ===== utils =====
  const esc = (s)=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const normPath=(u)=>{let p='';try{p=new URL(u,location.origin).pathname;}catch{p=u||'';}return p.endsWith('/')?p:(p+'/');};
  const toTitle=(p)=>p.replace(/\/+$/,'').split('/').pop().replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
  const fmtDate=(iso)=>{ if(!iso) return ''; try { return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium'}).format(new Date(iso)); } catch { return iso; } };
  const stripHtml=(h)=>(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

  // skeleton helpers
  function hideSkeleton() {
    document.documentElement.classList.remove('is-loading');
    document.body.classList.remove('is-loading');
    document.querySelectorAll('.skeleton,[data-skeleton]').forEach(n => n.remove());
  }
  function setBusy(el, busy) {
    el?.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (busy) el?.classList.add('loading'); else el?.classList.remove('loading');
  }

  // ===== fetch sitemap & feed =====
  let sitemapXML = '';
  let feedJSON   = null;
  setBusy(listEl, true);

  try {
    const [sx, fj] = await Promise.allSettled([
      fetch('/sitemap.xml', { cache: 'no-store' }),
      fetch('/bukti/feed.json', { cache: 'no-store' })
    ]);
    if (sx.status === 'fulfilled') sitemapXML = await sx.value.text();
    if (fj.status === 'fulfilled' && fj.value.ok) feedJSON = await fj.value.json();
  } catch {
    // ignore — fallback handled below
  } finally {
    // apapun hasilnya, matikan skeleton
    hideSkeleton();
    setBusy(listEl, false);
  }

  if (!sitemapXML) {
    listEl.innerHTML = '<article class="card">Gagal memuat data. Coba muat ulang.</article>';
    countEl.textContent = '0 bukti';
    btnMore && (btnMore.hidden = true);
    return;
  }

  // ===== parse sitemap =====
  const doc  = new DOMParser().parseFromString(sitemapXML, 'application/xml');
  const urls = Array.from(doc.querySelectorAll('urlset > url')).map(n => {
    const loc  = n.querySelector('loc')?.textContent?.trim() || '';
    const last = n.querySelector('lastmod')?.textContent?.trim() || '';
    const path = normPath(loc);
    return { loc, pathname: path, lastmod: last };
  });

  // hanya halaman detail bukti: /bukti/:slug/
  const winsFromSitemap = urls
    .filter(x => /^\/bukti\/[^/]+\/$/i.test(x.pathname) && x.pathname !== '/bukti/')
    .sort((a,b) => new Date(b.lastmod||0) - new Date(a.lastmod||0));

  if (winsFromSitemap.length === 0) {
    listEl.innerHTML = '<article class="card">Belum ada bukti.</article>';
    countEl.textContent = '0 bukti';
    btnMore && (btnMore.hidden = true);
    return;
  }

  // ===== map dari feed (judul/desc/tanggal lebih akurat) =====
  const feedMap = new Map();
  if (feedJSON && Array.isArray(feedJSON.items)) {
    for (const it of feedJSON.items) {
      const p = normPath(it.url || '');
      const title = it.title || '';
      const desc  = it.summary || it.description || it.content_text || stripHtml(it.content_html) || '';
      const date  = it.date_modified || it.date_published || it.datePublished || it.dateModified || '';
      feedMap.set(p, { title, desc, dateISO: date });
    }
  }

  // ===== gabungkan =====
  const ITEMS = winsFromSitemap.map(p => {
    const meta = feedMap.get(p.pathname) || {};
    return {
      url: p.pathname,
      title: meta.title || toTitle(p.pathname),
      desc: meta.desc || '',
      dateISO: meta.dateISO || p.lastmod || ''
    };
  }).sort((a,b) => new Date(b.dateISO||0) - new Date(a.dateISO||0));

  // ===== render & interaksi =====
  const PAGE = 20;
  let shown = 0;
  let CURRENT = ITEMS.slice();

  function renderCard(it) {
    const dateTxt = fmtDate(it.dateISO);
    return `
      <article class="card">
        <h2><a href="${esc(it.url)}" rel="noopener">${esc(it.title)}</a></h2>
        ${it.desc ? `<p class="desc">${esc(it.desc)}</p>` : ``}
        ${it.dateISO ? `<time datetime="${esc(it.dateISO)}">${esc(dateTxt)}</time>` : ``}
      </article>
    `;
  }

  function renderMore() {
    const slice = CURRENT.slice(shown, shown + PAGE);
    if (shown === 0) listEl.innerHTML = '';
    listEl.insertAdjacentHTML('beforeend', slice.map(renderCard).join(''));
    shown += slice.length;
    countEl.textContent = `${CURRENT.length} bukti`;
    btnMore && (btnMore.hidden = shown >= CURRENT.length);
  }

  // batch pertama
  renderMore();

  // tombol muat lagi
  btnMore?.addEventListener('click', () => {
    setBusy(btnMore, true);
    renderMore();
    setBusy(btnMore, false);
  });

  // pencarian (debounce 200ms)
  let t = null;
  qInput?.addEventListener('input', (e) => {
    const term = (e.target.value || '').toLowerCase().trim();
    clearTimeout(t);
    t = setTimeout(() => {
      shown = 0;
      if (!term) {
        CURRENT = ITEMS.slice();
      } else {
        CURRENT = ITEMS.filter(it =>
          (it.title || '').toLowerCase().includes(term) ||
          (it.desc  || '').toLowerCase().includes(term) ||
          (it.url   || '').toLowerCase().includes(term)
        );
      }
      listEl.innerHTML = CURRENT.length ? '' : '<article class="card">Tidak ada hasil.</article>';
      btnMore && (btnMore.hidden = CURRENT.length <= PAGE);
      if (CURRENT.length) renderMore(); else countEl.textContent = '0 bukti';
    }, 200);
  });
})();
