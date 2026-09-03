// Automatically sort the panel and daemon global language catalogues.

import { promises as fs } from "fs";
import path from "path";

const languagesDirs = [
  path.join(import.meta.dirname, "../panel/plugins/i18n/src/languages"),
  path.join(import.meta.dirname, "../daemon/plugins/i18n/src/languages")
];

export async function sortLanguageFiles() {
  try {
    for (const languagesDir of languagesDirs) {
      const languageFiles = await fs.readdir(languagesDir);
      await Promise.all(
        languageFiles.map(async (file) => {
          if (!file.endsWith(".json")) return;
          console.log(`Sorting ${languagesDir}/${file}...`);
          const filePath = path.join(languagesDir, file);
          const content = await fs.readFile(filePath, "utf8");
          const jsonContent = JSON.parse(content);
          const keysCount = Object.keys(jsonContent).length;
          const sortedContent = Object.keys(jsonContent)
            .sort()
            .reduce((obj, key) => {
              obj[key] = jsonContent[key];
              return obj;
            }, {});
          if (keysCount !== Object.keys(sortedContent).length) {
            throw new Error(`Error: ${file} keys count is not equal`);
          }
          return await fs.writeFile(filePath, JSON.stringify(sortedContent, null, 2));
        })
      );
    }
    console.log("All language files sorted successfully");
  } catch (err) {
    console.error("Error sorting language files:", err);
  }
}

sortLanguageFiles();
