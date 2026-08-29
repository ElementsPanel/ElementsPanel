# Daemon plugins

Each child directory is one daemon plugin. A source plugin contains
`plugin.json` and a `src` directory.

```json
{
  "id": "example-daemon",
  "name": "Example daemon plugin",
  "version": "1.0.0",
  "priority": 100,
  "backend": "backend/index.cjs"
}
```

Entries are written in TypeScript at `src/backend/index.ts`.
`daemon/webpack.plugins.config.js` compiles every such entry to
`<plugin>/backend/index.cjs` during `npm run build` in `daemon/`, externalizing
the daemon's runtime dependencies so the plugin shares its module instances.
Compiled backends are gitignored build output, and
`scripts/package-daemon-plugins.mjs` copies only them plus a rewritten
`plugin.json` into `production-code/daemon/plugins/` — `src/` is not shipped.

A plugin must not import daemon core modules: they are bundled into `app.js`, so
importing them would compile a second copy of each singleton. Take what you need
from the context instead; only `import type` from the core is safe.

The loader accepts `daemon`, `backend`, `main` or `entry` as the metadata field,
and any Node-loadable JavaScript (`.js`, `.cjs`, `.mjs`), so a hand-written entry
still works if you have a reason to skip the compile step.

The module exports `setup(context)` (or `install(context)`) and may also export
`ready(context)` and `dispose(context)`. The setup context contains the Koa `app`, a plugin `router`,
`registerRoute`, `registerRouter`, `registerMiddleware`, `registerProtocolHandler`,
`registerProtocolMiddleware`, `routerApp` for Socket.io protocol events,
`protocol`, the daemon `config`, `saveConfig()` to persist it, `setLanguage()`,
the instance subsystem, the `Instance` class, `asyncTask` services, backup
helpers, `translate()`, and `logger`. Plugins can extend the core dispatchers
with `registerAsyncTask()`, `registerScheduleAction()`, and `registerFeature()`.

Set `enabled` to `false` to skip a plugin. Plugins are loaded in ascending
`priority` order and a failed plugin is reported without stopping the daemon.

## Bundled plugins

`node` owns the `info/setting` protocol event, which is how the panel's node
plugin writes this daemon's configuration. See `panel/plugins/node`.

`backup` owns instance backup and restore protocol events, the
`instance_backup` asynchronous task, the scheduled `backup` action, and the
`instanceBackup` feature flag. See `panel/plugins/backup`.
