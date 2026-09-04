# server

The daemon's network layer.

Everything the daemon is reachable over lives in this plugin: the Koa
application and its base middleware, the HTTP/HTTPS listener, and the Socket.io
server the panel actually talks to. It provides both `ctx.koa` and
`ctx.websocket`; protocol and HTTP behavior are registered by the feature
plugins that consume those services.

That is why it loads first (`priority: 10`) and why neither `"koa"` nor
`"websocket"` may appear in its own `inject` list — a plugin cannot wait for a
service it is the one to provide.

## What it mounts, in order

| | |
| --- | --- |
| `ctx.middleware.uploadSpeedLimit` | Wraps the request stream with the configured rate limit — **before** anything reads it. |
| `ctx.middleware.uploadFileCheck` | Rejects an upload with no passport — **before** koa-body writes it to disk. |
| `koa-body` | Body and multipart parsing, 100 MB per file. |
| CORS + `X-Power-by` | Every HTTP request needs a panel-issued passport, so any origin is allowed. |
| prefix | Rewrites `config.prefix` off the URL, or redirects to it. Skipped when the prefix is empty. |
| `KoaService` | The two composed stacks a plugin's middleware and routers go into. |
| plugin routers | Mounted through `ctx.koa.router()` and removed with the owning plugin. |

The two upload middlewares arrive as `ctx.middleware` from the runtime
foundation: they consult the upload passports and configured rate limit. The
server mounts them; it does not own the transfer policy.

## The Socket.io server

`ctx.set("websocket", { io })` happens during `apply()`, before anything is
listening. This plugin also attaches the connection handler, global socket
registry and protocol navigation before the first client can arrive.

The listener itself binds on the container's `ready` hook rather than in
`apply()`, so it starts accepting traffic only once every plugin has registered
its routes and protocol handlers. Both the Socket.io server and the HTTP server
are closed again on `dispose`.

Protocol dispatch and connection navigation are also owned by this plugin. The
daemon executable only loads the plugin container, starts and stops it, and
provides process-level logging.

## Disabling it

Turning this plugin off leaves the daemon running with nothing listening: no
HTTP, no Socket.io, and therefore no way for a panel to reach it. It is disabled
by setting `enabled` to `false` in this `plugin.json`, which is a deliberate
choice made on the host rather than something the panel can do remotely.
