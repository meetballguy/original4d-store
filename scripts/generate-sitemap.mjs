// scripts/generate-sitemap.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

const ROOT = process.cwd();

// ========= Exclusions =========
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".netlify", "assets",
  "admin",   // tidak diindeks
  "partials" // tidak diindeks
]);
const EXCLUDE_FILES = new Set([
  "404.html",
  "amp.index.html", // <<— penting: jangan masukkan varian AMP file ke sitemap
]);

// ========= Helpers =========
function toPosix(p){ return p.split(path.sep).join("/"); }

function pathToUrlPath(rel){
  let p = toPosix(rel);
  if (p.startsWith("./")) p = p.slice(1);
  if (p === "index.html") return "/";
  if (p.endsWith("/index.html")) return "/" + p.replace(/\/index\.html$/, "/");
  return "/" + p;
}

function getBaseUrl(){
  // Netlify precedence:
  // 1) production: process.env.URL
  // 2) deploy preview: DEPLOY_PRIME_URL
  // 3) fallback: SITE_URL / hardcoded
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

      // Skip file verifikasi Google di root (mis. googleXXXX.html)
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

// date → ISO YYYY-MM-DDThh:mm:ss.sssZ
function isoFull(dt){
  return new Date(dt).toISOString();
}
// YYYY-MM-DD
function isoDate(dt){
  const d = new Date(dt);
  return isNaN(d) ? null : d.toISOString().slice(0,10);
}

// baca front-matter md (jika ada)
async function readFrontMatter(mdAbs){
  try{
    const raw = await fs.readFile(mdAbs, "utf8");
    const { data } = matter(raw);
    return data || {};
  }catch{
    return {};
  }
}

// coba mapping dari output → source md (blog & bukti)
function matchMdForOutput(absHtmlPath){
  // contoh:
  //  - blog/news/<slug>/index.html  -> content/news/<slug>.md
  //  - bukti/<slug>/index.html      -> content/wins/<slug>.md
  const rel = toPosix(path.relative(ROOT, absHtmlPath));
  const parts = rel.split("/");
  const isIndex = parts[parts.length - 1] === "index.html";
  if (!isIndex) return null;

  // blog/news/<slug>/index.html
  if (parts.length >= 4 && parts[0] === "blog" && parts[1] === "news") {
    const slug = parts[2];
    return path.join(ROOT, "content", "news", `${slug}.md`);
  }

  // bukti/<slug>/index.html
  if (parts.length >= 3 && parts[0] === "bukti") {
    const slug = parts[1];
    return path.join(ROOT, "content", "wins", `${slug}.md`);
  }

  return null;
}

async function computeLastmod(absHtmlPath){
  // Prioritas: FM.updated -> FM.date -> mtime HTML
  const mdPath = matchMdForOutput(absHtmlPath);
  if (mdPath){
    const fm = await readFrontMatter(mdPath);
    const chosen = fm.updated || fm.date;
    if (chosen){
      return isoDate(chosen) || isoDate(await fs.stat(absHtmlPath).then(s => s.mtime));
    }
  }
  // fallback mtime file HTML
  const stat = await fs.stat(absHtmlPath);
  return isoDate(stat.mtime);
}

// === Canonical extractor ===
function normalizeUrl(href, baseUrl){
  try {
    // dukung href absolut & relatif
    const u = new URL(href, baseUrl);
    // normalisasi trailing slash untuk root
    if (u.pathname === "") u.pathname = "/";
    // prefer trailing slash untuk direktori
    if (!path.extname(u.pathname) && !u.pathname.endsWith("/")) u.pathname += "/";
    u.hash = ""; // sitemap: jangan include fragment
    return u.toString().replace(/\/+$/, "/"); // single trailing slash
  } catch {
    return null;
  }
}

async function readCanonical(absHtmlPath, baseUrl){
  try{
    const html = await fs.readFile(absHtmlPath, "utf8");
    // cari <link rel="canonical" ... href="...">
    const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
    if (!m) return null;
    const tag = m[0];
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) return null;
    const canon = normalizeUrl(hrefMatch[1], baseUrl);
    return canon || null;
  }catch{
    return null;
  }
}

// ========= Main =========
async function main(){
  const baseUrl = getBaseUrl().replace(/\/+$/,"");
  const files = await walk(ROOT);
  const map = new Map(); // loc -> {loc,lastmod}

  for (const rel of files){
    const abs = path.join(ROOT, rel);
    if (await isNoIndex(abs)) continue; // hormati meta noindex

    // default URL dari path file
    const urlPath = pathToUrlPath(rel);
    let loc = baseUrl + urlPath;

    // Jika ada canonical, pakai canonical sebagai loc
    const canonical = await readCanonical(abs, baseUrl + "/");
    if (canonical) {
      loc = canonical.replace(/\/+$/, "/");
    }

    const lastmod = await computeLastmod(abs);
    // hanya simpan 1 entry per canonical loc (dedupe)
    const prev = map.get(loc);
    if (!prev || (lastmod && prev.lastmod && lastmod > prev.lastmod)) {
      map.set(loc, { loc, lastmod });
    }
  }

  // Sort: root dulu, lalu alfabetis
  const rootUrl = baseUrl + "/";
  const urls = Array.from(map.values()).sort((a, b) => {
    if (a.loc === rootUrl) return -1;
    if (b.loc === rootUrl) return 1;
    return a.loc.localeCompare(b.loc);
  });

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
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
    robots = "User-agent: *\nAllow: /\n";
  }

  // susun minimal rules yang kita inginkan
  const must = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /partials/"
  ];

  // gabungkan unik (case-insensitive key)
  const merged = new Map();
  for (const line of [...must, ...robots.trim().split(/\r?\n/).filter(Boolean)]) {
    merged.set(line.toLowerCase(), line);
  }
  let base = Array.from(merged.values()).join("\n");

  // tambah/replace sitemap line
  const sitemapLine = `Sitemap: ${baseUrl}/sitemap.xml`;
  if (/^Sitemap:/mi.test(base)) {
    base = base.replace(/^Sitemap:.*$/mi, sitemapLine);
  } else {
    base += `\n${sitemapLine}`;
  }
  await fs.writeFile(robotsPath, base.trim() + "\n", "utf8");

  console.log(`Generated sitemap with ${urls.length} canonical URLs → sitemap.xml`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
