const { from, createLoader } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { Parser } = require("i18next-scanner");
const {
  LANGUAGES,
  keyFromEnglishText,
  readCatalogue,
  validateCatalogues
} = require("../i18n-catalogues.cjs");
const { createConfig } = require("../../i18-scanner.config.js");

const root = path.resolve(__dirname, "../..");
const frontendRequire = from("frontend");
const ts = frontendRequire("typescript");
const globalPanel = "plugins/i18n/panel/src/languages";
const globalDaemon = "plugins/i18n/daemon/src/languages";
const feature = "plugins/feature/panel/src/i18n";

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-i18n-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [catalogue, messages] of [
    [globalPanel, { TXT_CODE_PANEL_ONLY: "Panel only" }],
    [globalDaemon, { TXT_CODE_DAEMON_ONLY: "Daemon only {{value}}" }],
    [feature, { TXT_CODE_FEATURE_ONLY: "Feature only {name}" }]
  ]) {
    fs.mkdirSync(path.join(directory, catalogue), { recursive: true });
    for (const language of LANGUAGES) {
      fs.writeFileSync(
        path.join(directory, catalogue, `${language}.json`),
        JSON.stringify(messages)
      );
    }
  }
  return directory;
}

function invoke(callback, receiver, ...args) {
  return new Promise((resolve, reject) =>
    callback.call(receiver, ...args, (error) => (error ? reject(error) : resolve()))
  );
}

test("scanner keeps panel, daemon and plugin catalogues separate and adds each text in all languages", async (t) => {
  const directory = workspace(t);
  const config = createConfig(directory);
  const parser = new Parser(config.options);
  const panelFile = path.join(directory, "plugins/shared/panel/src/component.vue");
  fs.mkdirSync(path.dirname(panelFile), { recursive: true });
  fs.writeFileSync(
    panelFile,
    'const untouched = "Panel text"; t("Panel text"); $t (\'Panel text\'); t("Quote \\"here\\""); t(`Hello ${name}`);'
  );
  const daemonFile = path.join(directory, "core/daemon/src/index.ts");
  fs.mkdirSync(path.dirname(daemonFile), { recursive: true });
  fs.writeFileSync(daemonFile, '$t("Daemon text");');
  const featureFile = path.join(directory, "plugins/feature/panel/src/component.vue");
  fs.writeFileSync(featureFile, 't("Feature text");');
  for (const filename of [panelFile, daemonFile, featureFile]) {
    await invoke(config.transform, { parser }, { path: filename }, "utf8");
  }
  await invoke(config.flush, { parser });

  const key = keyFromEnglishText;
  assert.equal(key("Panel text"), "TXT_CODE_PANEL_TEXT");
  assert.equal(key('Quote "here"'), "TXT_CODE_QUOTE_HERE");
  const updatedSource = fs.readFileSync(panelFile, "utf8");
  assert.ok(updatedSource.startsWith('const untouched = "Panel text";'));
  assert.ok(updatedSource.includes(`t("${key("Panel text")}")`));
  assert.ok(updatedSource.includes(`$t ('${key("Panel text")}')`));
  assert.ok(updatedSource.includes(`t("${key('Quote "here"')}")`));
  assert.ok(updatedSource.includes("t(`Hello ${name}`)"));
  for (const language of LANGUAGES) {
    const read = (catalogue) => readCatalogue(path.join(directory, catalogue, `${language}.json`));
    assert.deepEqual(read(globalPanel), {
      TXT_CODE_PANEL_ONLY: "Panel only",
      [key("Panel text")]: "Panel text",
      [key('Quote "here"')]: 'Quote "here"'
    });
    assert.deepEqual(read(globalDaemon), {
      TXT_CODE_DAEMON_ONLY: "Daemon only {{value}}",
      [key("Daemon text")]: "Daemon text"
    });
    assert.deepEqual(read(feature), {
      TXT_CODE_FEATURE_ONLY: "Feature only {name}",
      [key("Feature text")]: "Feature text"
    });
  }
  validateCatalogues(directory);
});

test("scanner rejects hashes, non-English raw text and semantic key collisions before rewriting source", async (t) => {
  const directory = workspace(t);
  const filename = path.join(directory, "core/frontend/src/component.vue");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const config = createConfig(directory);
  const parser = new Parser(config.options);
  for (const [source, error] of [
    ['t("TXT_CODE_10430e01");', /meaningful TXT_CODE_ key/],
    ['t("TXT_CODE_G1C43S2H");', /meaningful TXT_CODE_ key/],
    ['t("保存设置");', /explicit meaningful TXT_CODE_ key/],
    ['t("Panel only!");', /TXT_CODE_PANEL_ONLY already has a different translation/]
  ]) {
    fs.writeFileSync(filename, source);
    await assert.rejects(invoke(config.transform, { parser }, { path: filename }, "utf8"), error);
    assert.equal(fs.readFileSync(filename, "utf8"), source);
  }
});

test("scanner reuses an existing English semantic key without changing its localized text", async (t) => {
  const directory = workspace(t);
  const chinese = path.join(directory, globalPanel, "zh_CN.json");
  fs.writeFileSync(chinese, JSON.stringify({ TXT_CODE_PANEL_ONLY: "仅面板" }));
  const filename = path.join(directory, "core/frontend/src/component.vue");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, 't("Panel only");');
  const config = createConfig(directory);
  const parser = new Parser(config.options);
  await invoke(config.transform, { parser }, { path: filename }, "utf8");
  await invoke(config.flush, { parser });
  assert.equal(fs.readFileSync(filename, "utf8"), 't("TXT_CODE_PANEL_ONLY");');
  assert.equal(readCatalogue(chinese).TXT_CODE_PANEL_ONLY, "仅面板");
});

test("legacy sync is read-only and preserves daemon-only translations", (t) => {
  const directory = workspace(t);
  fs.mkdirSync(path.join(directory, "scripts"));
  for (const filename of ["sync-global-i18n.mjs", "check-i18n.mjs", "i18n-catalogues.cjs"]) {
    fs.copyFileSync(
      path.join(root, "scripts", filename),
      path.join(directory, "scripts", filename)
    );
  }
  const daemonFile = path.join(directory, globalDaemon, "zh_CN.json");
  const before = fs.readFileSync(daemonFile, "utf8");
  execFileSync(process.execPath, [path.join(directory, "scripts/sync-global-i18n.mjs")]);
  assert.equal(fs.readFileSync(daemonFile, "utf8"), before);
});

test("catalogue checks reject missing languages, keys, empty values, duplicates and interpolation drift", (t) => {
  const directory = workspace(t);
  const filename = path.join(directory, feature, "ja_JP.json");
  const original = fs.readFileSync(filename, "utf8");
  for (const [content, error] of [
    ["{}", /missing keys.*TXT_CODE_FEATURE_ONLY/],
    ['{"featureOnly":"Feature only {name}"}', /meaningful TXT_CODE_ key/],
    ['{"TXT_CODE_DEADBEEF":"Feature only {name}"}', /meaningful TXT_CODE_ key/],
    ['{"TXT_CODE_FEATURE_ONLY":""}', /non-empty translation/],
    ['{"TXT_CODE_FEATURE_ONLY":"Hello {other}"}', /interpolation placeholders differ/],
    [
      '{"TXT_CODE_FEATURE_ONLY":"Hello {name}","TXT_CODE_FEATURE_ONLY":"Hello {name}"}',
      /duplicate translation key/
    ]
  ]) {
    fs.writeFileSync(filename, content);
    assert.throws(() => validateCatalogues(directory), error);
  }
  fs.writeFileSync(filename, original);
  for (const language of LANGUAGES) {
    const catalogue = path.join(directory, feature, `${language}.json`);
    const messages = JSON.parse(fs.readFileSync(catalogue, "utf8"));
    messages.TXT_CODE_FEATURE_DUPLICATE = messages.TXT_CODE_FEATURE_ONLY;
    fs.writeFileSync(catalogue, JSON.stringify(messages));
  }
  assert.throws(() => validateCatalogues(directory), /duplicate translations/);
  const localized = JSON.parse(fs.readFileSync(filename, "utf8"));
  localized.TXT_CODE_FEATURE_DUPLICATE = "別の機能 {name}";
  fs.writeFileSync(filename, JSON.stringify(localized));
  assert.doesNotThrow(() => validateCatalogues(directory));
  for (const language of LANGUAGES) {
    const catalogue = path.join(directory, feature, `${language}.json`);
    const messages = JSON.parse(fs.readFileSync(catalogue, "utf8"));
    delete messages.TXT_CODE_FEATURE_DUPLICATE;
    fs.writeFileSync(catalogue, JSON.stringify(messages));
  }
  fs.unlinkSync(path.join(directory, feature, "en_US.json"));
  assert.throws(() => validateCatalogues(directory), /expected these language files/);
});

test("reference checks include lookup tables, template literals and unprefixed calls", (t) => {
  const directory = workspace(t);
  const filename = path.join(directory, "plugins/feature/panel/src/component.vue");
  for (const [source, error] of [
    ['t("Save settings");', /meaningful TXT_CODE_ key/],
    ["t(`TXT_CODE_UNKNOWN_MESSAGE`);", /missing translation TXT_CODE_UNKNOWN_MESSAGE/],
    [
      'const keys = { title: "TXT_CODE_UNKNOWN_MESSAGE" }; t(keys.title);',
      /missing translation TXT_CODE_UNKNOWN_MESSAGE/
    ]
  ]) {
    fs.writeFileSync(filename, source);
    assert.throws(() => validateCatalogues(directory), error);
  }
  fs.writeFileSync(filename, 'const keys = { title: "TXT_CODE_FEATURE_ONLY" }; t(keys.title);');
  assert.doesNotThrow(() => validateCatalogues(directory));
});

test("initializer dictionaries and indirect translator calls participate in validation", (t) => {
  const directory = workspace(t);
  const initializerDir = path.join(directory, "packages/init-elementspanel");
  fs.mkdirSync(initializerDir, { recursive: true });
  const dictionary = path.join(initializerDir, "i18n.cjs");
  fs.writeFileSync(
    dictionary,
    'module.exports.localeMessages = { en: { TXT_CODE_INIT_READY: "Ready {name}" }, zh: { TXT_CODE_INIT_READY: "就绪 {name}" } };'
  );
  const filename = path.join(initializerDir, "index.cjs");
  fs.writeFileSync(filename, 'createTranslator()("TXT_CODE_INIT_READY");');
  assert.equal(validateCatalogues(directory).initializerFiles, 2);
  fs.writeFileSync(filename, 'createTranslator()("ready");');
  assert.throws(() => validateCatalogues(directory), /meaningful TXT_CODE_ key/);
  fs.writeFileSync(filename, 'createTranslator()("TXT_CODE_INIT_UNKNOWN");');
  assert.throws(() => validateCatalogues(directory), /missing translation TXT_CODE_INIT_UNKNOWN/);
  fs.writeFileSync(filename, 'createTranslator()("TXT_CODE_INIT_READY");');
  fs.writeFileSync(
    dictionary,
    'module.exports.localeMessages = { en: { TXT_CODE_INIT_READY: "Ready {name}" }, zh: { TXT_CODE_INIT_READY: "就绪 {other}" } };'
  );
  assert.throws(() => validateCatalogues(directory), /interpolation placeholders differ/);
});

test("sorting fails before writing any catalogue when a language is invalid", async (t) => {
  const directory = workspace(t);
  const unchanged = path.join(directory, globalPanel, "en_US.json");
  const before = fs.readFileSync(unchanged, "utf8");
  fs.writeFileSync(path.join(directory, feature, "fr_FR.json"), "{");
  const { sortLanguageFiles } = await import(
    pathToFileURL(path.join(root, "scripts/sort-lang-key.mjs"))
  );
  await assert.rejects(sortLanguageFiles(directory));
  assert.equal(fs.readFileSync(unchanged, "utf8"), before);
});

test("repository translations cover every language and static translation reference", () => {
  assert.ok(validateCatalogues(root).files >= 240);
});

const load = createLoader({ compiler: ts, globals: true, host: "frontend" });

test("frontend resolves regional locales and stores only supported selections", async (t) => {
  const { Context } = frontendRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const stored = new Map();
  let reloads = 0;
  const browser = { navigator: { language: "zh-CN" }, location: { reload: () => reloads++ } };
  const facade = load("plugins/i18n/panel/src/lang/i18n.ts", { "@/plugin/context": { ctx } });
  assert.equal(facade.toStandardLang(" ZH-Hant-HK "), "zh_hant_hk");
  const plugin = load(
    "plugins/i18n/panel/src/frontend.ts",
    {
      "@/lang/i18n": facade,
      "./messages": { baseLocaleMessages: { en_us: {}, zh_tw: {} } }
    },
    { window: browser, localStorage: { setItem: (key, value) => stored.set(key, value) } }
  );
  ctx.set("startup", { language: "zh-Hant-HK" });
  ctx.plugin(plugin);
  const service = ctx.i18n;
  assert.equal(service.getCurrentLang(), "zh_tw");
  for (const [input, expected] of [
    ["en-GB", "en_us"],
    ["PT-PT", "pt_br"],
    ["ja", "ja_jp"],
    ["de-DE", "de_de"],
    ["unsupported", "en_us"],
    ["cn", "en_us"]
  ]) {
    assert.equal(service.searchSupportLanguage(input), expected);
  }
  service.setLanguage("en-GB", false);
  assert.equal(service.getCurrentLang(), "en_us");
  assert.equal(stored.get("LANGUAGE"), "en_us");
  assert.equal(service.isCN(), false);
  assert.equal(service.isEN(), true);
  assert.equal(reloads, 0);
  service.setLanguage("not-supported");
  assert.equal(stored.get("LANGUAGE"), "en_us");
  assert.equal(reloads, 1);
});
