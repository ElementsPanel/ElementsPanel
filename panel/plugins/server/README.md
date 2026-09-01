# server

The panel's web server.

Everything about serving HTTP lives in this plugin: the Koa application, the base
middleware stack, the static assets and the listener itself. It is the plugin
that provides `ctx.koa`, so every route in the panel — the core's API routers
included — is mounted on an application this plugin created.

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
| core routers | Mounted by `panel/src/app.ts` through `ctx.inject(["koa"], ...)`, so they stay last. |

The listener is bound on the container's `ready` hook rather than during
`apply()`, so it starts accepting requests only once the core has mounted its own
routers — and it is closed again on `dispose`, when the plugin unloads or the
panel shuts down.

## Disabling it

Turning this plugin off stops the panel from listening on any port — including
the one the request to turn it off arrived on. `plugins/config` refuses to
disable it for that reason.

## Settings

`GET`/`PUT /api/server/settings` read and write the nine fields this plugin owns
in the panel configuration: port, listening address, path prefix, SSL and its two
file paths, CORS and the two reverse-proxy fields. They stay in `SystemConfig`
rather than moving to a plugin store, because the panel has to know its port
before any plugin has loaded.

Nothing is rebound live — the listener, the proxy mode and the path prefix are
all fixed when the plugin starts, so a change takes effect on the next restart,
as it always has.
