import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES, findCatalogues, validateCatalogues } from "./i18n-catalogues.cjs";

export async function sortLanguageFiles(
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
) {
  validateCatalogues(root);
  for (const directory of findCatalogues(root)) {
    for (const language of LANGUAGES) {
      const filename = path.join(root, directory, `${language}.json`);
      const content = await readFile(filename, "utf8");
      const messages = JSON.parse(content);
      const sorted = Object.fromEntries(
        Object.entries(messages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      );
      const output = JSON.stringify(sorted, null, 2) + "\n";
      if (output !== content) await writeFile(filename, output, "utf8");
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await sortLanguageFiles();
  console.log("Language files sorted successfully.");
}
