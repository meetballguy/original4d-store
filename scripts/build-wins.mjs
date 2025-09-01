// scripts/build-posts.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "wins");
const OUT_DIR = path.join(ROOT, "bukti", "wins");

// Pastikan SITE_URL diakhiri tanpa slash
const SITE_URL = (process.env.SITE_URL?.replace(/\/+$/, "") || "https://original4d.store");
const SITE_NAME = "Original4D";

// ---------- Utils ----------
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

// ISO normalizer (hapus millis agar rapi)
function toISO(d) {
  if (!d) return null;
  const t = new Date(d);
  if (isNaN(t)) return null;
  return t.toISOString(); // sudah Zulu (UTC)
}

function fmtID(dISO){
  if (!dISO) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(dISO));
  } catch {
    return dISO;
  }
}

// ---------- Templates ----------
function buildJsonLdArticle({ title, description, canonical, dateISO, updatedISO, ogImage }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "headline": title,
    "datePublished": dateISO || undefined,
    "dateModified": (updatedISO || dateISO) || undefined,
    "author": { "@type": "Organization", "name": SITE_NAME },
    "publisher": {
      "@type": "Organization",
      "name": SITE_NAME,
      "logo": { "@type": "ImageObject", "url": `${SITE_URL}/assets/img/logo.png` }
    },
    "description": description || "",
    ...(ogImage ? { "image": [ogImage] } : {})
  };
  return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

function buildJsonLdBreadcrumb({ canonical, title }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Beranda", "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "bukti", "item": `${SITE_URL}/bukti/` },
      { "@type": "ListItem", "position": 3, "name": title, "item": canonical }
    ]
  };
  return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

function articleTemplate({
  title,
  description,
  canonical,
  dateISO,
  updatedISO,
  bodyHtml,
  ogImage,
  ogImageAlt,
  ogImageWidth,
  ogImageHeight,
  section,
  tags
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || "");
  const datePubISO = dateISO || "";
  const dateModISO = updatedISO || dateISO || "";

  const ldArticle = buildJsonLdArticle({ title, description, canonical, dateISO, updatedISO, ogImage });
  const ldBreadcrumb = buildJsonLdBreadcrumb({ canonical, title });

  // OG image extras
  const ogImgTags = [];
  if (ogImage) ogImgTags.push(`<meta property="og:image" content="${ogImage}">`);
  if (ogImageAlt) ogImgTags.push(`<meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}">`);
  if (ogImageWidth) ogImgTags.push(`<meta property="og:image:width" content="${String(ogImageWidth)}">`);
  if (ogImageHeight) ogImgTags.push(`<meta property="og:image:height" content="${String(ogImageHeight)}">`);

  // Article extras
  const articleExtras = [];
  if (section) articleExtras.push(`<meta property="article:section" content="${escapeHtml(section)}">`);
  if (Array.isArray(tags)) {
    for (const t of tags) {
      articleExtras.push(`<meta property="article:tag" content="${escapeHtml(String(t))}">`);
    }
  }

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
  <link rel="alternate" type="application/json" href="/bukti/feed.json">
  <link rel="alternate" type="application/rss+xml" href="/bukti/feed.xml">
  
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
<body>
  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <a href="/bukti/">bukti</a> › <strong>${safeTitle}</strong>
    </nav>

    <article class="post">
      <h1>${safeTitle}</h1>
      <div class="post-meta">
        ${datePubISO ? `<time datetime="${datePubISO}">Terbit: ${fmtID(datePubISO)}</time>` : ""}
        ${dateModISO ? ` • <time datetime="${dateModISO}">Update: ${fmtID(dateModISO)}</time>` : ""}
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

// ---------- Build ----------
async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

async function buildOne(mdPath){
  const raw = await fs.readFile(mdPath, "utf8");
  const { data: fm, content } = matter(raw);

  // Draft → skip
  if (fm.draft) return null;

  const title = fm.title || "Tanpa Judul";
  const description = fm.description || "";

  // Slug & output path
  const baseSlug = fm.slug ? slugify(fm.slug) : slugify(path.basename(mdPath, ".md"));
  const outDir = path.join(OUT_DIR, baseSlug);
  const canonical = `${SITE_URL}/bukti/wins/${baseSlug}/`;

  // Tanggal
  const dateISO = toISO(fm.date);
  const updatedISO = toISO(fm.updated);

  // Render Markdown → HTML
  const bodyHtml = marked.parse(content || "");

  // OG image + extras
  const ogImage = fm.ogImage || `${SITE_URL}/assets/img/hero.webp`;
  const ogImageAlt = fm.ogImageAlt || title;
  const ogImageWidth = fm.ogImageWidth || null;
  const ogImageHeight = fm.ogImageHeight || null;

  const html = articleTemplate({
    title,
    description,
    canonical,
    dateISO,
    updatedISO,
    bodyHtml,
    ogImage,
    ogImageAlt,
    ogImageWidth,
    ogImageHeight,
    section: fm.section || null,
    tags: fm.tags || null
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
  console.log(`[build-posts] Rendered ${results.length} article(s) from ${toPosix(path.relative(ROOT, CONTENT_DIR))}`);
}

main().catch(err => { console.error(err); process.exit(1); });
