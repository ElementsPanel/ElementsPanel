const fs = require("fs");
const { crc32 } = require("crc");

const FN_KEY = "TXT_CODE_";
const LANGUAGES = ["zh_CN", "en_US"];

module.exports = {
  input: ["./**/*.{ts,vue}", "!**/node_modules/**"],
  output: "./",
  options: {
    debug: false,
    func: false,
    trans: false,
    lngs: LANGUAGES,
    defaultLng: "zh",
    resource: {
      // The panel catalogue is the scanner's canonical output. The workspace
      // i18n command synchronizes the same complete catalogue to daemon after
      // scanning, so both runtime plugins remain byte-for-byte identical.
      loadPath: "./panel/plugins/i18n/src/languages/{{lng}}.json",
      savePath: "./panel/plugins/i18n/src/languages/{{lng}}.json",
      jsonIndent: 2,
      lineEnding: "\n"
    },
    removeUnusedKeys: false,
    nsSeparator: false,
    keySeparator: false,
    interpolation: {
      prefix: "{{",
      suffix: "}}"
    }
  },

  transform: function customTransform(file, enc, done) {
    const parser = this.parser;
    const content = fs.readFileSync(file.path, enc);
    let newCode = content;
    parser.parseFuncFromString(content, { list: ["t", "$t"] }, (key, options) => {
      if (String(key).includes(FN_KEY)) return;
      options.defaultValue = key;
      let hashKey = `${FN_KEY}${crc32(key).toString(16)}`;
      console.log("Transform text:", key, "->", hashKey);
      newCode = String(newCode).replace(`"${key}"`, `"${hashKey}"`);
      newCode = String(newCode).replace(`'${key}'`, `'${hashKey}'`);
      parser.set(hashKey, options);
    });

    if (newCode != content) fs.writeFileSync(file.path, newCode, { encoding: "utf-8" });

    done();
  }
};
