import { promises as fs } from "fs";
import path from "path";

// Keep both runtime plugins' global catalogues complete and in sync.
const LANGUAGES_DIRS = [
  path.join(import.meta.dirname, "../panel/plugins/i18n/src/languages"),
  path.join(import.meta.dirname, "../daemon/plugins/i18n/src/languages")
];

async function fillMissingKeys(languagesDir) {
  try {
    // Read the base file (en_US.json)
    const baseFile = path.join(languagesDir, "en_US.json");
    const baseContent = await fs.readFile(baseFile, "utf8");
    const baseJson = JSON.parse(baseContent);

    // Get all language files in the directory
    const files = await fs.readdir(languagesDir);

    for (const file of files) {
      // Skip the base file and non-json files
      if (file === "en_US.json" || !file.endsWith(".json")) continue;

      const filePath = path.join(languagesDir, file);
      const fileContent = await fs.readFile(filePath, "utf8");
      const fileJson = JSON.parse(fileContent);

      let hasChanges = false;

      // Iterate through all keys in the base file
      for (const key in baseJson) {
        // If the target file is missing this key, fill it with English value
        if (!fileJson.hasOwnProperty(key)) {
          fileJson[key] = baseJson[key];
          hasChanges = true;
        }
      }

      // If there are changes, write back to the file
      if (hasChanges) {
        await fs.writeFile(filePath, JSON.stringify(fileJson, null, 2) + "\n", "utf8");
        console.log(`Updated missing keys in ${file}`);
      }
    }

    console.log(`All language files have been processed in ${languagesDir}.`);
  } catch (error) {
    console.error("Error:", error);
  }
}

await Promise.all(LANGUAGES_DIRS.map((languagesDir) => fillMissingKeys(languagesDir)));
