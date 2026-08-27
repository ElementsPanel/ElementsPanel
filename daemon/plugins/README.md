# Daemon plugins

Each child directory is one daemon plugin. A plugin contains `plugin.json` and
a `src` directory. The daemon entry must be a Node-loadable JavaScript module
(`.js`, `.cjs`, or `.mjs`) and defaults to `src/index.js`.

```json
{
  "id": "example-daemon",
  "name": "Example daemon plugin",
  "version": "1.0.0",
  "priority": 100,
  "daemon": "src/index.js"
}
```

The module exports `setup(context)` (or `install(context)`) and may also export
`ready(context)` and `dispose(context)`. The setup context contains the Koa `app`, a plugin `router`,
`registerRoute`, `registerRouter`, `registerMiddleware`, `registerProtocolHandler`,
`registerProtocolMiddleware`, `routerApp` for Socket.io protocol events,
`protocol`, the daemon `config`, the instance subsystem, and `logger`.

Set `enabled` to `false` to skip a plugin. Plugins are loaded in ascending
`priority` order and a failed plugin is reported without stopping the daemon.
