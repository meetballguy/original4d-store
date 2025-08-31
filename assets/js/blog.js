  (function(){
    const SITEMAP_URL = '/sitemap.xml';
    const NEWS_PREFIX = location.origin + '/blog/news/';
    const MAX_FETCH = 30;        // ambil maksimal 30 posting dari sitemap
    const PAGE_SIZE = 10;        // tampilkan per 10, sisanya via "Muat Lebih"
    const CONCURRENCY = 6;       // batasi permintaan paralel

    const $list = document.getElementById('list');
    const $count = document.getElementById('count');
    const $loadMore = document.getElementById('loadMore');
    const $q = document.getElementById('q');

    let ALL = [];        // semua item {url, lastmod, title, desc}
    let VISIBLE = [];    // item yang sedang ditampilkan (setelah filter)
    let page = 0;

    // Helpers
    const fmtDate = (s) => {
      try{
        const d = new Date(s);
        return d.toLocaleDateString('id-ID', { year:'numeric', month:'long', day:'numeric' });
      }catch(e){ return s || ''; }
    };

    const getSlugTitle = (url) => {
      const p = new URL(url).pathname.split('/').pop().replace(/\.html?$/,'');
      return p.replace(/[-_]+/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    async function fetchText(url){
      const res = await fetch(url, { credentials:'same-origin' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      return res.text();
    }

    function parseArticleMeta(html){
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const get = (sel, attr) => {
        const el = doc.querySelector(sel);
        return el ? (attr ? el.getAttribute(attr) : (el.textContent||'')).trim() : '';
      };
      const ogt  = get('meta[property="og:title"]','content');
      const tt   = doc.title ? doc.title.trim() : '';
      const desc = get('meta[name="description"]','content') || get('meta[property="og:description"]','content');
      const artDate = get('meta[property="article:published_time"]','content');
      return {
        title: ogt || tt || '',
        desc: desc || '',
        pub:  artDate || ''
      };
    }

    async function fetchMetaFor(url){
      try{
        const html = await fetchText(url);
        const meta = parseArticleMeta(html);
        if(!meta.title) meta.title = getSlugTitle(url);
        return meta;
      }catch(e){
        return { title: getSlugTitle(url), desc: '', pub: '' };
      }
    }

    async function queueMap(items, worker, concurrency){
      const out = new Array(items.length);
      let i = 0;
      const runners = new Array(concurrency).fill(0).map(async () => {
        while (i < items.length){
          const cur = i++;
          out[cur] = await worker(items[cur], cur);
        }
      });
      await Promise.all(runners);
      return out;
    }

    function renderReset(){
      $list.innerHTML = '';
      page = 0;
    }

    function renderAppend(chunk){
      const frag = document.createDocumentFragment();
      chunk.forEach(item => {
        const a = document.createElement('article');
        a.className = 'card';
        a.innerHTML = `
          <h2><a href="${item.url}">${escapeHtml(item.title)}</a></h2>
          <div class="meta">${fmtDate(item.lastmod || item.pub)} • <span>${new URL(item.url).pathname}</span></div>
          <p class="desc">${escapeHtml(item.desc || '')}</p>
        `;
        frag.appendChild(a);
      });
      $list.appendChild(frag);
    }

    function escapeHtml(s){
      return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    function applyFilter(){
      const q = ($q.value || '').toLowerCase().trim();
      if(!q){
        VISIBLE = [...ALL];
      }else{
        VISIBLE = ALL.filter(x =>
          (x.title && x.title.toLowerCase().includes(q)) ||
          (x.desc  && x.desc.toLowerCase().includes(q))
        );
      }
      renderReset();
      loadNextPage();
      $count.textContent = `${VISIBLE.length} artikel`;
      $loadMore.hidden = VISIBLE.length <= PAGE_SIZE;
    }

    function loadNextPage(){
      const start = page * PAGE_SIZE;
      const end   = Math.min(start + PAGE_SIZE, VISIBLE.length);
      if(start >= end) return;
      renderAppend(VISIBLE.slice(start, end));
      page++;
      $loadMore.hidden = (page * PAGE_SIZE) >= VISIBLE.length;
    }

    async function init(){
      try{
        // 1) Ambil sitemap & filter URL /blog/news/
        const xmlTxt = await fetchText(SITEMAP_URL);
        const xml    = new DOMParser().parseFromString(xmlTxt, 'application/xml');
        const urls   = Array.from(xml.querySelectorAll('url'))
          .map(u => ({
            url: u.querySelector('loc')?.textContent?.trim(),
            lastmod: u.querySelector('lastmod')?.textContent?.trim() || ''
          }))
          .filter(u => u.url && u.url.startsWith(NEWS_PREFIX))
          .sort((a,b) => new Date(b.lastmod||0) - new Date(a.lastmod||0))
          .slice(0, MAX_FETCH);

        if(urls.length === 0){
          $list.innerHTML = `<div class="empty">Belum ada artikel di <code>/blog/news/</code> yang terdaftar di <code>sitemap.xml</code>. Tambahkan URL artikel baru ke sitemap untuk memunculkan di sini.</div>`;
          $count.textContent = '0 artikel';
          return;
        }

        // 2) Ambil meta tiap artikel (batasi concurrency)
        const metas = await queueMap(urls, async (u) => {
          const meta = await fetchMetaFor(u.url);
          return { ...u, title: meta.title, desc: meta.desc, pub: meta.pub };
        }, CONCURRENCY);

        ALL = metas;
        applyFilter(); // initial render
      }catch(e){
        console.error(e);
        $list.innerHTML = `<div class="empty">Gagal memuat daftar artikel. Pastikan <code>/sitemap.xml</code> dapat diakses.</div>`;
        $count.textContent = '—';
      }
    }

    $loadMore.addEventListener('click', loadNextPage);
    $q.addEventListener('input', () => { applyFilter(); });

    init();
  })();
