const { frontendRequire } = require("./scripts/quality-tools.cjs");

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ["eslint:recommended", frontendRequire.resolve("eslint-config-prettier")],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  globals: { structuredClone: "readonly" },
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-constant-condition": ["error", { checkLoops: false }]
  },
  overrides: [
    {
      files: ["**/*.{ts,tsx,cts,mts,vue}"],
      parser: frontendRequire.resolve("@typescript-eslint/parser"),
      plugins: ["@typescript-eslint", "unused-imports"],
      rules: {
        "no-undef": "off",
        "no-redeclare": "off",
        "no-unused-vars": "off",
        "unused-imports/no-unused-imports": "error",
        "unused-imports/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }
        ]
      }
    },
    {
      files: ["**/*.vue"],
      env: { browser: true },
      extends: ["plugin:vue/vue3-recommended", frontendRequire.resolve("eslint-config-prettier")],
      parser: frontendRequire.resolve("vue-eslint-parser"),
      parserOptions: { parser: frontendRequire.resolve("@typescript-eslint/parser") },
      rules: {
        "vue/multi-word-component-names": "off",
        "vue/first-attribute-linebreak": "off",
        "vue/valid-v-slot": ["error", { allowModifiers: true }]
      }
    },
    {
      files: [
        "core/frontend/src/**/*",
        "core/frontend/plugin-bootstrap.mjs",
        "plugins/*/panel/**/*"
      ],
      excludedFiles: ["plugins/*/panel/src/backend/**"],
      env: { browser: true }
    },
    {
      files: ["scripts/tests/**/*.cjs", "scripts/performance/**/*.cjs"],
      env: { browser: true }
    }
  ]
};
