import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".netlify", "assets"
]);
const EXCLUDE_FILES = new Set(["404.html"]);

function toPosix(p){ return p.split(path.sep).join("/"); }

function pathToUrlPath(rel){
  let p = toPosix(rel);
  // hilangkan leading "./"
  if (p.startsWith("./")) p = p.slice(1);
  // normalisasi index.html
  if (p === "index.html") return "/";
  if (p.endsWith("/index.html")) return "/" + p.replace(/\/index\.html$/, "/");
  return "/" + p;
}

// ambil base URL dari env Netlify; fallback domain produksimu
function getBaseUrl(){
  const ctx = process.env.CONTEXT || "";
  if (ctx === "production" && process.env.URL) return process.env.URL;
  return process.env.DEPLOY_PRIME_URL || "https://original4d.store";
}

async function walk(dir, list = []){
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries){
    const abs = path.join(dir, e.name);
    const rel = path.relative(ROOT, abs);
    const seg0 = rel.split(path.sep)[0];
    if (EXCLUDE_DIRS.has(seg0)) continue;
    if (e.isDirectory()){
      await walk(abs, list);
    } else if (e.isFile()){
      if (EXCLUDE_FILES.has(e.name)) continue;
      if (e.name.endsWith(".html")){
        list.push(rel);
      }
    }
  }
  return list;
}

async function isNoIndex(htmlPath){
  try{
    const html = await fs.readFile(htmlPath, "utf8");
    return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  }catch{
    return false;
  }
}

function iso(dt){
  // sitemap pakai UTC ISO
  return new Date(dt).toISOString();
}

async function main(){
  const baseUrl = getBaseUrl();
  const files = await walk(ROOT);
  const urls = [];

  for (const rel of files){
    const abs = path.join(ROOT, rel);
    if (await isNoIndex(abs)) continue;                       // skip halaman noindex
    const urlPath = pathToUrlPath(rel);
    // optional: skip duplikat antara "/" dan "/index.html" (sudah dinormalisasi)
    const stat = await fs.stat(abs);
    urls.push({
      loc: baseUrl.replace(/\/+$/, "") + urlPath,
      lastmod: iso(stat.mtime)
    });
  }

  // Urutkan biar rapi: root dulu, lalu alfabetis
  urls.sort((a, b) => {
    if (a.loc === baseUrl + "/") return -1;
    if (b.loc === baseUrl + "/") return 1;
    return a.loc.localeCompare(b.loc);
  });

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
  </url>`).join("\n")}
</urlset>
`;

  await fs.writeFile(path.join(ROOT, "sitemap.xml"), xml.trim() + "\n", "utf8");

  // pastikan robots.txt ada & berisi lokasi sitemap
  const robotsPath = path.join(ROOT, "robots.txt");
  let robots = "User-agent: *\nAllow: /\n";
  try{
    robots = await fs.readFile(robotsPath, "utf8");
  }catch{/* tidak ada, pakai default */}

  const sitemapLine = `Sitemap: ${baseUrl.replace(/\/+$/,"")}/sitemap.xml`;
  if (!robots.includes("Sitemap:")){
    robots = robots.trim() + "\n" + sitemapLine + "\n";
  } else {
    // update baris lama ke yang baru
    robots = robots.replace(/Sitemap:\s*.*/i, sitemapLine);
  }
  await fs.writeFile(robotsPath, robots, "utf8");

  console.log(`Generated sitemap with ${urls.length} URLs → sitemap.xml`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
