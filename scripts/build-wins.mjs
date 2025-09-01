// scripts/build-wins.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "wins"); // mirip blog: content/news
const OUT_DIR = path.join(ROOT, "bukti");                // mirip blog: blog/news
const SITE_URL = process.env.SITE_URL?.replace(/\/+$/, "") || "https://original4d.store";

// util
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

function toISO(d){
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t) ? null : t.toISOString();
}

function fmtID(dISO){
  if (!dISO) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(dISO));
  } catch {
    return dISO;
  }
}

// ======== TEMPLATE: 100% meniru build-posts.mjs kamu ========
function articleTemplateWins({ title, description, canonical, dateISO, updatedISO, bodyHtml, ogImage }) {
  const jsonLdArticle = {
    "@context": "https://schema.org",
    "@type": "Article",
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "headline": title,
    "datePublished": dateISO || undefined,
    "dateModified": (updatedISO || dateISO) || undefined,
    "author": { "@type": "Organization", "name": "Original4D" },
    "publisher": {
      "@type": "Organization",
      "name": "Original4D",
      "logo": { "@type": "ImageObject", "url": `${SITE_URL}/assets/img/logo.png` }
    },
    "description": description || "",
    ...(ogImage ? { "image": [ogImage] } : {})
  };

  // breadcrumb disesuaikan (Beranda → Bukti Kemenangan → Judul)
  const jsonLdBreadcrumb = {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      { "@type":"ListItem","position":1,"name":"Beranda","item":`${SITE_URL}/` },
      { "@type":"ListItem","position":2,"name":"Bukti Kemenangan","item":`${SITE_URL}/bukti/` },
      { "@type":"ListItem","position":3,"name":title,"item":canonical }
    ]
  };

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

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

async function buildOne(mdPath){
  const raw = await fs.readFile(mdPath, "utf8");
  const { data: fm, content } = matter(raw);

  if (fm.draft) return null;

  const title = fm.title || "Tanpa Judul";
  const description = fm.description || "";
  const baseSlug = fm.slug ? slugify(fm.slug) : slugify(path.basename(mdPath, ".md"));
  const outDir = path.join(OUT_DIR, baseSlug);
  const canonical = `${SITE_URL}/bukti/${baseSlug}/`;

  const dateISO = toISO(fm.date);
  const updatedISO = toISO(fm.updated);

  const bodyHtml = marked.parse(content || "");

  const html = articleTemplateWins({
    title,
    description,
    canonical,
    dateISO,
    updatedISO,
    bodyHtml,
    ogImage: fm.ogImage || `${SITE_URL}/assets/img/hero.webp`
  });

  await ensureDir(outDir);
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");

  return { slug: baseSlug, path: toPosix(path.relative(ROOT, path.join(outDir, "index.html"))) };
}

async function main(){
  try { await fs.access(CONTENT_DIR); } catch { await ensureDir(CONTENT_DIR); }

  const files = (await fs.readdir(CONTENT_DIR))
    .filter(f => f.endsWith(".md"))
    .map(f => path.join(CONTENT_DIR, f));

  const results = [];
  for (const f of files){
    const r = await buildOne(f);
    if (r) results.push(r);
  }
  console.log(`[build-wins] Rendered ${results.length} item(s) from ${toPosix(path.relative(ROOT, CONTENT_DIR))}`);
}

main().catch(err => { console.error(err); process.exit(1); });
