# Panel plugins

Each child directory is one panel plugin. A source plugin contains `plugin.json`
and a `src` directory. The backend entry is loaded by the panel process; the
frontend entry is compiled by Vite as a separately loadable chunk.

```json
{
  "id": "example",
  "name": "Example plugin",
  "version": "1.0.0",
  "priority": 100,
  "backend": "backend/index.cjs",
  "frontend": "src/frontend.ts"
}
```

Both entries are optional. Set `enabled` to `false` to skip a plugin.

## The plugin shape

The panel's plugin system is [cordis](https://github.com/cordiverse/cordis). A
plugin is a module that exports `apply`, and optionally `inject`:

```ts
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";

export const inject = ["koa", "i18n", "middleware", "roles"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);

  const router = ctx.koa.router("/api/example");
  router.get("/", ctx.middleware.permission({ level: ctx.roles.ADMIN }), async (requestCtx) => {
    requestCtx.body = "hello";
  });
}
```

There is no `setup`, no `dispose` and no lifecycle to implement. `apply` may be
`async`. Three rules follow from cordis and are worth internalising:

- **Everything you register is an effect of your own scope.** Routes, middleware,
  timers, overview providers, translations and services are all undone when the
  plugin is unloaded. Do not write cleanup code, and do not return a disposer
  from `apply` — cordis v3 ignores it. If you need to undo something cordis does
  not know about, wrap it yourself:

  ```ts
  ctx.effect(() => {
    const handle = openSomething();
    return () => handle.close();
  });
  ```

- **`inject` lists what you cannot work without.** cordis keeps the plugin
  inactive until every injected service exists, and disposes it again if one goes
  away. For something optional, use `ctx.inject(["thing"], (scoped) => { ... })`
  around just the part that needs it, or read `ctx.get("thing")` and degrade.

- **`ctx.logger` and the timers are cordis's.** `ctx.logger.info(...)` logs under
  your plugin's id; `ctx.setTimeout`, `ctx.setInterval`, `ctx.sleep`,
  `ctx.throttle` and `ctx.debounce` are cancelled when the plugin unloads, so a
  sampler needs no `stop()`.

Plugins are loaded in ascending `priority` order. Use `inject` to express real
dependencies; `priority` only fixes a deterministic order among plugins that do
not depend on each other — Koa middleware order, route match order, i18n merge
precedence and layout-card override precedence. A plugin that fails is reported
and skipped; the panel keeps running.

## The backend context

| Service | What it gives you |
| --- | --- |
| `ctx.logger` | Named logger. `ctx.logger("sub")` for a sub-logger. |
| `ctx.timer` | `setTimeout` / `setInterval` / `sleep` / `throttle` / `debounce`, mixed onto `ctx`. |
| `ctx.settings` | `config` (the panel configuration) and `save()`. |
| `ctx.settingsForm` | `declare({ fields, read, write })` — the plugin's own configuration form, described rather than drawn. |
| `ctx.storage` | The panel's entity storage, file- or Redis-backed. |
| `ctx.i18n` | `$t`, `i18next`, and `define(messages)` for the plugin's own strings. |
| `ctx.middleware` | `permission`, `validator`, `instanceAccess`, `speedLimit`. |
| `ctx.roles` | The role constants (`ADMIN`, `USER`, ...). |
| `ctx.identity` | `of(requestCtx)`, `canAccessInstance(...)`, `accessPolicy`, `users`, `stats` — identity, instance ownership and capabilities reported by the installed guard. |
| `ctx.operations` | The operation logger. |
| `ctx.instances` | `getByUuid`. |
| `ctx.globals` | Process-wide counters shared with the core. |
| `ctx.overview` | `provide(fn)` to add fields to `GET /api/overview`. |
| `ctx.plugins` | `loaded`, `inventory()`, `setEnabled()`, and the frontend manifest the browser fetches. |
| `ctx.koa` | `app`, `use(middleware)`, `router(prefix?)`. Both are removed on unload. **Provided by `plugins/server`.** |
| `ctx.remote` | `services` (the node subsystem), `Request` (the daemon request helper) and `RequestTimeoutError`. **Provided by `plugins/node`.** |
| `ctx.guard` | Request authorization. **Provided by `plugins/user`.** |
| `ctx.installation` | First-run state. **Provided by `plugins/oobe`.** |

`src/app/plugin/context.ts` is the authoritative declaration of all of this.

Four of these are provided by plugins rather than by the core, with `ctx.set()`:

`ctx.set("koa", ...)` is the web server itself. `plugins/server` creates the Koa
application, mounts the base middleware, serves the static assets and binds the
listener; the core keeps only its own API routers and mounts them onto
`ctx.koa.app` through `ctx.inject(["koa"], ...)` once the plugin has provided it.
The panel therefore listens on nothing without it, which is why `plugins/config`
refuses to disable it and why almost every plugin injects it. A plugin that
provides a service cannot inject it — see `plugins/server`, which reaches its own
`koa` with `ctx.inject()` instead.

`ctx.set("remote", ...)` is the panel's connection to its daemons. `plugins/node`
owns the whole subsystem — the sockets, the stored node configuration, the
authentication and the reconnect timer — so every node log line is written by
that plugin's `ctx.logger` and prefixed `node`. The core declares only the shape
it needs and resolves it at use time through `service/remote_access.ts`
(`remoteSubsystem()`, `remoteRequest(node)`, `isRemoteRequestTimeout(error)`),
which throws a clear error while no plugin provides one: unlike an unguarded
panel, "no daemons" is not a state a route can answer in. It loads at
`priority: 20` because `oobe`, `monitor`, `backup` and `market` all inject it.

`ctx.set("guard", guard)` hands the plugin request authorization for the whole
panel — route guarding, caller identity, instance ownership, upload permission
and the auth counters the overview reports. The core implements none of that and
has no "is auth enabled" branch anywhere: it asks the installed guard, and serves
every request while none is installed. See `plugins/user`.

`ctx.set("installation", state)` supplies the value reported as `isInstall` by
`/api/auth/status`. The core defaults to installed, so removing the owning plugin
cannot redirect the frontend to a route that no longer exists. See `plugins/oobe`.

All four leave with their plugin, because a service registered inside `apply`
belongs to that plugin's scope.

`ctx.overview.provide(fn)` merges extra fields into `GET /api/overview`. The core
reports only what the whole panel reads that route for — the nodes, the panel
process and the host it runs on. Anything collected purely to be displayed goes
in a plugin: `plugins/monitor` contributes the `chart` field this way, and it
disappears with the plugin.

`ctx.plugins.setEnabled(id, enabled)` is the switch behind the plugin manager
page. It writes `enabled` into the plugin's `plugin.json` — the manifest is the
source of truth, because that is what the loaders and the frontend manifest
endpoint read — and applies the change to the running panel: disabling disposes
the backend scope, enabling requires the entry module afresh so a plugin that
keeps module-level state starts from a clean one. `ctx.plugins.inventory()` lists
every installed plugin, disabled ones included, because a disabled plugin still
has to be listed to be enabled again. `plugins/config` exposes both over HTTP and
drives them from its page.

## Naming inside a plugin

`ctx` is the plugin context. Koa's own context is different, so hoist what a
route handler needs before declaring routes:

```ts
const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });
router.get("/x", requireAdmin, async (requestCtx) => { ... });
```

Name a Koa handler's parameter `requestCtx` when the handler also needs the
plugin context. Where it does not, `ctx` is fine — TypeScript will reject
`ctx.roles` on a Koa context, so the two cannot be confused silently.

## Reaching `ctx` from deep inside a plugin

A plugin's own modules take `ctx` as an argument — see
`plugins/market/src/backend/service/market_settings.ts`. A plugin with many such
modules may instead keep one private context holder; `plugins/user` does, in
`src/backend/runtime.ts`, because fourteen modules there need something from the
context and a parameter through all of them would say nothing the holder does
not.

## What a backend must not import

A backend must not import panel core modules at runtime: they are bundled into
`app.js`, so importing one would compile a second copy of that singleton — the
storage subsystem, the system config, the i18n instance. The same goes for
`cordis` itself: a second `Context` class is a second container, and the plugin's
services would be invisible to the panel. Only `import type` from either, because
types are erased.

Backend entries are TypeScript at `src/backend/index.ts`.
`panel/webpack.plugins.config.js` compiles each one to `<plugin>/backend/index.cjs`
during `npm run build` in `panel/`, keeping the panel's runtime dependencies —
including cordis — external so the plugin shares its module instances. Compiled
backends are gitignored build output; point `plugin.json` at `backend/index.cjs`.

The loader accepts `panel`, `backend`, `main` or `entry` as the metadata field,
and any Node-loadable JavaScript, so a hand-written entry works if you have a
reason to skip the compile step.

## Translations

A plugin owns the strings only it uses. They live in `<plugin>/src/i18n/`, one
JSON file per language, next to an `index.ts` that exports them as
`localeMessages` keyed by the panel's locale codes:

```ts
import enUS from "./en_US.json";
import zhCN from "./zh_CN.json";

export const localeMessages = { en_us: enUS, zh_cn: zhCN };
```

Pass that to `ctx.i18n.define(localeMessages)` as the first thing `apply()` does,
before any code path that can log or throw translated text. Registration is an
effect: the panel snapshots the base catalogue and re-applies base plus every
live registration on each change, so a plugin's strings — including any that
override a core string — arrive and leave with the plugin.

The root `languages/` catalogue keeps only what the panel core uses, plus strings
shared by more than one plugin. When you add a string, add it to every language
file in the folder that owns it.

## The frontend

The frontend entry has the same shape — `apply(ctx)` plus optional `inject` —
against a different set of services:

```ts
import type { PanelFrontendPluginContext } from "@/plugin";
import { localeMessages } from "./i18n";
import ExamplePage from "./ExamplePage.vue";

export const inject = ["i18n", "routes", "ui"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.ui.layoutCard("ExampleCard", ExampleCard);
  ctx.routes.add({ path: "/example", component: ExamplePage });
}
```

| Service | What it gives you |
| --- | --- |
| `ctx.logger`, `ctx.timer` | As on the backend. |
| `ctx.vue` | `app`, `pinia`, `router`. Stored raw; never make a context reactive. |
| `ctx.i18n` | `instance`, `define(messages)`. |
| `ctx.routes` | `add(route)`, `revision`, `isPluginRoute(path)`, `ownerOf(path)`. |
| `ctx.ui` | `component`, `layoutCard`, `layoutCardPoolItem`, `globalComponent`. |
| `ctx.menus` | `app(menu)`, `login(action)`, and the arrays the shell renders. |
| `ctx.actions` | `instance`, `schedule`, `terminal`, and `terminalButtons(state)`. |
| `ctx.desktop` | `app(desktopApp)`, `apps`, `window`, `provideWindow(component)`. |
| `ctx.plugins` | `loaded`, `load`, `unload`, `reload`, `refresh`. |
| `ctx.user` | Account API and windows. **Provided by `plugins/user`.** |
| `ctx.market` | Package picker and API. **Provided by `plugins/market`.** |
| `ctx.node` | Node API and hook. **Provided by `plugins/node`.** |
| `ctx.file` | File API, hook, upload queue, filename helpers, editor/viewer components and the file dialogs. **Provided by `plugins/file`.** |

`frontend/src/plugin/context.ts` is the authoritative declaration of all of this.

Routes may set `meta.public` to bypass login checks, `meta.immersive` to hide the
panel shell, `meta.mainMenu` to appear in navigation and `meta.icon` for its
icon. Menu entries are derived from routes, so there is nothing else to register.

`ctx.ui.layoutCard(name, component)` registers a card the layout engine renders
by name, and stacks over a core card of the same name so the original is restored
on unload. `ctx.ui.layoutCardPoolItem(factory)` adds an entry to the design-mode
card picker. `ctx.ui.globalComponent(component)` mounts a component for the
lifetime of the plugin, alongside the panel's own dialog providers — for global
overlays that belong to no route or card.

`ctx.desktop.app({...})` adds an application to Desktop mode. The registry is
core-owned even though Desktop mode is itself a plugin, because an application
belongs to whichever plugin owns the page: registering unconditionally is correct,
and the entry is simply inert while `plugins/desktop` is not installed. An
application needs a globally unique `id` and either a `component` to render
inside a Desktop window or a `route` to open directly.

A plugin's own settings are **declared on its backend**, not drawn in the browser:

```ts
ctx.settingsForm.declare({
  fields: () => [
    { key: "httpPort", type: "number", title: $t("..."), min: 1, max: 65535 },
    { key: "ssl", type: "boolean", title: $t("...") },
    { key: "sslPemPath", type: "string", title: $t("..."), visibleWhen: "ssl" },
    { type: "link", title: $t("Edit template"), route: "/market/editor" }
  ],
  read: () => ({ ...currentValues }),
  write: (values) => { /* validate and persist */ }
});
```

`plugins/config` renders that description with one generic form. Labels are plain
strings the declaring side has already translated, and `fields` is a function so
it is resolved per request — which is what makes the panel's language switch
apply, and what lets the *daemon* declare its plugins' settings the same way: the
browser holds no copy of a daemon plugin's catalogue, or of a daemon plugin at
all. Field types are `string` (with `secret` for a password input), `text`,
`number` (`min`/`max`), `boolean`, `select` (`options`) and `link` (a route the
form offers as a button). `visibleWhen` takes a field name, or `"name=value"`, or
an array of either that must all hold.

Validation belongs in `write()`, on the backend, so there is one copy of it.

`ctx.actions.instance({...})` adds an instance tool to both panel modes. Its
`normalComponent` and `desktopComponent` receive `instanceUuid` and `daemonId`
props; normal components should expose an `open()` method, Desktop components are
mounted inside a Desktop window and may emit `close` and
`open-file-editor(filePath, fileName)`. `ctx.actions.schedule({...})` adds a
scheduled-task type, and `ctx.actions.terminal({...})` a button in the terminal's
instance-operations row — the latter gets the state the terminal itself has
(`instanceId`, `daemonId`, `instanceInfo`, `isStopped`, `isRunning`,
`isDockerMode`, `isGlobalTerminal`, `clearTerminal()`) in both `click` and
`condition`, so one registration serves the normal terminal and a Desktop console.

A frontend plugin *may* import `cordis` and panel core modules at runtime: it is
compiled into the same Vite module graph, and `cordis` is deduplicated, so there
is only ever one container. Importing `@/...` core code is the normal way to
build a page.

## Cross-plugin services

A plugin exposes an API to other plugins and to the panel core with
`ctx.set(name, value)`. The service belongs to the plugin's scope, so it is
removed when the plugin unloads. Consumers resolve it at use time and degrade
when it is absent:

```ts
import { usePluginService } from "@/plugin/context";
import type { FrontendUserService } from "@/plugin";

const user = computed(() => usePluginService<FrontendUserService>("user"));
```

`usePluginService` is reactive — a `computed()` over it re-evaluates when the
owning plugin is loaded or unloaded. A plugin that cannot work at all without
another's service should `inject` it instead and let cordis handle the ordering.

`ctx.set()` hands the value over as it is, so a service may be any object,
including a class instance with `#private` fields. (The core's own `provide`
helper is careful about this for the opposite reason: `ctx.provide(name, value)`
would make every read of the value return a proxy, and a method that uses a
`#private` field or a `WeakMap` keyed by `this` would then fail.)

## Production and hot plug

During a production build each frontend entry is emitted below
`dist/plugins/<plugin-folder>/`. The collection scripts turn every source plugin
into a distributable directory at `production-code/web/plugins/<plugin-folder>/`
containing only its rewritten `plugin.json`, executable `backend/` files and
compiled `frontend/` files; `src/` is not copied. The panel generates
`/plugins/manifest.json` from installed plugin metadata and serves each frontend
directory at `/plugins/<plugin-folder>/frontend/`. The main bundle does not
contain any plugin implementation.

A packaged plugin is installed or removed by copying or deleting its directory.
The browser runtime exposes `window.ElementsPanelPlugins` with `load(id)`,
`unload(id)`, `reload(id)`, `refresh()` and `loaded()`, so a production plugin can
be replaced without rebuilding the panel. Call `refresh()` after copying or
deleting a directory to reconcile the running frontend.

Turning a plugin off does not need any of that: the plugin manager page has a
switch per plugin, and it applies to both halves at once — the panel disposes the
backend scope, and the page calls `refresh()` so the browser reconciles against
the manifest. Adding, deleting or changing plugin *code* still requires
restarting the panel process.
