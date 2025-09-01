// /assets/js/home-wins.js
(async () => {
  const wrap = document.getElementById('latestWins');
  if (!wrap) return;

  const fmtID = (iso) => {
    try { return new Intl.DateTimeFormat('id-ID', { dateStyle:'medium' }).format(new Date(iso)); }
    catch { return ''; }
  };

  const esc = (s) => String(s||'').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  // render helper
  const card = (it) => {
    const img = (Array.isArray(it.image) ? it.image[0] : (it.image && it.image.url)) || '';
    const dateISO = it.date_modified || it.date_published || it.dateISO || '';
    const amount = it.amount ? `Rp ${Number(it.amount).toLocaleString('id-ID')}` : '';
    const desc = it.description || it.summary || '';

    return `
      <article class="card" role="listitem">
        ${img ? `<figure class="media" style="--ratio:16/9;"><img src="${esc(img)}" alt="${esc(it.title||'Bukti kemenangan')}" loading="lazy" decoding="async"></figure>` : ``}
        <h3 style="margin:8px 0 0"><a href="${esc(it.url)}">${esc(it.title||'Bukti Kemenangan')}</a></h3>
        <div class="meta">${dateISO ? fmtID(dateISO) : ''}${amount ? ` • <strong>${amount}</strong>` : ''}</div>
        ${desc ? `<p class="desc">${esc(desc.length > 140 ? (desc.slice(0,140)+'…') : desc)}</p>` : ``}
        <p><a class="btn" href="${esc(it.url)}">Lihat Bukti</a></p>
      </article>
    `;
  };

  // 1) Coba ambil feed bukti
  try {
    const res = await fetch('/bukti/feed.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('feed bukti tidak tersedia');
    const feed = await res.json();
    const items = (feed.items || []).slice(0, 4);
    if (!items.length) {
      wrap.innerHTML = '<p class="desc">Belum ada bukti.</p>';
      return;
    }
    wrap.innerHTML = items.map(card).join('');
    return;
  } catch (_) {
    // lanjut ke fallback
  }

  // 2) Fallback: parse sitemap untuk ambil /bukti/:slug/
  try {
    const sx  = await fetch('/sitemap.xml', { cache: 'no-store' });
    const xml = await sx.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const urls = Array.from(doc.querySelectorAll('urlset > url')).map(n => ({
      loc:  n.querySelector('loc')?.textContent?.trim() || '',
      last: n.querySelector('lastmod')?.textContent?.trim() || ''
    }));

    const wins = urls
      .filter(u => {
        const path = new URL(u.loc, location.origin).pathname;
        return /^\/bukti\/[^/]+\/$/i.test(path);
      })
      .sort((a,b) => new Date(b.last||0) - new Date(a.last||0))
      .slice(0,4);

    if (!wins.length) {
      wrap.innerHTML = '<p class="desc">Belum ada bukti.</p>';
      return;
    }

    wrap.innerHTML = wins.map(u => {
      const p = new URL(u.loc, location.origin).pathname;
      const title = p.replace(/\/+$/,'').split('/').pop().replace(/-/g,' ')
        .replace(/\b\w/g, m => m.toUpperCase());
      return `
        <article class="card" role="listitem">
          <h3 style="margin:8px 0 0"><a href="${esc(p)}">${esc(title)}</a></h3>
          <div class="meta">${u.last ? fmtID(u.last) : ''}</div>
          <p><a class="btn" href="${esc(p)}">Lihat Bukti</a></p>
        </article>
      `;
    }).join('');
  } catch {
    wrap.innerHTML = '<p class="desc">Gagal memuat bukti terbaru.</p>';
  }
})();
