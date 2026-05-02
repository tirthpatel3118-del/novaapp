import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const webDir = join(projectRoot, "web");
const assets = ["index.html", "styles.css", "script.js", "config.js"];

if (existsSync(webDir)) {
  rmSync(webDir, { recursive: true, force: true });
}

mkdirSync(webDir, { recursive: true });

for (const asset of assets) {
  copyFileSync(join(projectRoot, asset), join(webDir, asset));
}

console.log("Prepared mobile web bundle in /web");
