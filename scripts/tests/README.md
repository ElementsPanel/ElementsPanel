# Host tests

The root `npm test` command runs this directory's `*.test.cjs` files.
These tests cover the host and built-in plugins and must work with an empty
`external/` directory.

Keep third-party plugin tests in that plugin's workspace and run them through
its own test command. Do not import a specific plugin from `external/`, even
conditionally: the contents of that directory belong to the user.

Tests of external plugin discovery, packaging, dependencies and lifecycle are
host tests. Use temporary fixture workspaces or in-memory example plugins for
those tests instead of reading the user's plugins.

Reuse `helpers.cjs` for in-memory TypeScript/Vue loading, deferred promises and
browser setup. Keep dependency replacements in the individual test fixtures.

Prefer observable behavior and failure cases over source-text or CSS assertions.
Translation completeness is checked once by `i18n-review.test.cjs`; feature suites
do not need to repeat it.
