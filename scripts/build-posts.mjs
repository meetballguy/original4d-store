import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "news");
const OUT_DIR = path.join(ROOT, "blog", "news");
const PARTIALS = {
  header: path.join(ROOT, "partials", "header.html"),
  footer: path.join(ROOT, "partials", "footer.html"),
  headArticle: path.join(ROOT, "partials", "head-article.html"),
};

function toPosix(p){ return p.split(path.sep).join("/"); }
function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeJsonString(s){
  return JSON.stringify(String(s ?? ""));
}
function fmtISO(s){
  if (!s) return new Date().toISOString();
  return new Date(s).toISOString();
}
async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }
async function readOrEmpty(p){ try { return await fs.readFile(p, "utf8"); } catch { return ""; } }

function renderHtml({head, header, footer, title, bodyHtml}){
  return `<!doctype html>
<html lang="id">
<head>
${head}
</head>
<body>
${header}
<main class="container">
  <article class="post">
    <h1>${escapeHtml(title)}</h1>
    ${bodyHtml}
    <nav class="post-nav"><a href="/blog/">Lihat artikel lain</a></nav>
  </article>
</main>
${footer}
</body>
</html>`;
}

async function main(){
  // load partials
  const [header, footer, headTpl] = await Promise.all([
    fs.readFile(PARTIALS.header, "utf8"),
    fs.readFile(PARTIALS.footer, "utf8"),
    fs.readFile(PARTIALS.headArticle, "utf8"),
  ]);

  // list md files
  const files = (await fs.readdir(CONTENT_DIR)).filter(f => f.endsWith(".md"));

  for (const file of files){
    const abs = path.join(CONTENT_DIR, file);
    const src = await fs.readFile(abs, "utf8");
    const { data, content } = matter(src);

    const slug = (data.slug || file.replace(/\.md$/,"")).toLowerCase();
    const title = data.title || slug.replace(/-/g," ");
    const description = data.description || "";
    const datePublished = fmtISO(data.date);
    const dateModified = fmtISO(data.updated || data.date);

    const canonical = `https://original4d.store/blog/news/${slug}/`;

    // markdown → HTML
    const bodyHtml = marked.parse(content || "");

    // head fill
    let head = headTpl
      .replaceAll("{{TITLE}}", escapeHtml(title))
      .replaceAll("{{DESCRIPTION}}", escapeHtml(description))
      .replaceAll("{{CANONICAL}}", canonical)
      .replaceAll("{{DATE_PUBLISHED}}", datePublished)
      .replaceAll("{{DATE_MODIFIED}}", dateModified)
      .replaceAll("{{JSON_TITLE}}", escapeJsonString(title))
      .replaceAll("{{JSON_DESCRIPTION}}", escapeJsonString(description))
      .replaceAll("{{JSON_CANONICAL}}", escapeJsonString(canonical));

    // render page
    const html = renderHtml({ head, header, footer, title, bodyHtml });

    // write to /blog/news/<slug>/index.html
    const outDir = path.join(OUT_DIR, slug);
    const outFile = path.join(outDir, "index.html");
    await ensureDir(outDir);
    await fs.writeFile(outFile, html, "utf8");
    console.log(`✔ built: /blog/news/${slug}/index.html`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
