# Panel plugins

Each child directory is one panel plugin. A plugin contains `plugin.json` and a
`src` directory. The backend entry is loaded by the panel process, while the
frontend entry is compiled into the web application by Vite.

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
`services`, `registerRoute`, `registerRouter`, `registerMiddleware`, `metadata`,
`directory`, and `logger`.
Backend entries must be Node-loadable JavaScript (`.js`, `.cjs`, or `.mjs`).

The frontend module exports `setup(context)` or a definition object. Its
`directory` context field is the logical plugin id (frontend code is bundled
into the web application):

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
    registerLocaleMessages
  }) {
    // register additional Vue behavior here
  }
};
```

Set `enabled` to `false` to skip a plugin. Plugins are loaded in ascending
`priority` order and a failed plugin is reported without stopping the
application. Frontend entries are compiled with the main web application, so
adding or changing frontend plugin source requires rebuilding the frontend.
