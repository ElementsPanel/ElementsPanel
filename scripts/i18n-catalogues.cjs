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

function assertSemanticKey(key, location) {
  if (
    !/^TXT_CODE_[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(key) ||
    !key
      .slice(9)
      .split("_")
      .some((word) => /^[A-Z]{2,}$/.test(word)) ||
    /^TXT_CODE_[A-F0-9]{8}$/.test(key)
  ) {
    throw new Error(
      `${location}: ${key} must be a meaningful TXT_CODE_ key in uppercase snake case.`
    );
  }
}

function keyFromEnglishText(text) {
  if (/[\u0080-\uFFFF]/.test(text)) {
    throw new Error("Provide an explicit meaningful TXT_CODE_ key for non-English text.");
  }
  const name = text
    .replace(/\{\{[^{}]*\}\}|\{[^{}]*\}/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const key = `TXT_CODE_${name}`;
  assertSemanticKey(key, "Translation text");
  return key;
}

function validateMessages(messages, filename) {
  if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
    throw new Error(`${filename}: expected an object of translation strings.`);
  }
  for (const [key, value] of Object.entries(messages)) {
    assertSemanticKey(key, filename);
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${filename}: ${key} must contain a non-empty translation string.`);
    }
  }
}

function findCatalogues(root) {
  const catalogues = [];
  const pluginsDir = path.join(root, "plugins");
  if (!fs.existsSync(pluginsDir)) return catalogues;
  for (const plugin of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue;
    for (const side of ["panel", "daemon"]) {
      const directory = `plugins/${plugin.name}/${side}/src/${
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
  validateMessages(messages, filename);
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
    else if (/\.(?:[cm]?ts|tsx|vue|[cm]?js|jsx)$/.test(entry.name)) files.push(filename);
  }
  return files;
}

function assertUniqueTranslations(catalogues, location) {
  const values = new Map();
  for (const key of Object.keys(catalogues[0])) {
    // Merge only keys whose translations match in every language.
    const signature = JSON.stringify(catalogues.map((messages) => messages[key]));
    const existing = values.get(signature);
    if (existing !== undefined) {
      throw new Error(
        `${location}: duplicate translations for ${existing} and ${key}; reuse one key.`
      );
    }
    values.set(signature, key);
  }
}

function validateCatalogues(root, { checkReferences = true } = {}) {
  const catalogues = findCatalogues(root);
  const available = { panel: new Set(), daemon: new Set() };
  const initializerKeys = new Set();
  let initializerFiles = 0;
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
    const side = directory.split("/")[2];
    for (const key of expectedKeys) available[side].add(key);
    const localizedMessages = [];
    for (const language of LANGUAGES) {
      const filename = path.join(root, directory, `${language}.json`);
      const messages = readCatalogue(filename);
      localizedMessages.push(messages);
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
    assertUniqueTranslations(localizedMessages, directory);
  }
  const initializer = path.join(root, "packages/init-elementspanel/i18n.cjs");
  if (fs.existsSync(initializer)) {
    delete require.cache[require.resolve(initializer)];
    const { localeMessages } = require(initializer);
    if (!localeMessages || Object.keys(localeMessages).sort().join() !== "en,zh") {
      throw new Error(`${initializer}: expected English and Chinese initializer dictionaries.`);
    }
    const english = localeMessages.en;
    validateMessages(english, `${initializer}:en`);
    for (const key of Object.keys(english)) initializerKeys.add(key);
    for (const [language, messages] of Object.entries(localeMessages)) {
      validateMessages(messages, `${initializer}:${language}`);
      if (Object.keys(messages).sort().join() !== Object.keys(english).sort().join()) {
        throw new Error(`${initializer}:${language}: initializer translation keys differ.`);
      }
      for (const key of Object.keys(english)) {
        if (placeholders(messages[key]) !== placeholders(english[key])) {
          throw new Error(
            `${initializer}:${language}: interpolation placeholders differ for ${key}.`
          );
        }
      }
      initializerFiles++;
    }
    assertUniqueTranslations(Object.values(localeMessages), initializer);
  }
  if (checkReferences) {
    for (const directory of [
      "core/common/src",
      "core/panel/src",
      "core/daemon/src",
      "core/frontend/src",
      "plugins",
      "packages"
    ]) {
      for (const filename of sourceFiles(root, directory)) {
        if (
          filename.startsWith("plugins/") &&
          !/^plugins\/[^/]+\/(panel|daemon)\/src\//.test(filename)
        ) {
          continue;
        }
        const side = /^(?:core\/daemon\/|plugins\/[^/]+\/daemon\/)/.test(filename)
          ? "daemon"
          : "panel";
        const content = fs.readFileSync(path.join(root, filename), "utf8");
        const keys = filename.startsWith("packages/init-elementspanel/")
          ? initializerKeys
          : available[side];
        const checkKey = (key, index) => {
          const line = content.slice(0, index).split("\n").length;
          assertSemanticKey(key, `${filename}:${line}`);
          if (!keys.has(key)) {
            throw new Error(`${filename}:${line}: missing translation ${key}.`);
          }
        };
        const calls =
          /(?<![\w$])(?:t|\$t|translate|createTranslator\s*\([^()\r\n]*\))\s*\(\s*(["'`])([^"'`\r\n]+)\1\s*[,)]/g;
        for (const match of content.matchAll(calls)) {
          if (match[1] === "`" && match[2].includes("${")) continue;
          checkKey(match[2], match.index);
        }
        // Include keys held in lookup tables, arrays and conditional expressions.
        for (const match of content.matchAll(/(["'`])(TXT_CODE_[^"'`\r\n]+)\1/g)) {
          if (match[1] === "`" && match[2].includes("${")) continue;
          checkKey(match[2], match.index);
        }
      }
    }
  }
  return {
    catalogues: catalogues.length,
    files: catalogues.length * LANGUAGES.length,
    initializerFiles
  };
}

module.exports = {
  LANGUAGES,
  assertSemanticKey,
  keyFromEnglishText,
  findCatalogues,
  readCatalogue,
  validateCatalogues
};
