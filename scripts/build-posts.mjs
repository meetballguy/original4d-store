// scripts/build-posts.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "news");
const OUT_DIR = path.join(ROOT, "blog", "news");
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

function articleTemplate({ title, description, canonical, dateISO, updatedISO, bodyHtml, ogImage }) {
  const jsonLd = {
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
    "description": description
  };

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description || "")}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description || "")}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Original4D">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ""}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <link rel="stylesheet" href="/assets/css/blog.css">
</head>
<body>
  <!-- PARTIAL:HEADER -->

  <main class="container">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a> › <a href="/blog/">Blog</a> › <strong>${escapeHtml(title)}</strong>
    </nav>

    <article class="post">
      <h1>${escapeHtml(title)}</h1>
      <div class="post-meta">
        ${dateISO ? `<time datetime="${dateISO}">Terbit: ${new Date(dateISO).toLocaleString("id-ID",{dateStyle:"long"})}</time>` : ""}
        ${updatedISO ? ` • <time datetime="${updatedISO}">Update: ${new Date(updatedISO).toLocaleString("id-ID",{dateStyle:"long"})}</time>` : ""}
      </div>
      <div class="post-body">
        ${bodyHtml}
      </div>
      <nav class="post-nav"><a href="/blog/">← Artikel lain</a></nav>
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
  const canonical = `${SITE_URL}/blog/news/${baseSlug}/`;

  // tanggal
  const dateISO = fm.date ? new Date(fm.date).toISOString() : null;
  const updatedISO = fm.updated ? new Date(fm.updated).toISOString() : null;

  // render markdown ➜ HTML
  const bodyHtml = marked.parse(content || "");

  const html = articleTemplate({
    title, description, canonical, dateISO, updatedISO, bodyHtml,
    ogImage: fm.ogImage || `${SITE_URL}/assets/img/hero.webp`
  });

  await ensureDir(outDir);
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");

  return { slug: baseSlug, path: toPosix(path.relative(ROOT, path.join(outDir, "index.html"))) };
}

async function main(){
  // pastikan folder ada
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
