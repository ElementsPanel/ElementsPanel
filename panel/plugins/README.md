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
  "backend": "src/index.js",
  "frontend": "src/frontend.ts"
}
```

Both entries are optional. A backend module exports `setup(context)` (or
`install(context)`) and may also export `ready(context)` and `dispose(context)`.
The panel backend context exposes the Koa `app`, `router`, panel `config`, core
`services`, the shared `middleware.permission` function and `roles`,
`registerRoute`, `registerRouter`, `registerMiddleware`, `metadata`, `directory`,
and `logger`.
Backend entries must be Node-loadable JavaScript (`.js`, `.cjs`, or `.mjs`).

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
    registerLocaleMessages,
    registerAppMenu,
    registerLoginAction
  }) {
    // register additional Vue behavior here
  }
};
```

Routes may set `meta.public` to bypass login checks and `meta.immersive` to hide
the normal panel shell. Definition objects may also provide `appMenus` and
`loginActions` arrays directly.

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
