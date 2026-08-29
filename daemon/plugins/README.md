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
helpers, package-`install` helpers, `translate()`, and `logger`. Plugins can
extend the core dispatchers with `registerAsyncTask()`,
`registerScheduleAction()`, `registerPresetCommand()`, and `registerFeature()`.

`registerAsyncTask(taskName, registration)` accepts `requiresInstance: false`
for a task that builds its own instance rather than acting on an existing one,
and `requiredRole` for the minimum caller role the panel must report. The
`instance/asynchronous` dispatcher reads both off the registration, so it holds
no knowledge of any particular task.

`registerPresetCommand(preset, factory)` supplies the command behind one instance
preset. `FunctionDispatcher` applies these after its own defaults, so a plugin
can provide a preset the core has no implementation for — `install`, owned by
`plugins/market` — or replace one it does. Without the owning plugin the preset
is simply absent and `execPreset` does nothing.

## Translations

A plugin owns the strings only it uses. They live in `<plugin>/src/i18n/`, one
JSON file per language, next to an `index.ts` that exports them as
`localeMessages` keyed by the daemon's locale codes (`en_us`, `zh_cn`, ...).
Pass that object to `context.registerLocaleMessages()` as the first thing
`setup()` does, before any code path that can log or throw translated text.

The root `languages/` catalogue keeps only what the daemon core uses, plus the
strings shared with it. When you add a string, add it to every language file in
the folder that owns it — see `plugins/backup`.

Set `enabled` to `false` to skip a plugin. Plugins are loaded in ascending
`priority` order and a failed plugin is reported without stopping the daemon.

## Bundled plugins

`node` owns the `info/setting` protocol event, which is how the panel's node
plugin writes this daemon's configuration. See `panel/plugins/node`.

`backup` owns instance backup and restore protocol events, the
`instance_backup` asynchronous task, the scheduled `backup` action, and the
`instanceBackup` feature flag. It ships the console lines and errors it prints
in `src/i18n/`. See `panel/plugins/backup`.

`market` owns the `quick_install` asynchronous task and the `install` instance
preset — the two ways a market package reaches an instance. See
`panel/plugins/market`.
