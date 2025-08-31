import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const TARGET_ROOT = path.join(ROOT, "blog");
const PARTIALS = {
  header: path.join(ROOT, "partials", "header.html"),
  footer: path.join(ROOT, "partials", "footer.html"),
};

function toPosix(p){ return p.split(path.sep).join("/"); }

async function readPartial(p){
  try {
    const html = await fs.readFile(p, "utf8");
    return html.trim();
  } catch (e) {
    throw new Error(`Gagal baca partial: ${p}\n${e.message}`);
  }
}

async function walk(dir, list = []){
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries){
    const abs = path.join(dir, e.name);
    if (e.isDirectory()){
      await walk(abs, list);
    } else if (e.isFile()){
      if (e.name === "index.html") list.push(abs);
    }
  }
  return list;
}

function replaceOrInsertHeader(html, header){
  const reHeader = /<header\b[\s\S]*?<\/header>/i;
  if (reHeader.test(html)){
    return html.replace(reHeader, header);
  }
  // sisipkan setelah <body>
  const reBodyOpen = /<body[^>]*>/i;
  if (reBodyOpen.test(html)){
    return html.replace(reBodyOpen, m => `${m}\n${header}\n`);
  }
  return html; // fallback: biarin
}

function replaceOrInsertFooter(html, footer){
  const reFooter = /<footer\b[\s\S]*?<\/footer>/i;
  if (reFooter.test(html)){
    return html.replace(reFooter, footer);
  }
  // sisipkan sebelum </body>
  const reBodyClose = /<\/body>/i;
  if (reBodyClose.test(html)){
    return html.replace(reBodyClose, `\n${footer}\n</body>`);
  }
  return html; // fallback
}

function tidy(html){
  // rapihkan spasi berlebih
  return html.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

async function main(){
  // pastikan folder blog ada
  try { await fs.access(TARGET_ROOT); }
  catch { console.log("Folder /blog/ belum ada, lewati injeksi."); return; }

  const header = await readPartial(PARTIALS.header);
  const footer = await readPartial(PARTIALS.footer);

  const files = await walk(TARGET_ROOT);
  let changed = 0;

  for (const abs of files){
    let html = await fs.readFile(abs, "utf8");
    const before = html;

    html = replaceOrInsertHeader(html, header);
    html = replaceOrInsertFooter(html, footer);
    html = tidy(html);

    if (html !== before){
      await fs.writeFile(abs, html, "utf8");
      changed++;
      const rel = toPosix(path.relative(ROOT, abs));
      console.log("Injected:", rel);
    }
  }

  if (changed === 0) {
    console.log("Tidak ada file yang diubah (mungkin partial sudah terpasang).");
  } else {
    console.log(`Selesai injeksi partial → ${changed} file.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
