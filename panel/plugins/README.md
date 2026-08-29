# Panel plugins

Each child directory is one panel plugin. A source plugin contains `plugin.json`
and a `src` directory. The backend entry is loaded by the panel process, while
the frontend entry is compiled by Vite as a separately loadable plugin entry.

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

Both entries are optional. A backend module exports `setup(context)` (or
`install(context)`) and may also export `ready(context)` and `dispose(context)`.
The panel backend context exposes the Koa `app`, `router`, panel `config`,
`storage`, core `services` (`remote` for the remote service subsystem,
`remoteRequest` for the daemon request helper, `users`, `operationLogger`,
`instances`, `sso`), the shared `middleware` (`instanceAccess`, `permission` and `validator`),
`common` (`GlobalVariable`), `i18n`, `roles`,
`registerRoute`, `registerRouter`, `registerMiddleware`, `registerRequestGuard`,
`registerInstallationState`, `registerLocaleMessages`, `saveConfig`,
`metadata`, `directory`, and `logger`. `services.identify(ctx)` reports who is
calling the current request, and `middleware.speedLimit(seconds)` applies the
core's per-caller rate limit.

`registerRequestGuard(guard)` hands the plugin request authorization for the
whole panel: route guarding, caller identity, instance ownership, upload
permission and the auth counters the overview reports. The core implements none
of that itself and has no "is auth enabled" branch anywhere — it just asks the
installed guard, and serves every request while none is installed. The guard is
cleared automatically when the owning plugin is disposed. See `plugins/user`.

`registerInstallationState(state)` lets a first-run plugin supply the value
reported as `isInstall` by `/api/auth/status`. The core defaults to installed,
so removing the owning plugin cannot redirect the frontend to a route that no
longer exists. See `plugins/oobe`.

Backend entries are written in TypeScript at `src/backend/index.ts`.
`panel/webpack.plugins.config.js` compiles every such entry to
`<plugin>/backend/index.cjs` during `npm run build` in `panel/`, externalizing
the panel's runtime dependencies so the plugin shares its module instances.
Compiled backends are gitignored build output — point `plugin.json` at
`backend/index.cjs`.

A backend must not import panel core modules: they are bundled into `app.js`, so
importing them would compile a second copy of each singleton (storage, system
config, i18n). Take what you need from the context instead; only `import type`
from the core is safe, because types are erased.

The loader itself accepts any Node-loadable JavaScript (`.js`, `.cjs`, `.mjs`),
so a hand-written entry still works if you have a reason to skip the compile
step.

## Translations

A plugin owns the strings only it uses. They live in `<plugin>/src/i18n/`, one
JSON file per language, next to an `index.ts` that exports them as
`localeMessages` keyed by the panel's locale codes (`en_us`, `zh_cn`, ...):

```ts
import enUS from "./en_US.json";
import zhCN from "./zh_CN.json";

export const localeMessages = { en_us: enUS, zh_cn: zhCN };
```

The frontend definition passes that object as `localeMessages` (or calls
`context.registerLocaleMessages(locale, messages)`), and a backend that logs or
throws translated text calls `context.registerLocaleMessages(localeMessages)`
before anything else in `setup()`. Both merge on top of the shared catalogue, so
a plugin's strings arrive and leave with the plugin. Frontend registrations are
undone when the plugin unloads; backend code only reloads with the panel
process, so its messages stay registered for the process lifetime.

The root `languages/` catalogue keeps only what the panel core uses, plus the
strings shared by more than one plugin. When you add a string, add it to every
language file in the folder that owns it — see `plugins/user`, `plugins/oobe`,
`plugins/backup`, `plugins/node` and `plugins/desktop`.

The frontend module exports `setup(context)` or a definition object. Its
`directory` context field is the logical plugin id. During a production build,
each frontend entry is emitted below `dist/plugins/<plugin-folder>/`. The
collection scripts turn every source plugin into a distributable directory at
`production-code/web/plugins/<plugin-folder>/`. A production plugin contains
only its rewritten `plugin.json`, executable `backend/` files and compiled
`frontend/` files; `src/` is not copied. The panel generates
`/plugins/manifest.json` directly from installed plugin metadata and serves
each frontend directory at `/plugins/<plugin-folder>/frontend/`. The main
bundle does not contain the plugin implementation.

```ts
export default {
  routes: [{ path: "/example", component: ExamplePage }],
  components: { ExamplePage },
  setup({
    app,
    router,
    registerRoute,
    registerComponent,
    registerLayoutCard,
    registerLayoutCardPoolItem,
    registerLocaleMessages,
    registerAppMenu,
    registerLoginAction,
    registerDesktopApp,
    registerInstanceAction,
    registerScheduleAction,
    registerTerminalAction,
    registerGlobalComponent,
    registerService,
    getService
  }) {
    // register additional Vue behavior here
  }
};
```

`registerGlobalComponent(component)` (or a `globalComponents` array on the
definition) mounts a component for the lifetime of the app, alongside the
panel's own dialog providers. Use it for global overlays that belong to no
route or card — `plugins/user` registers its account dialog this way.

Plugins can expose runtime services for other plugins and panel compatibility
facades with `registerService(name, value)`. Services are scoped to the owning
plugin and are removed automatically when that plugin is unloaded. Other
plugins can resolve them through `context.getService(name)` (or the exported
`getPanelFrontendService(name)`) at call time so dynamic plugin unload/reload
remains safe.

Routes may set `meta.public` to bypass login checks and `meta.immersive` to hide
the normal panel shell. Definition objects may also provide `appMenus` and
`loginActions` arrays directly. Layout-card plugins may expose components with
`layoutCards` and add removable entries to the design-mode card picker with
`layoutCardPoolItems` or `context.registerLayoutCardPoolItem()`.

A plugin can expose its configuration UI to the `config` plugin by exporting a
Vue component. The component owns its form state, validation, API calls and
persistence, so plugin-specific settings do not need to be coupled to the panel
core.

```ts
import PluginConfig from "./PluginConfig.vue";

export default {
  configuration: {
    component: PluginConfig
  }
};
```

Desktop applications can be declared statically through `desktopApps` or at
runtime through `context.registerDesktopApp()`. Each application must provide a
globally unique `id` and either a `component` to render inside a Desktop window,
or a `route` to open directly. A component may also provide a route so the same
page is available in both the normal panel and Desktop modes.

```ts
import ExamplePage from "./ExamplePage.vue";
import { AppstoreOutlined } from "@ant-design/icons-vue";

export default {
  desktopApps: [
    {
      id: "example",
      label: "Example",
      icon: AppstoreOutlined,
      route: "/example",
      component: ExamplePage,
      initialWidth: 960,
      initialHeight: 600
    }
  ]
};
```

Instance tools that are specific to a plugin can be exposed in both panel modes
through `instanceActions` or `context.registerInstanceAction()`. The action's
`normalComponent` and `desktopComponent` receive `instanceUuid` and `daemonId`
props. Normal components should expose an `open()` method; Desktop components
are mounted inside a Desktop window and may emit `close` and
`open-file-editor(filePath, fileName)` when those integrations are needed. An
optional `condition(context)` controls whether the tool is shown for the
current instance. Unloading the owning plugin removes its action and closes
open Desktop windows for it.

```ts
context.registerInstanceAction({
  id: "example-tool",
  title: () => "Example tool",
  icon: ExampleIcon,
  normalComponent: NormalTool,
  desktopComponent: DesktopTool,
  condition: ({ isGlobalTerminal }) => !isGlobalTerminal
});
```

Plugins can add schedule action types with `scheduleActions` or
`context.registerScheduleAction()`. Each action supplies a wire `type`, a
translated `title`, and optionally an input placeholder or visibility
condition. The normal and Desktop schedule editors consume these registrations,
so disabling the owning plugin removes its action from both editors.

Buttons in the terminal's instance-operations row come from `terminalActions` or
`context.registerTerminalAction()`. Each action gets the state the terminal
itself has — `instanceId`, `daemonId`, `instanceInfo`, `isStopped`, `isRunning`,
`isDockerMode`, `isGlobalTerminal` and `clearTerminal()` — in both `click` and
`condition`, so one registration serves the normal terminal and a Desktop
console window. `plugins/market` registers its reinstall-from-a-package button
this way.

```ts
context.registerTerminalAction({
  id: "example-reinstall",
  title: () => "Reinstall",
  icon: InteractionOutlined,
  click: ({ daemonId, instanceId, clearTerminal }) => { /* ... */ },
  condition: ({ isStopped, isGlobalTerminal }) => isStopped && !isGlobalTerminal
});
```

Configuration components, routes, menus and Desktop applications disappear
with their owning frontend plugin. The Desktop plugin also closes open windows
whose application registration has been removed.

Set `enabled` to `false` to skip a plugin. Plugins are loaded in ascending
`priority` order and a failed plugin is reported without stopping the
application. The browser runtime exposes `window.ElementsPanelPlugins` with
`load(id)`, `unload(id)`, `reload(id)`, `refresh()` and `loaded()` methods, so a
production plugin can be enabled, disabled or replaced without rebuilding the
main application. Call `refresh()` after copying or deleting a plugin directory
to reconcile the running frontend. Backend entries still load when the panel
process starts; adding, deleting or changing backend code requires restarting
the panel process.

A packaged plugin can be installed or removed by copying or deleting its whole
directory under `production-code/web/plugins/`. Its `plugin.json` uses runtime
entries such as `backend/index.cjs` and `frontend/frontend-<hash>.js`, rather
than source paths.
