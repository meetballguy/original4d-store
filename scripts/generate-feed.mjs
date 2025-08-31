// scripts/generate-feed.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const SITE_URL = (process.env.SITE_URL || process.env.URL || "https://original4d.store").replace(/\/+$/,"");
const BLOG_DIR = path.join(ROOT, "blog", "news");

function toPosix(p){ return p.split(path.sep).join("/"); }
function iso(dt){ return new Date(dt).toISOString(); }
function rfc822(dt){ return new Date(dt).toUTCString(); }

async function walkArticles(dir){
  const out = [];
  async function walk(d){
    const entries = await fs.readdir(d, { withFileTypes:true });
    for (const e of entries){
      const abs = path.join(d, e.name);
      if (e.isDirectory()){
        await walk(abs);
      } else if (e.isFile() && e.name === "index.html"){
        out.push(abs);
      }
    }
  }
  await walk(dir);
  return out;
}

function extract(regex, html, def=""){
  const m = html.match(regex);
  return m ? m[1].trim() : def;
}

function deriveUrlFromPath(abs){
  const rel = toPosix(path.relative(ROOT, abs)); // blog/news/slug/index.html
  const urlPath = "/" + rel.replace(/\/index\.html$/, "/");
  return SITE_URL + urlPath;
}

async function readOne(abs){
  const html = await fs.readFile(abs, "utf8");

  // Prefer JSON-LD Article dates
  const datePublished = extract(/"datePublished"\s*:\s*"([^"]+)"/i, html, "");
  const dateModified  = extract(/"dateModified"\s*:\s*"([^"]+)"/i, html, "");

  const title = extract(/<title[^>]*>([^<]+)<\/title>/i, html,
                 extract(/<h1[^>]*>([^<]+)<\/h1>/i, html, "Artikel"));

  const description = extract(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]*)["']/i, html, "");

  const canonical = extract(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"]+)["']/i, html, "") || deriveUrlFromPath(abs);

  const slug = toPosix(path.dirname(path.relative(path.join(ROOT,"blog","news"), abs))); // slug/
  const stat = await fs.stat(abs);
  const fallbackDate = iso(stat.mtime);

  return {
    url: canonical,
    slug: slug.replace(/\/+$/,""),
    title,
    description,
    datePublished: datePublished || fallbackDate,
    dateModified:  dateModified  || datePublished || fallbackDate
  };
}

function byDateDesc(a,b){
  const ad = a.dateModified || a.datePublished;
  const bd = b.dateModified || b.datePublished;
  return new Date(bd) - new Date(ad);
}

async function main(){
  // 1) kumpulkan artikel
  let items = [];
  try{
    const files = await walkArticles(BLOG_DIR);
    items = await Promise.all(files.map(readOne));
    items.sort(byDateDesc);
  }catch(e){
    console.error("Gagal membaca artikel:", e);
  }

  // 2) feed.json
  const jsonFeed = {
    version: 1,
    site: { title: "Blog Original4D", url: SITE_URL, home: `${SITE_URL}/blog/` },
    generatedAt: iso(Date.now()),
    items
  };
  await fs.writeFile(path.join(ROOT, "blog", "feed.json"), JSON.stringify(jsonFeed, null, 2), "utf8");

  // 3) RSS 2.0 (feed.xml)
  const rssItems = items.map(it => `
    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${it.url}</link>
      <guid isPermaLink="true">${it.url}</guid>
      <pubDate>${rfc822(it.datePublished || it.dateModified)}</pubDate>
      ${it.description ? `<description><![CDATA[${it.description}]]></description>` : ""}
    </item>`).join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Blog Original4D</title>
  <link>${SITE_URL}/blog/</link>
  <description>Artikel terbaru, tips akses & info resmi Original4D.</description>
  <language>id-ID</language>
  <lastBuildDate>${rfc822(Date.now())}</lastBuildDate>
${rssItems}
</channel>
</rss>
`;
  await fs.writeFile(path.join(ROOT,"blog","feed.xml"), rss.trim()+"\n", "utf8");

  // 4) Atom (atom.xml)
  const atomEntries = items.map(it => `
  <entry>
    <title>${escapeXml(it.title)}</title>
    <link href="${it.url}"/>
    <id>${it.url}</id>
    <updated>${iso(it.dateModified || it.datePublished)}</updated>
    ${it.description ? `<summary type="html"><![CDATA[${it.description}]]></summary>` : ""}
    <published>${iso(it.datePublished || it.dateModified)}</published>
  </entry>`).join("\n");

  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="id-ID">
  <title>Blog Original4D</title>
  <id>${SITE_URL}/blog/</id>
  <link href="${SITE_URL}/blog/"/>
  <link rel="self" href="${SITE_URL}/blog/atom.xml"/>
  <updated>${iso(Date.now())}</updated>
${atomEntries}
</feed>`;
  await fs.writeFile(path.join(ROOT,"blog","atom.xml"), atom.trim()+"\n", "utf8");

  console.log(`feed: ${items.length} artikel → feed.json, feed.xml (RSS), atom.xml`);
}

function escapeXml(s){
  return String(s).replace(/[<>&'"]/g, ch => (
    ch === "<" ? "&lt;" :
    ch === ">" ? "&gt;" :
    ch === "&" ? "&amp;" :
    ch === "'" ? "&apos;" : "&quot;"
  ));
}

main().catch(e => { console.error(e); process.exit(1); });
