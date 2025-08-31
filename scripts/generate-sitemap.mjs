import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".netlify", "assets",
  "admin",           // ➜ JANGAN ikut di sitemap
  "partials"         // ➜ JANGAN ikut di sitemap
]);
const EXCLUDE_FILES = new Set(["404.html"]);

function toPosix(p){ return p.split(path.sep).join("/"); }

function pathToUrlPath(rel){
  let p = toPosix(rel);
  if (p.startsWith("./")) p = p.slice(1);
  if (p === "index.html") return "/";
  if (p.endsWith("/index.html")) return "/" + p.replace(/\/index\.html$/, "/");
  return "/" + p;
}

function getBaseUrl(){
  const ctx = process.env.CONTEXT || "";
  if (ctx === "production" && process.env.URL) return process.env.URL;
  return process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || "https://original4d.store";
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

      // ➜ SKIP file verifikasi google *.html di root
      //    (mis. google4f14a90dd181a8e9.html)
      if (/^google[0-9a-f]+\.html$/i.test(e.name) && !rel.includes(path.sep)) {
        continue;
      }

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
  return new Date(dt).toISOString();
}

async function main(){
  const baseUrl = getBaseUrl().replace(/\/+$/,"");
  const files = await walk(ROOT);
  const urls = [];

  for (const rel of files){
    const abs = path.join(ROOT, rel);
    if (await isNoIndex(abs)) continue; // hormati meta noindex

    const urlPath = pathToUrlPath(rel);
    const stat = await fs.stat(abs);

    urls.push({
      loc: baseUrl + urlPath,
      lastmod: iso(stat.mtime)
    });
  }

  // Root dulu, sisanya alfabetis
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

  // ===== robots.txt: pastikan sitemap & disallow jalur non-index
  const robotsPath = path.join(ROOT, "robots.txt");
  let robots = "";
  try{
    robots = await fs.readFile(robotsPath, "utf8");
  }catch{
    // default
    robots = "User-agent: *\nAllow: /\n";
  }

  const lines = robots.trim().split(/\r?\n/).filter(Boolean);
  const want = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /partials/"
  ];
  // rebuild minimal + unique
  const merged = new Map();
  for (const l of [...want, ...lines]) merged.set(l.toLowerCase(), l);
  const base = Array.from(merged.values()).join("\n");

  const sitemapLine = `Sitemap: ${baseUrl}/sitemap.xml`;
  const finalRobots = (base.includes("Sitemap:") ? base.replace(/Sitemap:\s*.*/i, sitemapLine)
                                                 : base + "\n" + sitemapLine) + "\n";

  await fs.writeFile(robotsPath, finalRobots, "utf8");

  console.log(`Generated sitemap with ${urls.length} URLs → sitemap.xml`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
