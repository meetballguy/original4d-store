import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "blog", "news"); // sumber artikel
const BLOG_INDEX = path.join(ROOT, "blog", "index.html");

// ambil base URL dari env Netlify; fallback domain produksi
function getBaseUrl(){
  const ctx = process.env.CONTEXT || "";
  if (ctx === "production" && process.env.URL) return process.env.URL;
  return process.env.DEPLOY_PRIME_URL || "https://original4d.store";
}
const BASE = getBaseUrl().replace(/\/+$/, "");

function toPosix(p){ return p.split(path.sep).join("/"); }
function stripTags(s){ return s?.replace(/<[^>]*>/g, "").trim() || ""; }
function iso(dt){ return new Date(dt).toISOString(); }

async function readFileSafe(p){
  try { return await fs.readFile(p, "utf8"); } catch { return ""; }
}

function findFirst(html, patterns){
  for (const r of patterns){
    const m = html.match(r);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractMeta(html){
  const title = stripTags(
    findFirst(html, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
      /<title>([^<]+)<\/title>/i
    ])
  );

  const description = findFirst(html, [
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i
  ]);

  const canonical = findFirst(html, [
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
  ]);

  let datePublished = findFirst(html, [
    /<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i
  ]);

  return { title, description, canonical, datePublished };
}

function buildArticleJSONLD({ url, title, description, datePublished, dateModified }){
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "headline": title,
    "description": description || undefined,
    "datePublished": datePublished,
    "dateModified": dateModified,
    "author": { "@type": "Organization", "name": "Original4D" },
    "publisher": {
      "@type": "Organization",
      "name": "Original4D",
      "logo": { "@type": "ImageObject", "url": `${BASE}/assets/img/logo.png` }
    }
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Beranda", "item": `${BASE}/` },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${BASE}/blog/` },
      { "@type": "ListItem", "position": 3, "name": title, "item": url }
    ]
  };
  return { article, crumbs };
}

function buildBlogIndexJSONLD(items){
  // CollectionPage + ItemList daftar artikel
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${BASE}/blog/#collection`,
    "name": "Blog Original4D",
    "description": "Kumpulan artikel terbaru dan info resmi Original4D.",
    "url": `${BASE}/blog/`,
    "inLanguage": "id-ID"
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BASE}/blog/#items`,
    "url": `${BASE}/blog/`,
    "itemListElement": items.map((it, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": it.url,
      "name": it.title,
      "description": it.description || undefined,
      "datePublished": it.datePublished
    }))
  };
  return { collection, itemList };
}

function injectAutogenJSONLD(html, scripts){
  // Hapus autogen lama
  html = html.replace(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*data-autogen=["']true["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    ""
  );
  const block = scripts.map(obj =>
    `<script type="application/ld+json" data-autogen="true">${JSON.stringify(obj)}</script>`
  ).join("\n");

  // Sisipkan sebelum </head> jika ada, kalau tidak—sebelum </body>
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${block}\n</head>`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${block}\n</body>`);
  }
  // fallback: append
  return html + "\n" + block + "\n";
}

async function listPostFiles(){
  const out = [];
  async function walk(dir){
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries){
      const abs = path.join(dir, e.name);
      if (e.isDirectory()){
        await walk(abs);
      } else if (e.isFile() && e.name.toLowerCase() === "index.html"){
        out.push(abs);
      }
    }
  }
  await walk(BLOG_DIR);
  return out;
}

function fileRelUrl(abs){
  const rel = toPosix(path.relative(ROOT, abs));
  // normalisasi index.html → path folder
  const urlPath = "/" + rel.replace(/(^|\/)index\.html$/i, "");
  return (urlPath.endsWith("/") ? urlPath : urlPath + "/");
}

async function processArticle(abs){
  const html = await readFileSafe(abs);
  if (!html) return null;

  const { title, description, canonical, datePublished } = extractMeta(html);
  const stat = await fs.stat(abs);
  const url = canonical || (BASE + fileRelUrl(abs));
  const dp = datePublished || iso(stat.mtime);
  const dm = iso(stat.mtime);

  const { article, crumbs } = buildArticleJSONLD({
    url, title, description, datePublished: dp, dateModified: dm
  });

  const newHtml = injectAutogenJSONLD(html, [crumbs, article]);
  if (newHtml !== html){
    await fs.writeFile(abs, newHtml, "utf8");
  }

  return {
    path: abs,
    url,
    title: title || "(Tanpa judul)",
    description: description || "",
    datePublished: dp
  };
}

async function processBlogIndex(items){
  let html = await readFileSafe(BLOG_INDEX);
  if (!html) return;

  // Sort terbaru dulu (berdasarkan datePublished)
  items.sort((a,b) => (new Date(b.datePublished)) - (new Date(a.datePublished)));

  const { collection, itemList } = buildBlogIndexJSONLD(items);
  const newHtml = injectAutogenJSONLD(html, [collection, itemList]);

  if (newHtml !== html){
    await fs.writeFile(BLOG_INDEX, newHtml, "utf8");
  }

  // (opsional) feed JSON untuk /assets/js/blog.js
  const feed = items.map(({ url, title, description, datePublished }) => ({
    url, title, description, datePublished
  }));
  const feedPath = path.join(ROOT, "blog", "feed.json");
  await fs.writeFile(feedPath, JSON.stringify(feed, null, 2) + "\n", "utf8");
}

async function main(){
  const files = await listPostFiles();
  const items = [];
  for (const f of files){
    const item = await processArticle(f);
    if (item) items.push(item);
  }
  if (items.length){
    await processBlogIndex(items);
  }
  console.log(`Injected JSON-LD to ${items.length} article(s) + blog index`);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
