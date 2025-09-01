// scripts/generate-sitemap.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, ".sitemap-manifest.json"); // simpan state lastmod/changefreq/priority
const FREEZE_EXISTING = process.env.SITEMAP_FREEZE_EXISTING !== "0"; // default freeze = true
const PING_AFTER_BUILD = process.env.SITEMAP_PING === "1"; // set ke "1" kalau mau ping Google/Bing
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || ""; // opsional: jika pakai IndexNow

// ========= Exclusions =========
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".netlify", "assets",
  "admin", "partials"
]);
const EXCLUDE_FILES = new Set([
  "404.html",
  "amp.index.html",
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
      if (/^google[0-9a-f]+\.html$/i.test(e.name) && !rel.includes(path.sep)) continue;

      if (e.name.endsWith(".html")) list.push(rel);
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

function isoDate(dt){
  const d = new Date(dt);
  return isNaN(d) ? null : d.toISOString().slice(0,10);
}

async function readFrontMatter(mdAbs){
  try{
    const raw = await fs.readFile(mdAbs, "utf8");
    const { data } = matter(raw);
    return data || {};
  }catch{
    return {};
  }
}

function matchMdForOutput(absHtmlPath){
  const rel = toPosix(path.relative(ROOT, absHtmlPath));
  const parts = rel.split("/");
  const isIndex = parts[parts.length - 1] === "index.html";
  if (!isIndex) return null;

  if (parts.length >= 4 && parts[0] === "blog" && parts[1] === "news") {
    const slug = parts[2];
    return path.join(ROOT, "content", "news", `${slug}.md`);
  }

  if (parts.length >= 3 && parts[0] === "bukti") {
    const slug = parts[1];
    return path.join(ROOT, "content", "wins", `${slug}.md`);
  }

  return null;
}

async function computeCandidateLastmod(absHtmlPath){
  // Prioritas: FM.updated -> FM.date -> mtime HTML
  const mdPath = matchMdForOutput(absHtmlPath);
  if (mdPath){
    const fm = await readFrontMatter(mdPath);
    const chosen = fm.updated || fm.date;
    if (chosen){
      return isoDate(chosen);
    }
  }
  const stat = await fs.stat(absHtmlPath);
  return isoDate(stat.mtime);
}

// === Canonical extractor ===
function normalizeUrl(href, baseUrl){
  try {
    const u = new URL(href, baseUrl);
    if (u.pathname === "") u.pathname = "/";
    u.hash = ""; // jangan include fragment di sitemap
    // Penting: jangan paksa trailing slash—hormati canonical persis seperti di HTML
    return u.toString();
  } catch {
    return null;
  }
}

async function readCanonical(absHtmlPath, baseUrl){
  try{
    const html = await fs.readFile(absHtmlPath, "utf8");
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

// === Heuristik tipe halaman & skor ===
function classify(urlPath){
  if (urlPath === "/") return "home";
  if (urlPath === "/blog/" || urlPath === "/bukti/") return "section";
  if (/^\/blog\/news\/[^/]+\/$/.test(urlPath)) return "article";
  if (/^\/bukti\/[^/]+\/$/.test(urlPath)) return "article";
  return "page";
}

function daysBetween(fromISO, toDate = new Date()){
  const d = new Date(fromISO);
  if (isNaN(d)) return Infinity;
  return Math.floor((toDate - d) / (1000*60*60*24));
}

function computeChangefreq(type, lastmodISO){
  if (type === "home") return "daily";
  if (type === "section") return "daily"; // listing sering berubah, tapi lastmod bisa difreeze via manifest
  const age = daysBetween(lastmodISO);
  if (age <= 7) return "daily";
  if (age <= 30) return "weekly";
  if (age <= 180) return "monthly";
  return "yearly";
}

function computePriority(type, lastmodISO){
  if (type === "home") return 1.0;
  if (type === "section") return 0.8;
  const age = daysBetween(lastmodISO);
  if (age <= 7) return 0.7;
  if (age <= 30) return 0.6;
  if (age <= 180) return 0.5;
  return 0.3;
}

async function loadManifest(){
  try{
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  }catch{
    return {}; // {loc: {lastmod, changefreq, priority}}
  }
}

async function saveManifest(obj){
  try{
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(obj, null, 2) + "\n", "utf8");
  }catch(e){
    console.warn("Cannot save manifest:", e?.message || e);
  }
}

// ========= Main =========
async function main(){
  const baseUrl = getBaseUrl().replace(/\/+$/,"");
  const files = await walk(ROOT);
  const prev = await loadManifest();

  const map = new Map(); // loc -> {loc,lastmod,changefreq,priority}

  for (const rel of files){
    const abs = path.join(ROOT, rel);
    if (await isNoIndex(abs)) continue;

    // default URL dari path file
    const urlPath = pathToUrlPath(rel);
    let loc = baseUrl + urlPath;

    // Jika ada canonical, pakai canonical sebagai loc
    const canonical = await readCanonical(abs, baseUrl + "/");
    if (canonical) loc = canonical;

    // klasifikasi & lastmod kandidat
    const type = classify(new URL(loc).pathname);
    const candidateLastmod = await computeCandidateLastmod(abs);

    // tentukan lastmod/changefreq/priority berdasarkan freeze & manifest
    const prevEntry = prev[loc];
    let lastmod = candidateLastmod || null;

    if (FREEZE_EXISTING && prevEntry && prevEntry.lastmod) {
      // beku: hormati nilai lama, jangan berubah
      lastmod = prevEntry.lastmod;
    }

    const changefreq = prevEntry?.changefreq || computeChangefreq(type, lastmod);
    const priority = prevEntry?.priority ?? computePriority(type, lastmod);

    // simpan
    map.set(loc, { loc, lastmod, changefreq, priority });
  }

  // Sort: root dulu, lalu alfabetis
  const rootUrl = baseUrl + "/";
  const urls = Array.from(map.values()).sort((a, b) => {
    if (a.loc === rootUrl) return -1;
    if (b.loc === rootUrl) return 1;
    return a.loc.localeCompare(b.loc);
  });

  // Tulis sitemap.xml
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(1)}</priority>
  </url>`).join("\n")}
</urlset>
`;

  await fs.writeFile(path.join(ROOT, "sitemap.xml"), xml.trim() + "\n", "utf8");

  // Robots.txt → pastikan Sitemap
  const robotsPath = path.join(ROOT, "robots.txt");
  let robots = "";
  try{
    robots = await fs.readFile(robotsPath, "utf8");
  }catch{
    robots = "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /partials/\n";
  }
  const sitemapLine = `Sitemap: ${baseUrl}/sitemap.xml`;
  if (/^Sitemap:/mi.test(robots)) {
    robots = robots.replace(/^Sitemap:.*$/mi, sitemapLine);
  } else {
    robots = (robots.trim() + "\n" + sitemapLine).trim() + "\n";
  }
  await fs.writeFile(robotsPath, robots, "utf8");

  // Simpan manifest (supaya lastmod lama tidak berubah di build berikutnya)
  const manifestObj = {};
  for (const u of urls) {
    manifestObj[u.loc] = {
      lastmod: u.lastmod || null,
      changefreq: u.changefreq,
      priority: u.priority
    };
  }
  await saveManifest(manifestObj);

  console.log(`Generated sitemap with ${urls.length} URLs → sitemap.xml (freeze=${FREEZE_EXISTING ? "on" : "off"})`);

  // ====== Ping search engines (opsional) ======
  if (PING_AFTER_BUILD) {
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    await pingSearchEngines(sitemapUrl);
  }
}

// ---- Ping helpers ----
async function pingSearchEngines(sitemapUrl){
  // Ping Google
  try {
    const g = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const r = await fetch(g);
    console.log(`[Sitemap Ping] Google -> ${r.status}`);
  } catch (e) {
    console.warn("[Sitemap Ping] Google failed:", e?.message || e);
  }

  // IndexNow (Bing & co) — aktif kalau INDEXNOW_KEY tersedia
  const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";
  if (!INDEXNOW_KEY) {
    console.log("[IndexNow] skipped (INDEXNOW_KEY not set)");
    return;
  }
  try {
    const host = new URL(sitemapUrl).host;
    const key = INDEXNOW_KEY;
    const keyLocation = `https://${host}/${key}.txt`;
    const payload = { host, key, keyLocation, urlList: [sitemapUrl] };
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`[IndexNow] ${res.status}`);
  } catch (e) {
    console.warn("[IndexNow] Failed:", e?.message || e);
  }
}

  // IndexNow (opsional) — butuh KEY & file kunci di root: /{INDEXNOW_KEY}.txt
  if (INDEXNOW_KEY) {
    try{
      const host = new URL(sitemapUrl).host;
      const key = INDEXNOW_KEY;
      const keyLocation = `https://${host}/${key}.txt`;
      const payload = {
        host,
        key,
        keyLocation,
        urlList: [sitemapUrl]
      };
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log(`[IndexNow] ${res.status}`);
    }catch(e){
      console.warn("[IndexNow] Failed:", e?.message || e);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
