const fs = require("node:fs");
const path = require("node:path");
const { crc32 } = require("crc");
const {
  LANGUAGES,
  findCatalogues,
  readCatalogue,
  validateCatalogues
} = require("./scripts/i18n-catalogues.cjs");

const FN_KEY = "TXT_CODE_";

function createConfig(root = __dirname) {
  validateCatalogues(root, { checkReferences: false });
  const catalogues = findCatalogues(root);
  const namespaces = new Set(catalogues);
  const resourcePath = (language, namespace) => path.join(root, namespace, `${language}.json`);

  function namespaceForFile(filename) {
    const relative = path.relative(root, filename).replaceAll(path.sep, "/");
    const side = relative.startsWith("daemon/") ? "daemon" : "panel";
    const plugin = relative.match(/^(panel|daemon)\/plugins\/([^/]+)\/src\//);
    const scoped = plugin && `${side}/plugins/${plugin[2]}/src/i18n`;
    return namespaces.has(scoped) ? scoped : `${side}/plugins/i18n/src/languages`;
  }

  return {
    input: [
      "./panel/{src,plugins}/**/*.{ts,vue}",
      "./daemon/{src,plugins}/**/*.{ts,vue}",
      "./frontend/src/**/*.{ts,vue}",
      "!**/node_modules/**",
      "!**/production/**",
      "!**/dist/**"
    ],
    output: root,
    options: {
      debug: false,
      func: false,
      trans: false,
      attr: false,
      lngs: LANGUAGES,
      ns: catalogues,
      defaultLng: "zh_CN",
      defaultNs: "panel/plugins/i18n/src/languages",
      resource: { loadPath: resourcePath, savePath: resourcePath, jsonIndent: 2, lineEnding: "\n" },
      removeUnusedKeys: false,
      nsSeparator: false,
      keySeparator: false,
      plural: false,
      context: false
    },
    transform(file, _encoding, done) {
      try {
        const content = fs.readFileSync(file.path, "utf8");
        const namespace = namespaceForFile(file.path);
        // Replace only the first literal argument of a translation call. A
        // matching string elsewhere in the source must remain untouched.
        const calls =
          /((?<![\w$])(?:t|\$t)\s*\(\s*)("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|`(?:[^`\\]|\\[\s\S])*`)(?=\s*[,)]\s*)/g;
        const transformed = content.replace(calls, (call, prefix, literal) => {
          let replacement = literal;
          this.parser.parseFuncFromString(`t(${literal})`, { list: ["t"] }, (key) => {
            if (key.startsWith(FN_KEY)) return;
            const hashKey = `${FN_KEY}${crc32(key).toString(16)}`;
            this.parser.set(hashKey, { ns: namespace, defaultValue: key });
            replacement = `${literal[0]}${hashKey}${literal[0]}`;
          });
          return prefix + replacement;
        });
        if (transformed !== content) fs.writeFileSync(file.path, transformed, "utf8");
        done();
      } catch (error) {
        done(error);
      }
    },
    flush(done) {
      try {
        const resources = this.parser.get();
        for (const [language, bundles] of Object.entries(resources)) {
          for (const [namespace, messages] of Object.entries(bundles)) {
            const filename = resourcePath(language, namespace);
            const previous = readCatalogue(filename);
            if (JSON.stringify(previous) !== JSON.stringify(messages)) {
              fs.writeFileSync(filename, JSON.stringify(messages, null, 2) + "\n", "utf8");
            }
          }
        }
        done();
      } catch (error) {
        done(error);
      }
    }
  };
}

module.exports = createConfig();
module.exports.createConfig = createConfig;
