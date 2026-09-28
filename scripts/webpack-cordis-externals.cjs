/**
 * cordis provides the plugin system for the panel and the daemon. Its `Context`
 * class must be one instance shared between the host bundle (`app.js`) and every
 * plugin bundle: a plugin that registered its services on a second copy of the
 * container would be invisible to the host.
 *
 * The cordis packages declare `"type": "module"`, so the `isEsmPackage` allowlist
 * the host configs pass to `nodeExternals()` would inline a copy of each of them
 * into every bundle. They all also ship a CommonJS entry behind an `exports`
 * `require` condition, so a plain `require()` resolves them. Listing them here
 * keeps them external ahead of that allowlist.
 *
 * Shared by `panel/webpack{,.plugins}.config.js` and
 * `daemon/webpack{,.plugins}.config.js` so the four configs cannot drift.
 */
module.exports = {
  cordis: "commonjs2 cordis",
  "@cordisjs/core": "commonjs2 @cordisjs/core",
  "@cordisjs/logger": "commonjs2 @cordisjs/logger",
  "@cordisjs/timer": "commonjs2 @cordisjs/timer",
  "@cordisjs/schema": "commonjs2 @cordisjs/schema",
  cosmokit: "commonjs2 cosmokit",
  schemastery: "commonjs2 schemastery",
  reggol: "commonjs2 reggol"
};
