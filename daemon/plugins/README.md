# Daemon plugins

Each child directory is one daemon plugin. A source plugin contains `plugin.json`
and a `src` directory.

```json
{
  "id": "example-daemon",
  "name": "Example daemon plugin",
  "version": "1.0.0",
  "priority": 100,
  "backend": "backend/index.cjs"
}
```

## The plugin shape

The daemon's plugin system is [cordis](https://github.com/cordiverse/cordis), the
same as the panel's. A plugin is a module that exports `apply`, and optionally
`inject`:

```ts
import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";

export const inject = ["i18n", "protocol", "instances"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.protocol.on("example/ping", (routerCtx, data) => {
    ctx.protocol.response(routerCtx, true);
  });
}
```

There is no `setup`, no `dispose` and no lifecycle to implement. `apply` may be
`async`. Everything a plugin registers is an effect of its own scope and is undone
when the plugin unloads, so a plugin never writes cleanup code — see
`panel/plugins/README.md`, which documents the model in full. `ctx.logger` and
`ctx.setTimeout` / `ctx.setInterval` / `ctx.sleep` / `ctx.throttle` /
`ctx.debounce` come from cordis.

Plugins are loaded in ascending `priority` order; use `inject` for real
dependencies and `priority` only for deterministic ordering among independent
plugins. A plugin that fails is reported and skipped; the daemon keeps running.
Set `enabled` to `false` to skip one.

## The context

| Service | What it gives you |
| --- | --- |
| `ctx.logger` | Named logger. `ctx.logger("sub")` for a sub-logger. |
| `ctx.timer` | `setTimeout` / `setInterval` / `sleep` / `throttle` / `debounce`, mixed onto `ctx`. |
| `ctx.settings` | `config`, `save()`, `setLanguage(lang)`. |
| `ctx.i18n` | `$t` and `define(messages)` for the plugin's own strings. |
| `ctx.settingsForm` | `declare({ fields, read, write })` — the plugin's configuration, which the panel renders. |
| `ctx.middleware` | `uploadSpeedLimit`, `uploadFileCheck` — the base middleware the web server mounts ahead of the body parser. |
| `ctx.protocol` | `on(event, handler)`, `use(middleware)`, `response`, `responseError`, `error`, `msg`, `ROLE`, `IGNORE`. |
| `ctx.instances` | `subsystem`, `Instance`, `Config`, `Command`, `UpdateAction`, `fileManager`, `headers`. |
| `ctx.transfer` | `passports`, `downloads`, `sendFile` — what a file transfer needs from the core. |
| `ctx.tasks` | `AsyncTask`, `Center`, `register(name, registration)`, `get(name)`. |
| `ctx.presets` | `register(preset, factory)`, `entries()`. |
| `ctx.schedules` | `register(actionType, handler)`, `get(actionType)`. |
| `ctx.features` | `add(feature)`, `has(feature)`. |
| `ctx.overview` | `provide(fn)` to add fields to `info/overview`. |
| `ctx.archive` | `GitignoreMatcher`, `compress`, `decompress`, `listArchiveEntries`, `decompressWithProgress`, `check7zipStatus`, `sevenZipPath`, `zipTimeoutSeconds`. |
| `ctx.plugins` | `loaded`, `inventory()`, `setEnabled(id, enabled)`. |
| `ctx.files` | `FileManager`, `uploads`, `getFileManager`, `getWindowsDisks`. **Provided by `plugins/filemanager`.** |
| `ctx.koa` | `app`, `use(middleware)`, `router(prefix?)` for plugins that serve HTTP. **Provided by `plugins/server`.** |
| `ctx.websocket` | `io`, the Socket.io server. **Provided by `plugins/server`.** |

`src/plugin/context.ts` is the authoritative declaration of all of this.

`ctx.set("files", ...)` is the file subsystem. `plugins/filemanager` owns the
sandboxed `FileManager`, the chunked uploads, the `file/*` events and the
upload/download routes; the core resolves the primitives at use time through
`src/service/file_access.ts`, because instance creation, the Java manager,
SteamCMD and the mod service all have to touch files too. Without that plugin the
daemon cannot read or write an instance's files at all.

The network services are provided by `plugins/server` with
`ctx.set()` rather than by the core. That plugin creates the Koa application,
mounts the base middleware, binds the HTTP/HTTPS listener and runs the Socket.io
server; the core keeps its own HTTP router and its own connection handling and
mounts them onto `ctx.koa.app` and `ctx.websocket.io` through
`daemon.inject(...)` once the plugin has provided them. The daemon is therefore
reachable over nothing without it. A plugin that provides a service cannot inject
it — see `plugins/server`, which leaves both names out of its own `inject` list.

`ctx.overview.provide(fn)` merges extra fields into the `info/overview` payload
the panel reads. The core reports what the panel needs to route and describe this
daemon; anything collected on top of that — the monitoring plugin's CPU and
memory history — is contributed here.

`ctx.tasks.register(taskName, registration)` accepts `requiresInstance: false`
for a task that builds its own instance rather than acting on an existing one, and
`requiredRole` for the minimum caller role the panel must report. The
`instance/asynchronous` dispatcher reads both off the registration, so it holds no
knowledge of any particular task.

`ctx.presets.register(preset, factory)` supplies the command behind one instance
preset. `FunctionDispatcher` applies these after its own defaults, so a plugin can
provide a preset the core has no implementation for — `install`, owned by
`plugins/market` — or replace one it does. Without the owning plugin the preset is
simply absent and `execPreset` does nothing.

Authentication is not on this list, because it is not a service: `plugins/auth`
owns it by registering the top-level `ctx.protocol.use()` middleware that gates
every event, plus the `auth` event itself. The core has no "is authentication
enabled" branch anywhere — without that plugin the daemon has no opinion on who is
calling, and answers everything to anyone who speaks the protocol. It loads at
`priority: 20`, ahead of every plugin that registers handlers, and the daemon does
not listen until `plugins/server` binds on `ready`, so no socket is ever routed
unguarded.

`ctx.protocol.on()` has one limitation worth knowing: `service/router.ts` copies
the handler list onto each socket as it connects, so a handler registered after a
client connected is invisible to that client. Plugins load before the server
starts listening, so this only constrains hot-reloading a plugin on a running
daemon.

`ctx.settingsForm.declare({ fields, read, write })` is how a daemon plugin gets a
settings page at all. It has no browser half to put a form in, so it describes the
form instead — the same description a panel plugin uses, documented in
`panel/plugins/README.md` — and the panel's plugin manager renders it. Labels are
resolved by `fields()` per request, in whatever language the panel last pushed
here, and validation lives in `write()`. `plugins/config` carries the description
to the panel and the values back.

`ctx.plugins.setEnabled(id, enabled)` is the switch behind the panel's plugin
manager page. It writes `enabled` into that plugin's `plugin.json` — the manifest
is the source of truth, because that is what the loader reads — and applies the
change to the running daemon: disabling disposes the plugin's scope, so its
protocol handlers, tasks, presets, schedules and timers go with it, and enabling
requires the entry module afresh so a plugin that keeps module-level state starts
from a clean one. `ctx.plugins.inventory()` lists every installed plugin, disabled
ones included, because a disabled plugin still has to be listed to be enabled
again. `plugins/config` exposes both over the protocol; the panel's own `config`
plugin is what drives them.

Note the router limitation above applies here too: a plugin enabled on a running
daemon registers its protocol handlers, but the panel's already-connected socket
took its handler list at connect time. Reconnecting the node — or restarting the
daemon — is what makes those events reachable.

## Naming inside a plugin

`ctx` is the plugin context. A protocol handler's own context is different, so
name its parameter `routerCtx`; the same applies to Koa handlers, which the panel
README covers.

## What a backend must not import

A plugin must not import daemon core modules at runtime: they are bundled into
`app.js`, so importing one would compile a second copy of that singleton. The same
goes for `cordis` — a second `Context` class is a second container. Only
`import type` from either.

This is why a class that has to extend something the core owns is built by a
factory that takes `ctx`: see `plugins/market/src/backend/quick_install.ts`, whose
task extends `ctx.tasks.AsyncTask` rather than an imported `AsyncTask`.

Entries are TypeScript at `src/backend/index.ts`.
`daemon/webpack.plugins.config.js` compiles every such entry to
`<plugin>/backend/index.cjs` during `npm run build` in `daemon/`, keeping the
daemon's runtime dependencies — including cordis — external so the plugin shares
its module instances. Compiled backends are gitignored build output, and
`scripts/package-daemon-plugins.mjs` copies only them plus a rewritten
`plugin.json` into `production-code/daemon/plugins/` — `src/` is not shipped.

The loader accepts `daemon`, `backend`, `main` or `entry` as the metadata field,
and any Node-loadable JavaScript, so a hand-written entry still works.

## Translations

A plugin owns the strings only it uses. They live in `<plugin>/src/i18n/`, one
JSON file per language, next to an `index.ts` that exports them as
`localeMessages` keyed by the daemon's locale codes (`en_us`, `zh_cn`, ...). Pass
that object to `ctx.i18n.define()` as the first thing `apply()` does, before any
code path that can log or throw translated text.

The root `languages/` catalogue keeps only what the daemon core uses, plus the
strings shared with it. When you add a string, add it to every language file in
the folder that owns it — see `plugins/backup`.

## Bundled plugins

`node` owns the `info/setting` protocol event, which is how the panel's node
plugin writes this daemon's configuration. See `panel/plugins/node`.

`backup` owns instance backup and restore protocol events, the `instance_backup`
asynchronous task, the scheduled `backup` action, and the `instanceBackup` feature
flag. It ships the console lines and errors it prints in `src/i18n/`. See
`panel/plugins/backup`.

`market` owns the `quick_install` asynchronous task and the `install` instance
preset — the two ways a market package reaches an instance. See
`panel/plugins/market`.

`monitor` samples this host's CPU and memory and contributes the history to
`info/overview` as `cpuMemChart`. See `panel/plugins/monitor`.
