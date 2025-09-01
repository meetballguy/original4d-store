// scripts/build-wins.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "wins"); // sumber .md
const OUT_DIR = path.join(ROOT, "bukti");               // output html
const SITE_URL = (process.env.SITE_URL?.replace(/\/+$/, "") || "https://original4d.store");
const SITE_NAME = "Original4D";

// ===== utils =====
const toPosix = (p) => p.split(path.sep).join("/");
const slugify = (s) =>
  (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\- _]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}
const toISO = (d) => (d ? new Date(d).toISOString() : null);
function fmtID(dISO){
  if (!dISO) return "";
  try { return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(dISO)); }
  catch { return dISO; }
}
function absolutize(u){
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const p = u.startsWith("/") ? u : `/${u}`;
  return `${SITE_URL}${p}`;
}

// ===== TEMPLATES =====
function detailTemplate({
  title, description, canonical, dateISO, updatedISO,
  amount, member_mask, game, bodyHtml, proof_image
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc  = escapeHtml(description || "");
  const ogImg     = proof_image ? absolutize(proof_image) : `${SITE_URL}/assets/img/hero.webp`;

  // JSON-LD
  const ldBreadcrumb = {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      { "@type":"ListItem","position":1,"name":"Beranda","item":`${SITE_URL}/` },
      { "@type":"ListItem","position":2,"name":"Bukti Kemenangan","item":`${SITE_URL}/bukti/` },
      { "@type":"ListItem","position":3,"name":title,"item":canonical }
    ]
  };
  const ldArticle = {
    "@context":"https://schema.org",
    "@type":"Article",
    "mainEntityOfPage": { "@type":"WebPage", "@id": canonical },
    "headline": title,
    "datePublished": dateISO || undefined,
    "dateModified": (updatedISO || dateISO) || undefined,
    "author": { "@type":"Organization", "name": SITE_NAME },
    "publisher": {
      "@type":"Organization", "name": SITE_NAME,
      "logo": { "@type":"ImageObject", "url": `${SITE_URL}/assets/img/logo.png` }
    },
    "description": description || "",
    "image": [ ogImg ]
  };

  // meta bar (tampil di atas konten)
  const metaBits = [
    dateISO ? `<time datetime="${dateISO}">Tanggal: ${fmtID(dateISO)}</time>` : "",
    amount ? `<span>Menang: Rp ${Number(amount).toLocaleString("id-ID")}</span>` : "",
    member_mask ? `<span>Member: ${escapeHtml(member_mask)}</span>` : "",
    game ? `<span>Game: ${escapeHtml(game)}</span>` : "",
  ].filter(Boolean).join(" • ");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description || "")}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index,follow">
  <meta name="copyright" content="Original4D" />
  <meta name="author" content="Original4D" />
  <meta name="distribution" content="global" />
  <meta name="publisher" content="Original4D" />
  <meta name="geo.country" content="ID" />
  <meta name="tgn.nation" content="Indonesia" />
  <meta name="googlebot" content="index,follow" />
  <meta name="Googlebot-Image" content="follow, all" />
  <meta name="Scooter" content="follow, all" />
  <meta name="msnbot" content="follow, all" />
  <meta name="alexabot" content="follow, all" />
  <meta name="Slurp" content="follow, all" />
  <meta name="ZyBorg" content="follow, all" />
  <meta name="bingbot" content="follow, all" />
  <meta name="MSSmartTagsPreventParsing" content="true" />
  <meta name="audience" content="all" />
  <meta name="geo.region" content="ID-JK" />
  <meta name="geo.placename" content="Jakarta Special Capital Region" />
  <!-- Performance: preconnect/preload -->
  <link rel="preload" href="/assets/css/blog.css" as="style">

  <!-- Open Graph -->
  <meta property="og:locale" content="id_ID">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Original4D">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description || "")}">
  <meta property="og:url" content="${canonical}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ""}
  <meta property="article:published_time" content="${dateISO || ""}">
  <meta property="article:modified_time" content="${(updatedISO || dateISO) || ""}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description || "")}">
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}">` : ""}

  <!-- JSON-LD -->
  <script type="application/ld+json">${JSON.stringify(jsonLdBreadcrumb)}</script>
  <script type="application/ld+json">${JSON.stringify(jsonLdArticle)}</script>

  <link rel="icon" href="${SITE_URL}/assets/img/favicon.png" type="image/png">
  <link rel="stylesheet" href="/assets/css/blog.css">
  <link rel="alternate" type="application/json" href="/bukti/feed.json">
  <link rel="alternate" type="application/rss+xml" href="/bukti/feed.xml">
</head>
<body>
  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <a href="/bukti/">Bukti Kemenangan</a> › <strong>${escapeHtml(title)}</strong>
    </nav>

    <article class="post">
      <h1>${escapeHtml(title)}</h1>
      <div class="post-meta">
        ${dateISO ? `<time datetime="${dateISO}">Terbit: ${fmtID(dateISO)}</time>` : ""}
        ${updatedISO ? ` • <time datetime="${updatedISO}">Update: ${fmtID(updatedISO)}</time>` : ""}
      </div>
      <div class="post-body">
        ${bodyHtml}
      </div>
      <nav class="post-nav"><a href="/bukti/">← Artikel lain</a></nav>
    </article>
  </main>

  <!-- PARTIAL:FOOTER -->
</body>
</html>`;
}

  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <a href="/bukti/">Bukti Kemenangan</a> › <strong>${escapeHtml(title)}</strong>
    </nav>

    <article class="post">
      <h1>${safeTitle}</h1>

      <div class="post-meta">${metaBits}</div>

      ${proof_image ? `<figure class="win-proof"><img src="${escapeHtml(ogImg)}" alt="${safeTitle}" loading="lazy" decoding="async"></figure>` : ""}

      ${safeDesc ? `<p>${safeDesc}</p>` : ""}

      <div class="post-body">
        ${bodyHtml}
      </div>

      <nav class="post-nav"><a href="/bukti/">← Kembali ke daftar</a></nav>
    </article>
  </main>

  <!-- PARTIAL:FOOTER -->
</body>
</html>`;
}

function indexTemplate({ items }) {
  const safeTitle = "Bukti Kemenangan Member";
  const safeDesc  = "Kumpulan bukti kemenangan member Original4D (screenshot & ringkasan). ID dimasking demi privasi.";

  const ldCollection = {
    "@context":"https://schema.org",
    "@type":"CollectionPage",
    "name": safeTitle,
    "url": `${SITE_URL}/bukti/`,
    "about": "Bukti kemenangan member"
  };
  const ldItemList = {
    "@context":"https://schema.org",
    "@type":"ItemList",
    "itemListElement": items.map((it, i) => ({
      "@type":"ListItem",
      "position": i + 1,
      "url": `${SITE_URL}${it.url}`,
      "item": {
        "@type":"CreativeWork",
        "name": it.title,
        "datePublished": it.dateISO || undefined,
        "description": it.description || "",
        ...(it.proof_image ? { "image": { "@type":"ImageObject", "url": absolutize(it.proof_image) } } : {})
      }
    }))
  };

  const cards = items.map(it => {
    const img = it.proof_image ? absolutize(it.proof_image) : "";
    const amt = it.amount ? `Rp ${Number(it.amount).toLocaleString("id-ID")}` : "";
    const sub = [
      it.dateISO ? fmtID(it.dateISO) : "",
      amt,
      it.member_mask || ""
    ].filter(Boolean).join(" • ");

    return `
      <a class="card-win" href="${it.url}">
        <div class="thumb">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(it.title)}" loading="lazy" decoding="async">` : ""}</div>
        <div class="meta">
          <h3>${escapeHtml(it.title)}</h3>
          <div class="sub">${escapeHtml(sub)}</div>
        </div>
      </a>
    `;
  }).join("");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description || "")}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index,follow">
  <meta name="copyright" content="Original4D" />
  <meta name="author" content="Original4D" />
  <meta name="distribution" content="global" />
  <meta name="publisher" content="Original4D" />
  <meta name="geo.country" content="ID" />
  <meta name="tgn.nation" content="Indonesia" />
  <meta name="googlebot" content="index,follow" />
  <meta name="Googlebot-Image" content="follow, all" />
  <meta name="Scooter" content="follow, all" />
  <meta name="msnbot" content="follow, all" />
  <meta name="alexabot" content="follow, all" />
  <meta name="Slurp" content="follow, all" />
  <meta name="ZyBorg" content="follow, all" />
  <meta name="bingbot" content="follow, all" />
  <meta name="MSSmartTagsPreventParsing" content="true" />
  <meta name="audience" content="all" />
  <meta name="geo.region" content="ID-JK" />
  <meta name="geo.placename" content="Jakarta Special Capital Region" />
  <!-- Performance: preconnect/preload -->
  <link rel="preload" href="/assets/css/blog.css" as="style">

  <!-- Open Graph -->
  <meta property="og:locale" content="id_ID">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Original4D">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description || "")}">
  <meta property="og:url" content="${canonical}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ""}
  <meta property="article:published_time" content="${dateISO || ""}">
  <meta property="article:modified_time" content="${(updatedISO || dateISO) || ""}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description || "")}">
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}">` : ""}

  <!-- JSON-LD -->
  <script type="application/ld+json">${JSON.stringify(jsonLdBreadcrumb)}</script>
  <script type="application/ld+json">${JSON.stringify(jsonLdArticle)}</script>

  <link rel="icon" href="${SITE_URL}/assets/img/favicon.png" type="image/png">
  <link rel="stylesheet" href="/assets/css/blog.css">
  <link rel="alternate" type="application/json" href="/bukti/feed.json">
  <link rel="alternate" type="application/rss+xml" href="/bukti/feed.xml">
</head>
<body>
  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <strong>Bukti Kemenangan</strong>
    </nav>

    <article class="post">
      <h1>${safeTitle}</h1>
      <p>${safeDesc}</p>
      <div class="grid-wins">
        ${cards}
      </div>
    </article>
  </main>

  <!-- PARTIAL:FOOTER -->
</body>
</html>`;
}

// ===== Build =====
async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

async function buildOne(mdPath){
  const raw = await fs.readFile(mdPath, "utf8");
  const { data: fm, content } = matter(raw);
  if (fm.draft) return null;

  const title = fm.title || "Bukti Kemenangan";
  const description = fm.description || "";
  const baseSlug = fm.slug ? slugify(fm.slug) : slugify(path.basename(mdPath, ".md"));
  const outDir = path.join(OUT_DIR, baseSlug);
  const canonical = `${SITE_URL}/bukti/${baseSlug}/`;

  const dateISO = toISO(fm.date);
  const updatedISO = toISO(fm.updated);
  const amount = fm.amount || null;
  const member_mask = fm.member_mask || null;
  const game = fm.game || null;
  const proof_image = fm.proof_image || ""; // dipakai OG/Twitter + figure

  const bodyHtml = marked.parse(content || "");

  const html = detailTemplate({
    title, description, canonical, dateISO, updatedISO,
    amount, member_mask, game, bodyHtml, proof_image
  });

  await ensureDir(outDir);
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");

  return {
    title,
    url: `/bukti/${baseSlug}/`,
    dateISO,
    amount,
    member_mask,
    game,
    description,
    proof_image
  };
}

async function buildIndex(items){
  const sorted = items.slice().sort((a,b) => (b.dateISO || "").localeCompare(a.dateISO || ""));
  const html = indexTemplate({ items: sorted });
  await ensureDir(OUT_DIR);
  await fs.writeFile(path.join(OUT_DIR, "index.html"), html, "utf8");
}

async function main(){
  try { await fs.access(CONTENT_DIR); } catch { await ensureDir(CONTENT_DIR); }

  const files = (await fs.readdir(CONTENT_DIR))
    .filter(f => f.endsWith(".md"))
    .map(f => path.join(CONTENT_DIR, f));

  const items = [];
  for (const f of files){
    const r = await buildOne(f);
    if (r) items.push(r);
  }

  await buildIndex(items);
  console.log(`[build-wins] Rendered ${items.length} item(s) from ${toPosix(path.relative(ROOT, CONTENT_DIR))}`);
}

main().catch(err => { console.error(err); process.exit(1); });

