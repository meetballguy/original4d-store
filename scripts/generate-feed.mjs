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
const ROOT_FEED_DIR  = ROOT;                      // /feed.*  (opsional combined)

// ===== helpers =====
const DEFAULT_TZ_OFFSET = "+07:00"; // Asia/Phnom_Penh (GMT+7)

function keepOffsetRFC3339(d) {
  // Pertahankan offset bila sudah ada; kalau tidak ada, tambahkan +07:00
  if (!d) return null;
  if (typeof d === "string") {
    // Sudah ada Z atau offset
    if (/([zZ]|[+\-]\d{2}:\d{2})$/.test(d)) return d;
    // Hanya tanggal
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T00:00:00${DEFAULT_TZ_OFFSET}`;
    // Datetime tanpa detik
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d)) return `${d}:00${DEFAULT_TZ_OFFSET}`;
    // Datetime dengan detik tanpa offset
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(d)) return `${d}${DEFAULT_TZ_OFFSET}`;
  }
  const t = new Date(d);
  if (isNaN(t)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = t.getFullYear();
  const mm = pad(t.getMonth() + 1);
  const dd = pad(t.getDate());
  const HH = pad(t.getHours());
  const MM = pad(t.getMinutes());
  const SS = pad(t.getSeconds());
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}${DEFAULT_TZ_OFFSET}`;
}

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

function toTimeMs(rfc3339) {
  if (!rfc3339) return 0;
  const t = new Date(rfc3339);
  return isNaN(t) ? 0 : t.getTime();
}

// Ambil item dari markdown, lalu set dateISO ke waktu TERBARU antara:
// - front-matter (updated/date, dipertahankan offsetnya)
// - mtime file markdown
async function collectFromMd(mdDir, baseUrl) {
  const items = [];
  try { await fs.access(mdDir); } catch { return items; }
  const files = (await fs.readdir(mdDir)).filter(f => f.endsWith(".md"));
  for (const f of files) {
    const abs = path.join(mdDir, f);
    const fm = await readFM(abs);
    const stat = await fs.stat(abs);
    const slug = fm.slug ? slugifyFileName(fm.slug) : slugifyFileName(path.basename(f, ".md"));

    const fmRFC3339 = keepOffsetRFC3339(fm.updated || fm.date);
    const fmMs = toTimeMs(fmRFC3339);
    const mdMs = stat.mtimeMs;

    // pilih yang TERBARU antara front-matter vs mtime markdown
    const chosenMs = Math.max(fmMs, mdMs);
    // Simpan sebagai RFC3339 dengan offset +07:00 (biar tampak “hari ini” di lokal)
    const dateISO = new Date(chosenMs).toISOString(); // UTC
    // untuk JSON Feed nanti kita pakai versi offset lokal:
    const dateLocalRFC3339 = keepOffsetRFC3339(new Date(chosenMs));

    items.push({
      title: fm.title || "Tanpa Judul",
      description: fm.description || "",
      url: `${SITE_URL}${baseUrl}${slug}/`,
      // Simpan keduanya agar fleksibel di tahap build feed
      dateUTC: dateISO,                // untuk RSS (pubDate UTC)
      dateLocalRFC3339                 // untuk JSON Feed agar tidak “kemarin”
    });
  }
  return items;
}

// Lengkapi/upgrade tanggal memakai mtime HTML output bila LEBIH BARU
async function addMtimeFallback(items, outDir) {
  try { await fs.access(outDir); } catch { return items; }
  const map = new Map(items.map(i => [i.url, i]));
  for await (const f of walk(outDir)) {
    if (path.basename(f) !== "index.html") continue;
    const rel = toUrlPath(path.relative(ROOT, f)).replace(/\/index\.html$/, "/");
    const url = `${SITE_URL}/${rel}`.replace(/\/\/+/g, "/").replace(":/", "://");
    const stat = await fs.stat(f);
    const mtimeMs = stat.mtimeMs;

    if (!map.has(url)) {
      // Item tanpa markdown: buat baru dari mtime HTML
      map.set(url, {
        title: "Untitled",
        description: "",
        url,
        dateUTC: new Date(mtimeMs).toISOString(),
        dateLocalRFC3339: keepOffsetRFC3339(new Date(mtimeMs))
      });
    } else {
      const it = map.get(url);
      const curMs = Math.max(
        toTimeMs(it.dateUTC),
        toTimeMs(it.dateLocalRFC3339)
      );
      if (mtimeMs > curMs) {
        it.dateUTC = new Date(mtimeMs).toISOString();
        it.dateLocalRFC3339 = keepOffsetRFC3339(new Date(mtimeMs));
      }
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
      // pakai RFC3339 dengan offset lokal agar tidak tampil "kemarin"
      date_published: i.dateLocalRFC3339 || undefined
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
  // Kumpulkan dari markdown (+ pilih tanggal paling baru fm vs mtime .md)
  let blog = await collectFromMd(BLOG_MD_DIR, "/blog/news/");
  let wins = await collectFromMd(WINS_MD_DIR, "/bukti/");

  // Upgrade tanggal bila mtime HTML lebih baru
  blog = await addMtimeFallback(blog, BLOG_OUT_DIR);
  wins = await addMtimeFallback(wins, WINS_OUT_DIR);

  // Urut desc pakai dateUTC (fallback ke local bila perlu)
  const key = (i) => i.dateUTC || i.dateLocalRFC3339 || "";
  const sortByDate = (a,b) => key(b).localeCompare(key(a));
  blog.sort(sortByDate);
  wins.sort(sortByDate);
  const combined = [...blog, ...wins].sort(sortByDate);

  // Tulis:
  await writeFeeds(BLOG_FEED_DIR, blog, "blog");         // /blog/feed.*
  await writeFeeds(WINS_FEED_DIR, wins, "wins");         // /bukti/feed.*
  await writeFeeds(ROOT_FEED_DIR, combined, "combined"); // /feed.* (opsional)
  console.log(`[feed] blog=${blog.length}, wins=${wins.length}, combined=${combined.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
