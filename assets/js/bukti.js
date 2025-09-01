// Bukti kemenangan listing
(async function () {
  const listEl   = document.getElementById('list');
  const countEl  = document.getElementById('count');
  const btnMore  = document.getElementById('loadMore');
  const qInput   = document.getElementById('q');
  if (!listEl || !countEl) return;

  const esc = (s)=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const normPath=(u)=>{let p='';try{p=new URL(u,location.origin).pathname;}catch{p=u||'';}return p.endsWith('/')?p:(p+'/');};
  const toTitle=(p)=>p.replace(/\/+$/,'').split('/').pop().replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
  const fmtDate=(iso)=>{if(!iso)return'';return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium'}).format(new Date(iso));};

  const [sx,fj]=await Promise.allSettled([
    fetch('/sitemap.xml',{cache:'no-store'}),
    fetch('/blog/feed.json',{cache:'no-store'})
  ]);
  const sitemapXML=sx.status==='fulfilled'?await sx.value.text():'';
  const feedJSON=(fj.status==='fulfilled'&&fj.value.ok)?await fj.value.json():null;
  if(!sitemapXML) return;

  const doc=new DOMParser().parseFromString(sitemapXML,'application/xml');
  const urls=Array.from(doc.querySelectorAll('urlset > url')).map(n=>{
    const loc=n.querySelector('loc')?.textContent||'';const last=n.querySelector('lastmod')?.textContent||'';const path=normPath(loc);
    return{loc,pathname:path,lastmod:last};
  });
  const wins=urls.filter(x=>/^\/bukti\/[^/]+\/$/i.test(x.pathname)&&x.pathname!=='/bukti/');

  const feedMap=new Map();
  if(feedJSON&&Array.isArray(feedJSON.items)){
    for(const it of feedJSON.items){
      const p=normPath(it.url||'');
      feedMap.set(p,{title:it.title,desc:it.description||it.content_text,date:it.date_published||it.dateModified});
    }
  }

  const items=wins.map(p=>{
    const meta=feedMap.get(p.pathname)||{};
    return{
      url:p.pathname,
      title:meta.title||toTitle(p.pathname),
      desc:meta.desc||'',
      dateISO:meta.date||p.lastmod
    };
  }).sort((a,b)=>new Date(b.dateISO||0)-new Date(a.dateISO||0));

  let shown=0;const PAGE=20;
  function renderMore(){
    const slice=items.slice(shown,shown+PAGE);
    listEl.insertAdjacentHTML('beforeend', slice.map(it=>
      `<article class="card">
         <h2><a href="${esc(it.url)}">${esc(it.title)}</a></h2>
         <p class="desc">${esc(it.desc||'')}</p>
         ${it.dateISO?`<time datetime="${esc(it.dateISO)}">${esc(fmtDate(it.dateISO))}</time>`:''}
       </article>`
    ).join(''));
    shown+=slice.length;
    countEl.textContent=`${items.length} bukti`;
    if(btnMore) btnMore.hidden=shown>=items.length;
  }
  renderMore();
  btnMore?.addEventListener('click',renderMore);

  qInput?.addEventListener('input',e=>{
    const term=(e.target.value||'').toLowerCase();
    listEl.innerHTML=''; shown=0;
    const filtered=items.filter(it=>
      it.title.toLowerCase().includes(term)||
      (it.desc||'').toLowerCase().includes(term)
    );
    filtered.slice(0,PAGE).forEach(it=>{
      listEl.insertAdjacentHTML('beforeend',
        `<article class="card"><h2><a href="${esc(it.url)}">${esc(it.title)}</a></h2></article>`
      );
    });
    countEl.textContent=`${filtered.length} bukti`;
  });
})();
