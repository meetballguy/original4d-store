// scripts/generate-feed.mjs
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

const ROOT = process.cwd();
const SITE_URL = (process.env.SITE_URL?.replace(/\/+$/, "") || "https://original4d.store");

// sumber markdown
const BLOG_MD_DIR = path.join(ROOT, "content", "news");
const WINS_MD_DIR = path.join(ROOT, "content", "wins");

// output HTML (untuk fallback mtime)
const BLOG_OUT_DIR = path.join(ROOT, "blog", "news");
const WINS_OUT_DIR = path.join(ROOT, "bukti");

// lokasi FEED
const BLOG_FEED_DIR  = path.join(ROOT, "blog");   // /blog/feed.*
const WINS_FEED_DIR  = path.join(ROOT, "bukti");  // /bukti/feed.*
const ROOT_FEED_DIR  = ROOT;                       // /feed.*  (opsional combined)

// ===== helpers =====
const toISO = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t) ? null : t.toISOString();
};
function toUrlPath(p) { return p.split(path.sep).join("/"); }

async function* walk(dir) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(res);
    else if (d.isFile()) yield res;
  }
}

function slugifyFileName(name) {
  return name.toString().trim().toLowerCase()
    .replace(/[^a-z0-9\- _]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
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
    items.push({
      title: fm.title || "Tanpa Judul",
      description: fm.description || "",
      url: `${SITE_URL}${baseUrl}${slug}/`,
      dateISO: toISO(fm.updated || fm.date) || null
    });
  }
  return items;
}

async function addMtimeFallback(items, outDir, baseUrl) {
  try { await fs.access(outDir); } catch { return items; }
  const map = new Map(items.map(i => [i.url, i]));
  for await (const f of walk(outDir)) {
    if (path.basename(f) !== "index.html") continue;
    // contoh: /blog/news/slug/index.html -> /blog/news/slug/
    const rel = toUrlPath(path.relative(ROOT, f))
      .replace(/\/index\.html$/, "/");
    const url = `${SITE_URL}/${rel}`.replace(/\/\/+/g, "/").replace(":/", "://");
    const stat = await fs.stat(f);
    if (!map.has(url)) {
      map.set(url, {
        title: "Untitled",
        description: "",
        url,
        dateISO: new Date(stat.mtimeMs).toISOString()
      });
    } else {
      const it = map.get(url);
      it.dateISO = it.dateISO || new Date(stat.mtimeMs).toISOString();
    }
  }
  return Array.from(map.values());
}

function buildRss(items, { title, link, desc }) {
  const rssItems = items.map(i => `
    <item>
      <title><![CDATA[${i.title}]]></title>
      <link>${i.url}</link>
      <guid isPermaLink="true">${i.url}</guid>
      ${i.dateISO ? `<pubDate>${new Date(i.dateISO).toUTCString()}</pubDate>` : ""}
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
      date_published: i.dateISO || undefined
    }))
  };
}

async function writeFeeds(dir, items, kind) {
  await fs.mkdir(dir, { recursive: true });
  const meta = {
    blog: {
      title: "Original4D — Artikel",
      link: `${SITE_URL}/blog/`,
      desc:  "Artikel terbaru Original4D",
      home:  `${SITE_URL}/blog/`,
      feed:  `${SITE_URL}/blog/feed.json`
    },
    wins: {
      title: "Original4D — Bukti Kemenangan",
      link: `${SITE_URL}/bukti/`,
      desc:  "Bukti kemenangan member Original4D",
      home:  `${SITE_URL}/bukti/`,
      feed:  `${SITE_URL}/bukti/feed.json`
    },
    combined: {
      title: "Original4D — Artikel & Bukti",
      link: `${SITE_URL}/`,
      desc:  "Gabungan artikel & bukti kemenangan",
      home:  `${SITE_URL}/`,
      feed:  `${SITE_URL}/feed.json`
    }
  }[kind];

  const rss  = buildRss(items, meta);
  const json = buildJsonFeed(items, meta);

  const xmlPath  = path.join(dir, "feed.xml");
  const jsonPath = path.join(dir, "feed.json");
  await fs.writeFile(xmlPath,  rss, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");
}

// ============ main ============
async function main() {
  // Kumpulkan dari markdown
  let blog = await collectFromMd(BLOG_MD_DIR, "/blog/news/");
  let wins = await collectFromMd(WINS_MD_DIR, "/bukti/");

  // Lengkapi fallback tanggal dari output mtime
  blog = await addMtimeFallback(blog, BLOG_OUT_DIR, "/blog/news/");
  wins = await addMtimeFallback(wins, WINS_OUT_DIR, "/bukti/");

  // Urut desc
  const sortByDate = (a,b) => (b.dateISO || "").localeCompare(a.dateISO || "");
  blog.sort(sortByDate);
  wins.sort(sortByDate);
  const combined = [...blog, ...wins].sort(sortByDate);

  // Tulis:
  await writeFeeds(BLOG_FEED_DIR, blog, "blog");        // /blog/feed.*
  await writeFeeds(WINS_FEED_DIR, wins, "wins");        // /bukti/feed.*
  await writeFeeds(ROOT_FEED_DIR, combined, "combined"); // /feed.*  (opsional)
  console.log(`[feed] blog=${blog.length}, wins=${wins.length}, combined=${combined.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
