// scripts/inject-structured-data.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "blog");
const NEWS_DIR = path.join(BLOG_DIR, "news");
const BLOG_INDEX = path.join(BLOG_DIR, "index.html");
const FEED_PATH = path.join(BLOG_DIR, "feed.json");

// ---------- utils ----------
function toPosix(p){ return p.split(path.sep).join("/"); }
function exists(p){ return fs.access(p).then(() => true).catch(() => false); }

function getBaseUrl(){
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const ctx = process.env.CONTEXT || "";
  if (ctx === "production" && process.env.URL) return process.env.URL.replace(/\/+$/, "");
  if (process.env.DEPLOY_PRIME_URL) return process.env.DEPLOY_PRIME_URL.replace(/\/+$/, "");
  return "https://original4d.store";
}

function pick(re, text){
  const m = text.match(re);
  return m ? (m[1] || "").trim() : "";
}

function flattenNodesFromLD(ld){
  const bag = [];
  const pushNode = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(pushNode); return; }
    if (n["@graph"]) pushNode(n["@graph"]);
    bag.push(n);
  };
  pushNode(ld);
  return bag;
}

function nodeHasType(node, targets){
  const t = node["@type"];
  const arr = Array.isArray(t) ? t : (t ? [t] : []);
  return arr.some(x => targets.includes(String(x)));
}

function stripLdByTypes(html, targetTypes){
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi;
  return html.replace(re, (block) => {
    // try parse; if contains targeted types -> remove
    const inner = block.replace(/^[\s\S]*?>/,'').replace(/<\/script>\s*$/i,'').trim();
    try{
      const json = JSON.parse(inner);
      const nodes = flattenNodesFromLD(json);
      if (nodes.some(n => nodeHasType(n, targetTypes))) {
        return ""; // drop this block
      }
    }catch{/* not json, keep */}
    return block; // keep others (e.g. Organization/WebSite)
  });
}

function insertBeforeHeadClose(html, snippet){
  const i = html.toLowerCase().lastIndexOf("</head>");
  if (i === -1) return snippet + "\n" + html; // fallback prepend
  return html.slice(0, i) + snippet + "\n" + html.slice(i);
}

function slugFromPath(filePath){
  const posix = toPosix(path.relative(NEWS_DIR, filePath));
  // cara-daftar/index.html -> cara-daftar
  const noIndex = posix.replace(/\/index\.html$/i, "");
  return noIndex.replace(/\.html$/i, "");
}

async function walkArticles(dir){
  const list = [];
  if (!await exists(dir)) return list;
  const entries = await fs.readdir(dir, { withFileTypes:true });
  for (const e of entries){
    const abs = path.join(dir, e.name);
    if (e.isDirectory()){
      const idx = path.join(abs, "index.html");
      if (await exists(idx)) list.push(idx);
      const nested = await walkArticles(abs);
      list.push(...nested);
    } else if (e.isFile() && e.name.endsWith(".html")){
      list.push(abs);
    }
  }
  // unique + prioritas index.html
  return [...new Set(list)].filter(p => /(^|\/)index\.html$/i.test(p) || /\.html$/i.test(p));
}

async function loadFeedItems(){
  if (await exists(FEED_PATH)) {
    try{
      const raw = await fs.readFile(FEED_PATH, "utf8");
      const json = JSON.parse(raw);
      return Array.isArray(json.items) ? json.items : [];
    }catch{/* fallthrough */}
  }
  // fallback: scan files
  const files = await walkArticles(NEWS_DIR);
  const base = getBaseUrl();
  const items = [];
  for (const f of files){
    const html = await fs.readFile(f, "utf8");
    const stat = await fs.stat(f);
    const title = pick(/<title>([\s\S]*?)<\/title>/i, html) || slugFromPath(f);
    const desc  = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i, html);
    const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i, html);
    const slug = slugFromPath(f);
    items.push({
      slug,
      url: (canonical || `${base}/blog/news/${slug}/`).replace(/\/+$/, "/"),
      title, description: desc || "",
      datePublished: new Date(stat.mtime).toISOString(),
      dateModified:  new Date(stat.mtime).toISOString()
    });
  }
  // sort terbaru
  items.sort((a,b) => new Date(b.datePublished) - new Date(a.datePublished));
  return items;
}

// ---------- builders ----------
function buildBlogGraph(base, items){
  const crumb = {
    "@type":"BreadcrumbList",
    "itemListElement":[
      { "@type":"ListItem", "position":1, "name":"Beranda", "item": `${base}/` },
      { "@type":"ListItem", "position":2, "name":"Blog",    "item": `${base}/blog/` }
    ]
  };
  const collection = {
    "@type":"CollectionPage",
    "name":"Blog Original4D",
    "description":"Kumpulan artikel terbaru dan info resmi Original4D.",
    "url": `${base}/blog/`,
    "inLanguage":"id-ID"
  };
  const itemList = {
    "@type":"ItemList",
    "itemListElement": items.slice(0, 50).map((it, i) => ({
      "@type":"ListItem",
      "position": i + 1,
      "url": it.url,
      "name": it.title
    }))
  };
  return { "@context":"https://schema.org", "@graph":[crumb, collection, itemList] };
}

function buildArticleGraph(base, { title, description, canonical, datePublished, dateModified }){
  const url = (canonical || "").trim() || null;
  const article = {
    "@type":"Article",
    "mainEntityOfPage": { "@type":"WebPage", "@id": url || undefined },
    "headline": title,
    "description": description || undefined,
    "datePublished": datePublished,
    "dateModified":  dateModified,
    "inLanguage":"id-ID",
    "author": { "@type":"Organization", "name":"Original4D" },
    "publisher": {
      "@type":"Organization",
      "name":"Original4D",
      "logo": { "@type":"ImageObject", "url": `${base}/assets/img/logo.png` }
    },
    "image": [`${base}/assets/img/hero.webp`]
  };
  const crumb = {
    "@type":"BreadcrumbList",
    "itemListElement":[
      { "@type":"ListItem", "position":1, "name":"Beranda", "item": `${base}/` },
      { "@type":"ListItem", "position":2, "name":"Blog",    "item": `${base}/blog/` },
      { "@type":"ListItem", "position":3, "name": title,    "item": url || undefined }
    ]
  };
  return { "@context":"https://schema.org", "@graph":[crumb, article] };
}

// ---------- injectors ----------
async function injectBlogIndex(){
  if (!await exists(BLOG_INDEX)) return { changed:false, reason:"/blog/index.html not found" };
  const base = getBaseUrl();
  const items = await loadFeedItems();

  let html = await fs.readFile(BLOG_INDEX, "utf8");
  // buang LD yang kita target (biarkan Organization/WebSite tetap)
  html = stripLdByTypes(html, ["BreadcrumbList", "CollectionPage", "ItemList"]);

  const graph = buildBlogGraph(base, items);
  const tag = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
  html = insertBeforeHeadClose(html, "\n  " + tag);

  await fs.writeFile(BLOG_INDEX, html, "utf8");
  return { changed:true, count: items.length };
}

async function injectArticles(){
  const base = getBaseUrl();
  const files = await walkArticles(NEWS_DIR);
  const feedItems = await loadFeedItems();
  const byUrl = new Map(feedItems.map(it => [it.url.replace(/\/+$/,"/"), it]));
  const out = { total: files.length, updated:0 };

  for (const f of files){
    let html = await fs.readFile(f, "utf8");

    // metadata fallback dari HTML
    const title = pick(/<title>([\s\S]*?)<\/title>/i, html) || slugFromPath(f);
    const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i, html) || "";
    const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i, html) || null;

    // padankan dengan feed berdasarkan canonical/url
    const key = (canonical || "").replace(/\/+$/,"/");
    const fi = key && byUrl.get(key) ? byUrl.get(key) : null;

    const stat = await fs.stat(f);
    const graph = buildArticleGraph(base, {
      title,
      description,
      canonical,
      datePublished: fi?.datePublished || new Date(stat.mtime).toISOString(),
      dateModified:  fi?.dateModified  || new Date(stat.mtime).toISOString()
    });

    // buang LD bertipe Article/BreadcrumbList sebelumnya
    html = stripLdByTypes(html, ["Article", "BreadcrumbList"]);

    const tag = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
    html = insertBeforeHeadClose(html, "\n  " + tag);
    await fs.writeFile(f, html, "utf8");
    out.updated++;
  }
  return out;
}

// ---------- run ----------
async function main(){
  const bi = await injectBlogIndex();
  const ar = await injectArticles();
  console.log(`LD injected → /blog/: ${bi.changed ? "OK" : "SKIPPED"} (items:${bi.count ?? 0}), articles updated: ${ar.updated}/${ar.total}`);
}

main().catch(e => { console.error(e); process.exit(1); });
