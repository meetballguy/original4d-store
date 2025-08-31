// scripts/generate-feed.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "blog", "news");
const FEED_PATH = path.join(ROOT, "blog", "feed.json");

// --- utils ---
function toPosix(p){ return p.split(path.sep).join("/"); }

function getBaseUrl(){
  // Urutan prioritas: SITE_URL (kamu set di netlify.toml), URL (production), DEPLOY_PRIME_URL (preview)
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const ctx = process.env.CONTEXT || "";
  if (ctx === "production" && process.env.URL) return process.env.URL.replace(/\/+$/, "");
  if (process.env.DEPLOY_PRIME_URL) return process.env.DEPLOY_PRIME_URL.replace(/\/+$/, "");
  return "https://original4d.store";
}

async function exists(p){ try{ await fs.access(p); return true; } catch { return false; } }

async function walkPosts(dir){
  const out = [];
  if (!await exists(dir)) return out;

  const entries = await fs.readdir(dir, { withFileTypes:true });
  for (const e of entries){
    const abs = path.join(dir, e.name);
    if (e.isDirectory()){
      // post model: /blog/news/<slug>/index.html
      const idx = path.join(abs, "index.html");
      if (await exists(idx)) out.push(idx);
      // (opsional) dukung legacy: /blog/news/<slug>.html
      const legacy = path.join(dir, `${e.name}.html`);
      if (await exists(legacy)) out.push(legacy);
      // juga telusuri nested kalau ada
      const nested = await walkPosts(abs);
      out.push(...nested);
    } else if (e.isFile() && e.name.endsWith(".html")){
      out.push(abs);
    }
  }
  // unikkan
  return [...new Set(out)];
}

function pick(regex, text){
  const m = text.match(regex);
  return m ? (m[1] || "").trim() : "";
}

function parseJsonLDBlocks(html){
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))){ 
    const raw = m[1].trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch { /* skip invalid JSON-LD */ }
  }
  return blocks;
}

function findArticleFromLd(ld){
  // ld bisa object, array, atau @graph
  const list = Array.isArray(ld) ? ld : [ld];
  const flat = [];
  for (const node of list){
    if (node && typeof node === "object"){
      if (node["@graph"] && Array.isArray(node["@graph"])) {
        flat.push(...node["@graph"]);
      } else {
        flat.push(node);
      }
    }
  }
  return flat.find(n => (n["@type"] === "Article" || (Array.isArray(n["@type"]) && n["@type"].includes("Article"))));
}

function slugFromPath(p){
  const posix = toPosix(path.relative(path.join(ROOT, "blog", "news"), p));
  // contoh:
  // 1) cara-daftar/index.html -> cara-daftar
  // 2) cara-daftar.html       -> cara-daftar
  const noIndex = posix.replace(/\/index\.html$/i, "");
  return noIndex.replace(/\.html$/i, "");
}

function toISO(d){ return new Date(d).toISOString(); }

// --- main ---
async function main(){
  const base = getBaseUrl();
  const files = await walkPosts(BLOG_DIR);

  const items = [];
  for (const filePath of files){
    const html = await fs.readFile(filePath, "utf8");
    const stat = await fs.stat(filePath);
    const ldBlocks = parseJsonLDBlocks(html);
    const article = ldBlocks.map(findArticleFromLd).find(Boolean);

    const titleFromTag = pick(/<title>([\s\S]*?)<\/title>/i, html);
    const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html);
    const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html);
    const slug = slugFromPath(filePath);

    const url = canonical || `${base}/blog/news/${slug}/`;
    const title = (article?.headline || titleFromTag || slug).trim();
    const datePublished = article?.datePublished || toISO(stat.mtime);
    const dateModified  = article?.dateModified  || toISO(stat.mtime);

    // ambil ringkasan pendek 160–200 karakter
    const description = (article?.description || desc || "").slice(0, 220);

    items.push({
      slug,
      url,
      title,
      description,
      datePublished,
      dateModified
    });
  }

  // sort terbaru dulu
  items.sort((a,b) => new Date(b.datePublished) - new Date(a.datePublished));

  // tulis feed
  const feed = {
    version: 1,
    site: base,
    generatedAt: new Date().toISOString(),
    items
  };
  await fs.mkdir(path.dirname(FEED_PATH), { recursive:true });
  await fs.writeFile(FEED_PATH, JSON.stringify(feed, null, 2) + "\n", "utf8");

  console.log(`Generated blog feed with ${items.length} posts → ${path.relative(ROOT, FEED_PATH)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
