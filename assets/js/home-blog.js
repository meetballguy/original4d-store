    (async () => {
      const wrap = document.getElementById('latest');
      if (!wrap) return;
      try {
        const res = await fetch('/blog/feed.json', { cache:'no-store' });
        const feed = await res.json();
        const items = (feed.items || []).slice(0, 4);
        if (!items.length) {
          wrap.innerHTML = '<p class="desc">Belum ada artikel.</p>';
          return;
        }
        const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle:'medium' });
        wrap.innerHTML = items.map(i => {
          const date = i.date_modified || i.date_published || Date.now();
          const summary = (i.summary || '').trim();
          const short = summary.length > 140 ? summary.slice(0,140) + '…' : summary;
          return `
            <article class="card" role="listitem">
              <h3 style="margin:0"><a href="${i.url}">${i.title}</a></h3>
              <div class="meta">${fmt.format(new Date(date))}</div>
              <p class="desc">${short || 'Baca selengkapnya.'}</p>
              <p><a class="btn" href="${i.url}">Baca</a></p>
            </article>
          `;
        }).join('');
      } catch(e) {
        wrap.innerHTML = '<p class="desc">Gagal memuat artikel terbaru.</p>';
      }
    })();
