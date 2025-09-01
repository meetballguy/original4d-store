// scripts/build-wins.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "wins");
const OUT_DIR = path.join(ROOT, "bukti");
const SITE_URL = (process.env.SITE_URL?.replace(/\/+$/, "") || "https://original4d.store");
const SITE_NAME = "Original4D";

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
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}
const toISO = (d) => (d ? new Date(d).toISOString() : null);
const fmtID = (dISO) => dISO
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(dISO))
  : "";

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

function jsonLdWinItem(item) {
  // gunakan CreativeWork + ImageObject yang paling aman/generic
  const obj = {
    "@type": "CreativeWork",
    "name": item.title,
    "datePublished": item.dateISO || undefined,
    "about": item.game || undefined,
    "description": item.description || undefined,
  };
  if (item.proof_image) {
    obj.image = { "@type": "ImageObject", "url": item.proof_image };
  }
  // metadata privat tidak dimasukkan (member_mask & amount bisa dipakai di name/description)
  return obj;
}

// ---------- Templates ----------
function winDetailTemplate({ title, canonical, dateISO, amount, member_mask, game, description, bodyHtml, proof_image }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || "");
  const ldArticle = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": safeTitle,
    "url": canonical,
  };
  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Beranda", "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "Bukti Kemenangan", "item": `${SITE_URL}/bukti/` },
      { "@type": "ListItem", "position": 3, "name": safeTitle, "item": canonical }
    ]
  };

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${safeDesc}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonical}">

  <meta property="og:locale" content="id_ID">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${canonical}">
  ${proof_image ? `<meta property="og:image" content="${proof_image}">` : ""}

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  ${proof_image ? `<meta name="twitter:image" content="${proof_image}">` : ""}

  <script type="application/ld+json">${JSON.stringify(ldBreadcrumb)}</script>
  <script type="application/ld+json">${JSON.stringify(ldArticle)}</script>

  <link rel="icon" href="${SITE_URL}/assets/img/favicon.png" type="image/png">
  <link rel="preload" href="/assets/css/blog.css" as="style">
  <link rel="stylesheet" href="/assets/css/blog.css">
</head>
<body>
  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <a href="/bukti/">Bukti Kemenangan</a> › <strong>${safeTitle}</strong>
    </nav>

    <article class="post">
      <h1>${safeTitle}</h1>
      <div class="post-meta">
        ${dateISO ? `<time datetime="${dateISO}">Tanggal: ${fmtID(dateISO)}</time>` : ""}
        ${amount ? ` • <span>Menang: Rp ${Number(amount).toLocaleString("id-ID")}</span>` : ""}
        ${member_mask ? ` • <span>Member: ${escapeHtml(member_mask)}</span>` : ""}
        ${game ? ` • <span>Game: ${escapeHtml(game)}</span>` : ""}
      </div>

      ${proof_image ? `<figure class="win-proof"><img src="${proof_image}" alt="${safeTitle}" loading="lazy" decoding="async"></figure>` : ""}

      ${safeDesc ? `<p>${safeDesc}</p>` : ""}

      <div class="post-body">
        ${bodyHtml || ""}
      </div>

      <nav class="post-nav"><a href="/bukti/">← Kembali ke daftar</a></nav>
    </article>
  </main>

  <!-- PARTIAL:FOOTER -->
</body>
</html>`;
}

function winsIndexTemplate({ canonical, items }) {
  const safeTitle = "Bukti Kemenangan Member";
  const safeDesc = "Kumpulan bukti kemenangan member Original4D (screenshots dan ringkasan). ID member dimasking demi privasi.";

  // JSON-LD: CollectionPage + ItemList
  const ldCollection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": safeTitle,
    "url": canonical,
    "about": "Bukti kemenangan member",
  };
  const ldItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": items.map((it, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "url": it.url,
      "item": jsonLdWinItem(it)
    }))
  };

  const cards = items.map(it => {
    const amount = it.amount ? `Rp ${Number(it.amount).toLocaleString("id-ID")}` : "";
    return `<a class="card-win" href="${it.url}">
      <div class="thumb">${it.proof_image ? `<img src="${it.proof_image}" alt="${escapeHtml(it.title)}" loading="lazy" decoding="async">` : ""}</div>
      <div class="meta">
        <h3>${escapeHtml(it.title)}</h3>
        <div class="sub">
          ${it.dateISO ? `<time datetime="${it.dateISO}">${fmtID(it.dateISO)}</time>` : ""}
          ${amount ? ` • <span>${amount}</span>` : ""}
          ${it.member_mask ? ` • <span>${escapeHtml(it.member_mask)}</span>` : ""}
        </div>
      </div>
    </a>`;
  }).join("\n");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${safeDesc}">
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
  <link rel="alternate" type="application/json" href="/blog/feed.json">
  <link rel="alternate" type="application/rss+xml" href="/blog/feed.xml">
  
  <!-- Open Graph -->
  <meta property="article:section" content="News">
  <meta property="article:tag" content="Verifikasi">
  <meta property="article:tag" content="Original4D">
  <meta property="og:locale" content="id_ID">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${canonical}">
  ${ogImgTags.join("\n  ")}
  <meta property="article:published_time" content="${datePubISO}">
  <meta property="article:modified_time" content="${dateModISO}">
  ${articleExtras.join("\n  ")}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}">` : ""}

  ${ldBreadcrumb}
  ${ldArticle}

  <link rel="icon" href="${SITE_URL}/assets/img/favicon.png" type="image/png">
  <link rel="stylesheet" href="/assets/css/blog.css">
</head>
function winDetailTemplate({ title, canonical, dateISO, amount, member_mask, game, description, bodyHtml, proof_image }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || "");

  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Beranda", "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "Bukti Kemenangan", "item": `${SITE_URL}/bukti/` },
      { "@type": "ListItem", "position": 3, "name": safeTitle, "item": canonical }
    ]
  };
  const ldPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": safeTitle,
    "url": canonical,
    "description": safeDesc || undefined
  };

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${safeDesc}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonical}">

  <!-- OG/Twitter ringkas, mengikuti pola artikel -->
  <meta property="og:locale" content="id_ID">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${canonical}">
  ${proof_image ? `<meta property="og:image" content="${proof_image}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  ${proof_image ? `<meta name="twitter:image" content="${proof_image}">` : ""}

  <script type="application/ld+json">${JSON.stringify(ldBreadcrumb)}</script>
  <script type="application/ld+json">${JSON.stringify(ldPage)}</script>

  <link rel="icon" href="${SITE_URL}/assets/img/favicon.png" type="image/png">
  <link rel="preload" href="/assets/css/blog.css" as="style">
  <link rel="stylesheet" href="/assets/css/blog.css">
</head>
<body>
  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <a href="/bukti/">Bukti Kemenangan</a> › <strong>${safeTitle}</strong>
    </nav>

    <article class="post">
      <h1>${safeTitle}</h1>
      <div class="post-meta">
        ${dateISO ? `<time datetime="${dateISO}">Terbit: ${fmtID(dateISO)}</time>` : ""}
        ${amount ? ` • <span>Menang: Rp ${Number(amount).toLocaleString("id-ID")}</span>` : ""}
        ${member_mask ? ` • <span>Member: ${escapeHtml(member_mask)}</span>` : ""}
        ${game ? ` • <span>Game: ${escapeHtml(game)}</span>` : ""}
      </div>

      <div class="post-body">
        ${proof_image ? `<figure class="win-proof"><img src="${proof_image}" alt="${safeTitle}" loading="lazy" decoding="async"></figure>` : ""}
        ${safeDesc ? `<p>${safeDesc}</p>` : ""}
        ${bodyHtml || ""}
      </div>

      <nav class="post-nav"><a href="/bukti/">← Kembali ke daftar</a></nav>
    </article>
  </main>

  <!-- PARTIAL:FOOTER -->
</body>
</html>`;
}

// ---------- Build ----------
async function buildDetail(mdPath) {
  const raw = await fs.readFile(mdPath, "utf8");
  const { data: fm, content } = matter(raw);
  if (fm.draft) return null;

  const title = fm.title || "Bukti Kemenangan";
  const baseSlug = fm.slug ? slugify(fm.slug) : slugify(path.basename(mdPath, ".md"));
  const outDir = path.join(OUT_DIR, baseSlug);
  const canonical = `${SITE_URL}/bukti/${baseSlug}/`;

  const dateISO = toISO(fm.date);
  const amount = fm.amount || null;
  const member_mask = fm.member_mask || null;
  const game = fm.game || null;
  const description = fm.description || "";
  const proof_image = fm.proof_image || "";

  const bodyHtml = marked.parse(content || "");

  const html = winDetailTemplate({
    title, canonical, dateISO, amount, member_mask, game, description, bodyHtml, proof_image
  });

  await ensureDir(outDir);
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");

  return {
    title,
    url: `/bukti/${baseSlug}/`,
    dateISO,
