// scripts/generate-feed.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const SITE_URL = (process.env.SITE_URL || process.env.URL || "https://original4d.store").replace(/\/+$/, "");
const BLOG_DIR = path.join(ROOT, "blog", "news");
const OUTPUT_JSON = path.join(ROOT, "blog", "feed.json");
const OUTPUT_RSS  = path.join(ROOT, "blog", "feed.xml");
const PER_PAGE = 10;

// ---- utils ----
function toPosix(p){ return p.split(path.sep).join("/"); }
function htmlUnescape(s=""){ return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function iso(d){ try{ return new Date(d).toISOString(); }catch{ return null; } }

function pathToUrl(rel){
  // rel contoh: 'blog/news/slug/index.html' -> '/blog/news/slug/'
  let p = toPosix(rel);
  if (p.startsWith("./")) p = p.slice(1);
  if (p.endsWith("/index.html")) p = p.replace(/\/index\.html$/, "/");
  else if (p.endsWith(".html"))  p = p.replace(/\.html$/, "/");
  return "/" + p.replace(/^\/+/, "");
}

async function walk(dir, list = []){
  try{
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries){
      const abs = path.join(dir, e.name);
      if (e.isDirectory()){
        await walk(abs, list);
      } else if (e.isFile()){
        if (e.name === "index.html" || e.name.endsWith(".html")){
          list.push(abs);
        }
      }
    }
  }catch{
    // folder mungkin belum ada
  }
  return list;
}

// ---- extraction ----
function findArticleFromJSONLD(rawHtml){
  const scripts = [...rawHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts){
    let jsonText = m[1].trim();
    try{
      const data = JSON.parse(jsonText);
      const stack = Array.isArray(data) ? data : [data];

      // cari di level atas
      for (const node of stack){
        const found = pickArticle(node);
        if (found) return found;
      }
    }catch{ /* skip */ }
  }
  return null;

  function pickArticle(node){
    if (!node || typeof node !== "object") return null;
    // @graph
    if (Array.isArray(node["@graph"])){
      for (const it of node["@graph"]){
        const f = pickArticle(it);
        if (f) return f;
      }
    }
    // tipe
    const t = node["@type"];
    const types = Array.isArray(t) ? t : t ? [t] : [];
    if (types.some(x => typeof x === "string" && /Article/i.test(x))){
      return node;
    }
    // array node
    if (Array.isArray(node)){
      for (const it of node){
        const f = pickArticle(it);
        if (f) return f;
      }
    }
    return null;
  }
}

function extractMeta(rawHtml, name, prop){
  const reName = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const m1 = rawHtml.match(reName);
  if (m1) return htmlUnescape(m1[1]);
  if (prop){
    const reProp = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    const m2 = rawHtml.match(reProp);
    if (m2) return htmlUnescape(m2[1]);
  }
  return null;
}

function extractTitle(rawHtml){
  return (
    extractMeta(rawHtml, "og:title", "og:title") ||
    extractMeta(rawHtml, "twitter:title", "twitter:title") ||
    (rawHtml.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "")
  ).trim();
}

function extractDescription(rawHtml){
  return (
    extractMeta(rawHtml, "description", "og:description") ||
    ""
  ).trim();
}

async function readPost(absPath){
  const rel = path.relative(ROOT, absPath);
  const urlPath = pathToUrl(rel);
  const url = SITE_URL + urlPath;

  const html = await fs.readFile(absPath, "utf8");

  // JSON-LD Article (kalau ada)
  const art = findArticleFromJSONLD(html);

  const title = (art?.headline || extractTitle(html) || "Tanpa Judul").trim();
  const summary = (art?.description || extractDescription(html) || "").trim();
  const datePublished = art?.datePublished || null;
  const dateModified  = art?.dateModified  || null;

  // fallback ke mtime file
  const stat = await fs.stat(absPath);
  const fallback = iso(stat.mtime);

  return {
    id: url,
    url,
    title,
    summary,
    date_published: iso(datePublished) || fallback,
    date_modified:  iso(dateModified)  || fallback,
    author: "Original4D"
  };
}

// ---- RSS helpers ----
function escXml(s=""){
  return s
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

async function main(){
  // kumpulkan artikel
  const files = await walk(BLOG_DIR);
  const posts = [];
  for (const f of files){
    // hanya file artikel (hindari /blog/index.html)
    if (!/\/blog\/news\//.test(toPosix(f))) continue;
    const item = await readPost(f);
    posts.push(item);
  }

  // urutkan terbaru
  posts.sort((a,b) => {
    const da = new Date(a.date_modified || a.date_published || 0).getTime();
    const db = new Date(b.date_modified || b.date_published || 0).getTime();
    return db - da;
  });

  // hitung totalPages
  const totalItems = posts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));

  // JSON Feed
  const feedJson = {
    version: "https://jsonfeed.org/version/1.1",
    title: "Blog Original4D",
    home_page_url: `${SITE_URL}/blog/`,
    feed_url: `${SITE_URL}/blog/feed.json`,
    language: "id-ID",
    items: posts,
    _meta: {
      totalItems,
      perPage: PER_PAGE,
      totalPages,
      generatedAt: new Date().toISOString(),
      siteUrl: SITE_URL
    }
  };

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(feedJson, null, 2) + "\n", "utf8");

  // RSS 2.0 (opsional tapi sekalian)
  const rssItems = posts.map(p => `
    <item>
      <title>${escXml(p.title)}</title>
      <link>${escXml(p.url)}</link>
      <guid isPermaLink="true">${escXml(p.url)}</guid>
      <pubDate>${new Date(p.date_published || p.date_modified || Date.now()).toUTCString()}</pubDate>
      <description><![CDATA[${(p.summary||"").slice(0,300)}]]></description>
    </item>`).join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Blog Original4D</title>
  <link>${SITE_URL}/blog/</link>
  <description>Artikel terbaru dan info resmi Original4D</description>
  <language>id-ID</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${rssItems}
</channel>
</rss>
`;
  await fs.writeFile(OUTPUT_RSS, rss.trim() + "\n", "utf8");

  console.log(`feed.json (${totalItems} items, totalPages=${totalPages}) & feed.xml generated.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
