# server

The panel's web server.

Everything about serving HTTP lives in this plugin: the Koa application, the base
middleware stack, the static assets and the listener itself. It is the plugin
that provides `ctx.koa`, so every route in the panel is mounted on an
application this plugin created.

That is why it loads first (`priority: 10`) and why `"koa"` must never appear in
its own `inject` list: a plugin cannot wait for a service it is the one to
provide. Where it needs `koa`, `middleware` or `roles` itself — the settings
routes — it resolves them with `ctx.inject([...], scoped => ...)` instead.

## What it mounts, in order

| | |
| --- | --- |
| `preCheck` | Rejects an upload the guard disallows — **before** koa-body writes it to disk, which is the only reason it exists. |
| `koa-body` | Body and multipart parsing. |
| `koa-session` | Signed session cookie. |
| prefix | Rewrites `config.prefix` off the URL, or redirects to it. Skipped when the prefix is empty. |
| `protocol` | The `{ status, data, time }` response envelope, the CORS headers and `X-Version`. It wraps everything downstream, which is why it is here and not a `ctx.koa.use()` registration. |
| `KoaService` | The two composed stacks every other plugin's middleware and routers go into. |
| plugin frontends | `/plugins/manifest.json` and `/plugins/<folder>/frontend/`. |
| `public/` | The compiled panel. |
| plugin routers | Mounted through `ctx.koa.router()` and removed with the owning plugin. |

The listener is bound on the container's `ready` hook rather than during
`apply()`, so it starts accepting requests only once every plugin has registered
its routes. It is closed again on `dispose`, when the plugin unloads or the panel
shuts down.

The panel executable no longer mounts a separate core router after this plugin
loads. All HTTP routes are registered by plugins through `ctx.koa.router()` and
are removed with their owning scope; this plugin only owns the transport and
the shared response middleware.

## Disabling it

Turning this plugin off stops the panel from listening on any port — including
the one the request to turn it off arrived on. `plugins/config` refuses to
disable it for that reason.

## Settings

The nine fields this plugin owns in the panel configuration — port, listening
address, path prefix, SSL and its two file paths, CORS and the two reverse-proxy
fields — are **declared**, not drawn: `ctx.settingsForm.declare(...)` describes
them and the plugin manager renders that description. This plugin therefore ships
no browser half at all, which is the same position a daemon plugin is in.

The values stay in `SystemConfig` rather than moving to a plugin store, because
the panel has to know its port before any plugin has loaded.

Nothing is rebound live — the listener, the proxy mode and the path prefix are
all fixed when the plugin starts, so a change takes effect on the next restart,
as it always has.
