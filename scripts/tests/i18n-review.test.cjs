const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { Parser } = require("i18next-scanner");
const { crc32 } = require("crc");
const { LANGUAGES, readCatalogue, validateCatalogues } = require("../i18n-catalogues.cjs");
const { createConfig } = require("../../i18-scanner.config.js");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = frontendRequire("typescript");
const globalPanel = "panel/plugins/i18n/src/languages";
const globalDaemon = "daemon/plugins/i18n/src/languages";
const feature = "panel/plugins/feature/src/i18n";

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
  const panelFile = path.join(directory, "panel/plugins/shared/src/component.vue");
  fs.mkdirSync(path.dirname(panelFile), { recursive: true });
  fs.writeFileSync(
    panelFile,
    'const untouched = "Panel text"; t("Panel text"); $t (\'Panel text\'); t("Quote \\"here\\""); t(`Hello ${name}`);'
  );
  const daemonFile = path.join(directory, "daemon/src/index.ts");
  fs.mkdirSync(path.dirname(daemonFile), { recursive: true });
  fs.writeFileSync(daemonFile, '$t("Daemon text");');
  const featureFile = path.join(directory, "panel/plugins/feature/src/component.vue");
  fs.writeFileSync(featureFile, 't("Feature text");');
  for (const filename of [panelFile, daemonFile, featureFile]) {
    await invoke(config.transform, { parser }, { path: filename }, "utf8");
  }
  await invoke(config.flush, { parser });

  const key = (value) => `TXT_CODE_${crc32(value).toString(16)}`;
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
  fs.unlinkSync(path.join(directory, feature, "en_US.json"));
  assert.throws(() => validateCatalogues(directory), /expected these language files/);
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

function load(filename, overrides = {}, environment = {}) {
  filename = path.join(root, filename);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.environment = environment;
  mod.require = (id) =>
    Object.hasOwn(overrides, id)
      ? overrides[id]
      : id.startsWith(".")
      ? localRequire(id)
      : frontendRequire(id);
  const globals = Object.keys(environment)
    .map((name) => `const ${name} = module.environment.${name};`)
    .join("\n");
  mod._compile(
    globals +
      "\n" +
      ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true
        },
        fileName: filename
      }).outputText,
    filename
  );
  return mod.exports;
}

test("frontend resolves regional locales and stores only supported selections", async (t) => {
  const { Context } = frontendRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const stored = new Map();
  let reloads = 0;
  const browser = { navigator: { language: "zh-CN" }, location: { reload: () => reloads++ } };
  const facade = load("panel/plugins/i18n/src/lang/i18n.ts", { "@/plugin/context": { ctx } });
  assert.equal(facade.toStandardLang(" ZH-Hant-HK "), "zh_hant_hk");
  const plugin = load(
    "panel/plugins/i18n/src/frontend.ts",
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
