const fs = require("node:fs");
const path = require("node:path");

const LANGUAGES = [
  "de_DE",
  "en_US",
  "es_ES",
  "fr_FR",
  "ja_JP",
  "ko_KR",
  "pt_BR",
  "ru_RU",
  "th_TH",
  "tr_TR",
  "zh_CN",
  "zh_TW"
];

function findCatalogues(root) {
  const catalogues = [];
  for (const side of ["panel", "daemon"]) {
    const pluginsDir = path.join(root, side, "plugins");
    for (const plugin of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      const directory = `${side}/plugins/${plugin.name}/src/${
        plugin.name === "i18n" ? "languages" : "i18n"
      }`;
      if (fs.existsSync(path.join(root, directory))) catalogues.push(directory);
    }
  }
  return catalogues.sort();
}

function readCatalogue(filename) {
  const content = fs.readFileSync(filename, "utf8");
  const messages = JSON.parse(content);
  if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
    throw new Error(`${filename}: expected an object of translation strings.`);
  }
  // Consume complete JSON strings so quoted text inside a message is never
  // mistaken for a key. JSON.parse alone silently discards duplicate keys.
  const tokens = content.match(/"(?:\\.|[^"\\])*"|[{}:,]/g) || [];
  const keys = new Set();
  for (let index = 0; index < tokens.length - 1; index++) {
    if (tokens[index + 1] !== ":") continue;
    const key = JSON.parse(tokens[index]);
    if (keys.has(key)) throw new Error(`${filename}: duplicate translation key ${key}.`);
    keys.add(key);
  }
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${filename}: ${key} must contain a non-empty translation string.`);
    }
  }
  return messages;
}

function placeholders(message) {
  const pattern = /\{\{\s*-?\s*([^{}]+?)\s*\}\}|(?<!\{)\{([\w.]+)\}(?!\})/g;
  return [
    ...new Set(
      [...message.matchAll(pattern)].map((match) =>
        match[1] ? `i18next:${match[1].trim()}` : `vue:${match[2]}`
      )
    )
  ]
    .sort()
    .join("|");
}

function sourceFiles(root, directory) {
  const files = [];
  if (!fs.existsSync(path.join(root, directory))) return files;
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    if (["node_modules", "production", "dist", ".git"].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(root, filename));
    else if (/\.(?:ts|tsx|vue|js|jsx)$/.test(entry.name)) files.push(filename);
  }
  return files;
}

function validateCatalogues(root, { checkReferences = true } = {}) {
  const catalogues = findCatalogues(root);
  const available = { panel: new Set(), daemon: new Set() };
  for (const directory of catalogues) {
    const actualLanguages = fs
      .readdirSync(path.join(root, directory))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5))
      .sort();
    if (actualLanguages.join() !== LANGUAGES.join()) {
      throw new Error(`${directory}: expected these language files: ${LANGUAGES.join(", ")}.`);
    }
    const english = readCatalogue(path.join(root, directory, "en_US.json"));
    const expectedKeys = Object.keys(english).sort();
    const side = directory.split("/")[0];
    for (const key of expectedKeys) available[side].add(key);
    for (const language of LANGUAGES) {
      const filename = path.join(root, directory, `${language}.json`);
      const messages = readCatalogue(filename);
      const keys = Object.keys(messages).sort();
      const missing = expectedKeys.filter((key) => !Object.hasOwn(messages, key));
      const extra = keys.filter((key) => !Object.hasOwn(english, key));
      if (missing.length || extra.length) {
        throw new Error(
          `${filename}: missing keys [${missing.join(", ")}]; extra keys [${extra.join(", ")}].`
        );
      }
      for (const key of expectedKeys) {
        if (placeholders(messages[key]) !== placeholders(english[key])) {
          throw new Error(`${filename}: interpolation placeholders differ for ${key}.`);
        }
      }
    }
  }
  if (checkReferences) {
    for (const directory of [
      "panel/src",
      "panel/plugins",
      "daemon/src",
      "daemon/plugins",
      "frontend/src"
    ]) {
      const side = directory.startsWith("daemon/") ? "daemon" : "panel";
      for (const filename of sourceFiles(root, directory)) {
        const content = fs.readFileSync(path.join(root, filename), "utf8");
        const calls = /(?:\bt|\$t|\btranslate)\s*\(\s*["'](TXT_CODE_[^"']+)["']/g;
        for (const match of content.matchAll(calls)) {
          if (!available[side].has(match[1])) {
            const line = content.slice(0, match.index).split("\n").length;
            throw new Error(`${filename}:${line}: missing translation ${match[1]}.`);
          }
        }
      }
    }
  }
  return { catalogues: catalogues.length, files: catalogues.length * LANGUAGES.length };
}

module.exports = { LANGUAGES, findCatalogues, readCatalogue, validateCatalogues };
