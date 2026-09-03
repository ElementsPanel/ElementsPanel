import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const panelDir = path.join(import.meta.dirname, "../panel/plugins/i18n/src/languages");
const daemonDir = path.join(import.meta.dirname, "../daemon/plugins/i18n/src/languages");

const files = (await readdir(panelDir)).filter((file) => file.endsWith(".json")).sort();
if (files.length !== 12) {
  throw new Error(`Expected twelve panel language files, found ${files.length}.`);
}

await mkdir(daemonDir, { recursive: true });
await Promise.all(files.map((file) => copyFile(path.join(panelDir, file), path.join(daemonDir, file))));
console.log(`Synchronized ${files.length} global language files from panel to daemon.`);
