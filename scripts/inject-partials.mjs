// scripts/inject-partials.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const PART_DIR = path.join(ROOT, "partials");

// injek di dua folder ini:
const TARGET_DIRS = [
  path.join(ROOT, "blog"),
  path.join(ROOT, "bukti"),
];

async function readPartial(name) {
  try { return await fs.readFile(path.join(PART_DIR, `${name}.html`), "utf8"); }
  catch { return ""; }
}

async function* walk(dir) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(res);
    else if (d.isFile() && d.name.endsWith(".html")) yield res;
  }
}

// hindari double-inject head
function alreadyHasHead(html) {
  return /<meta[^>]+name=["']robots["']/i.test(html) ||
         /<meta[^>]+property=["']og:title["']/i.test(html) ||
         html.includes("<!-- PARTIAL:HEAD_ARTICLE (injected) -->");
}

async function main() {
  const head   = await readPartial("head-article");
  const header = await readPartial("header");
  const footer = await readPartial("footer");

  for (const base of TARGET_DIRS) {
    try { await fs.access(base); } catch { continue; }

    for await (const file of walk(base)) {
      let html = await fs.readFile(file, "utf8");
      let changed = false;

      // ===== Inject HEAD (meta/og/ld) =====
      if (head && /<head[^>]*>/i.test(html) && !alreadyHasHead(html)) {
        if (html.includes("<!-- PARTIAL:HEAD_ARTICLE -->")) {
          html = html.replace(
            "<!-- PARTIAL:HEAD_ARTICLE -->",
            `<!-- PARTIAL:HEAD_ARTICLE (injected) -->\n${head}`
          );
          changed = true;
        } else if (html.includes("<!-- PARTIAL:HEAD -->")) {
          html = html.replace(
            "<!-- PARTIAL:HEAD -->",
            `<!-- PARTIAL:HEAD (injected) -->\n${head}`
          );
          changed = true;
        } else {
          html = html.replace(/<\/head>/i, `${head}\n</head>`);
          changed = true;
        }
      }

      // ===== Inject HEADER =====
      if (header) {
        if (html.includes("<!-- PARTIAL:HEADER -->")) {
          html = html.replace("<!-- PARTIAL:HEADER -->", header);
          changed = true;
        } else if (/<header[\s\S]*?<\/header>/i.test(html)) {
          html = html.replace(/<header[\s\S]*?<\/header>/i, header);
          changed = true;
        } else if (/<body[^>]*>/i.test(html) && !html.includes(header)) {
          html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${header}`);
          changed = true;
        }
      }

      // ===== Inject FOOTER =====
      if (footer) {
        if (html.includes("<!-- PARTIAL:FOOTER -->")) {
          html = html.replace("<!-- PARTIAL:FOOTER -->", footer);
          changed = true;
        } else if (/<footer[\s\S]*?<\/footer>/i.test(html)) {
          html = html.replace(/<footer[\s\S]*?<\/footer>/i, footer);
          changed = true;
        } else if (/<\/body>/i.test(html) && !html.includes(footer)) {
          html = html.replace(/<\/body>/i, `${footer}\n</body>`);
          changed = true;
        }
      }

      if (changed) await fs.writeFile(file, html, "utf8");
    }
  }

  console.log("[inject-partials] Done");
}

main().catch((e) => { console.error(e); process.exit(1); });
