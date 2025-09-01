// scripts/write-indexnow-key.mjs
import { promises as fs } from "fs";
import path from "path";
const ROOT = process.cwd();
const KEY = process.env.INDEXNOW_KEY || "";
const isProd = process.env.CONTEXT === "production";

if (isProd && KEY) {
  await fs.writeFile(path.join(ROOT, `${KEY}.txt`), KEY, "utf8");
  console.log("[IndexNow] key file written"); // jangan log nama file / nilai
} else {
  console.log("[IndexNow] skip writing key (non-prod or empty key).");
}
