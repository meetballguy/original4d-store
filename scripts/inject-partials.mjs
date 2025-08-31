// scripts/inject-partials.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const PART_DIR = path.join(ROOT, "partials");
const TARGET_DIRS = [path.join(ROOT, "blog")]; // injek hanya halaman blog

async function readPartial(name){
  try { return await fs.readFile(path.join(PART_DIR, `${name}.html`), "utf8"); }
  catch { return ""; }
}

async function* walk(dir){
  for (const d of await fs.readdir(dir, { withFileTypes: true })){
    const res = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(res);
    else if (d.isFile() && d.name.endsWith(".html")) yield res;
  }
}

async function main(){
  const header = await readPartial("header");
  const footer = await readPartial("footer");

  for (const base of TARGET_DIRS){
    try { await fs.access(base); } catch { continue; }
    for await (const file of walk(base)){
      let html = await fs.readFile(file, "utf8");

      if (header) {
        if (html.includes("<!-- PARTIAL:HEADER -->")) {
          html = html.replace("<!-- PARTIAL:HEADER -->", header);
        } else if (/<header[\s\S]*?<\/header>/i.test(html)) {
          html = html.replace(/<header[\s\S]*?<\/header>/i, header);
        } else {
          html = html.replace(/<body[^>]*>/i, m => `${m}\n${header}`);
        }
      }

      if (footer) {
        if (html.includes("<!-- PARTIAL:FOOTER -->")) {
          html = html.replace("<!-- PARTIAL:FOOTER -->", footer);
        } else if (/<footer[\s\S]*?<\/footer>/i.test(html)) {
          html = html.replace(/<footer[\s\S]*?<\/footer>/i, footer);
        } else {
          html = html.replace(/<\/body>/i, `${footer}\n</body>`);
        }
      }

      await fs.writeFile(file, html, "utf8");
    }
  }
  console.log("[inject-partials] Done");
}

main().catch(e => { console.error(e); process.exit(1); });
