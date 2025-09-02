// scripts/generate-feed.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

const ROOT = process.cwd();
const SITE_URL = (process.env.SITE_URL?.replace(/\/+$/, "") || "https://original4d.store");

// sumber markdown
const BLOG_MD_DIR = path.join(ROOT, "content", "news");
const WINS_MD_DIR = path.join(ROOT, "content", "wins");

// lokasi FEED
const BLOG_FEED_DIR  = path.join(ROOT, "blog");   // /blog/feed.*
const WINS_FEED_DIR  = path.join(ROOT, "bukti");  // /bukti/feed.*
const ROOT_FEED_DIR  = ROOT;                      // /feed.* (opsional combined)

// ===== helpers =====
function slugifyFileName(name) {
  return name.toString().trim().toLowerCase()
    .replace(/[^a-z0-9\- _]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Pertahankan RFC3339 dari front-matter:
// - kalau sudah ada offset/Z → pakai apa adanya
// - "YYYY-MM-DD" → jadikan "YYYY-MM-DDT00:00:00"
function keepRFC3339(d) {
  if (!d) return null;
  if (typeof d === "string") {
    if (/([zZ]|[+\-]\d{2}:\d{2})$/.test(d)) return d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T00:00:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d)) return `${d}:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(d)) return d;
  }
  const t = new Date(d);
  return isNaN(t) ? null : t.toISOString();
}

async function readFM(mdPath) {
  try {
    const raw = await fs.readFile(mdPath, "utf8");
    const { data } = matter(raw);
    return data || {};
  } catch { return {}; }
}

async function collectFromMd(mdDir, baseUrl) {
  const items = [];
  try { await fs.access(mdDir); } catch { return items; }
  const files = (await fs.readdir(mdDir)).filter(f => f.endsWith(".md"));
  for (const f of files) {
    const abs = path.join(mdDir, f);
    const fm = await readFM(abs);
    const slug = fm.slug ? slugifyFileName(fm.slug) : slugifyFileName(path.basename(f, ".md"));

    // Ambil tanggal HANYA dari front-matter (lastmod -> updated -> date)
    const fmLocal = keepRFC3339(fm.lastmod || fm.updated || fm.date);
    const fmUTC   = fmLocal ? new Date(fmLocal).toISOString() : null;

    items.push({
      title: fm.title || "Tanpa Judul",
      description: fm.description || "",
      url: `${SITE_URL}${baseUrl}${slug}/`,
      dateLocalRFC3339: fmLocal || undefined, // JSON Feed pakai ini (biar gak “kemarin”)
      dateUTC: fmUTC || undefined             // RSS pakai UTC standar
    });
  }
  return items;
}

function buildRss(items, { title, link, desc }) {
  const rssItems = items.map(i => `
    <item>
      <title><![CDATA[${i.title}]]></title>
      <link>${i.url}</link>
      <guid isPermaLink="true">${i.url}</guid>
      ${i.dateUTC ? `<pubDate>${new Date(i.dateUTC).toUTCString()}</pubDate>` : ""}
      ${i.description ? `<description><![CDATA[${i.description}]]></description>` : ""}
    </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title><![CDATA[${title}]]></title>
  <link>${link}</link>
  <description><![CDATA[${desc}]]></description>
  <language>id</language>
${rssItems}
</channel>
</rss>
`;
}

function buildJsonFeed(items, { title, home, feed }) {
  return {
    version: "https://jsonfeed.org/version/1",
    title,
    home_page_url: home,
    feed_url: feed,
    language: "id-ID",
    items: items.map(i => ({
      id: i.url,
      url: i.url,
      title: i.title,
      content_text: i.description || "",
      date_published: i.dateLocalRFC3339 || undefined
    }))
  };
}

async function writeFeeds(dir, items, kind) {
  await fs.mkdir(dir, { recursive: true });
  const meta = {
    blog:    { title: "Original4D — Artikel",          link: `${SITE_URL}/blog/`,  desc: "Artikel terbaru Original4D",           home: `${SITE_URL}/blog/`,  feed: `${SITE_URL}/blog/feed.json` },
    wins:    { title: "Original4D — Bukti Kemenangan", link: `${SITE_URL}/bukti/`, desc: "Bukti kemenangan member Original4D",  home: `${SITE_URL}/bukti/`, feed: `${SITE_URL}/bukti/feed.json` },
    combined:{ title: "Original4D — Artikel & Bukti",  link: `${SITE_URL}/`,       desc: "Gabungan artikel & bukti kemenangan", home: `${SITE_URL}/`,       feed: `${SITE_URL}/feed.json` }
  }[kind];

  const rss  = buildRss(items, meta);
  const json = buildJsonFeed(items, meta);

  await fs.writeFile(path.join(dir, "feed.xml"),  rss, "utf8");
  await fs.writeFile(path.join(dir, "feed.json"), JSON.stringify(json, null, 2), "utf8");
}

// ============ main ============
async function main() {
  // Kumpulkan dari markdown — HANYA front-matter (tanpa fallback mtime)
  let blog = await collectFromMd(BLOG_MD_DIR, "/blog/news/");
  let wins = await collectFromMd(WINS_MD_DIR, "/bukti/");

  // Urut desc berdasarkan tanggal (UTC lebih aman untuk sort)
  const key = (i) => i.dateUTC || i.dateLocalRFC3339 || "";
  const sortByDate = (a,b) => key(b).localeCompare(key(a));
  blog.sort(sortByDate);
  wins.sort(sortByDate);
  const combined = [...blog, ...wins].sort(sortByDate);

  // Tulis feed
  await writeFeeds(BLOG_FEED_DIR, blog, "blog");
  await writeFeeds(WINS_FEED_DIR, wins, "wins");
  await writeFeeds(ROOT_FEED_DIR, combined, "combined"); // opsional

  console.log(`[feed] blog=${blog.length}, wins=${wins.length}, combined=${combined.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
