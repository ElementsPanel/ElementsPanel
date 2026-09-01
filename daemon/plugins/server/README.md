# server

The daemon's network layer.

Everything the daemon is reachable over lives in this plugin: the Koa
application and its base middleware, the HTTP/HTTPS listener, and the Socket.io
server the panel actually talks to. It provides both `ctx.koa` and
`ctx.websocket`; the core keeps its own HTTP router and its own connection
handling and mounts them onto what this plugin hands over.

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
| core router | Mounted by `daemon/src/app.ts` through `daemon.inject(["koa"], ...)`, so it stays last. |

The two upload middlewares stay in the daemon core and arrive as
`ctx.middleware`: they consult the upload passports and the configured rate
limit, which are core subsystems. The server asks; it does not decide.

## The Socket.io server

`ctx.set("websocket", { io })` happens during `apply()`, before anything is
listening, so `daemon/src/app.ts` has its `connection` handler attached by the
time the first client can arrive. The core owns what a connection *means* —
`protocol.addGlobalSocket` and `router.navigation` — and this plugin owns only
the server it arrives on.

The listener itself binds on the container's `ready` hook rather than in
`apply()`, so it starts accepting traffic only once the core has mounted its
router and its connection handling. Both the Socket.io server and the HTTP
server are closed again on `dispose`.

## Disabling it

Turning this plugin off leaves the daemon running with nothing listening: no
HTTP, no Socket.io, and therefore no way for a panel to reach it. It is disabled
by setting `enabled` to `false` in this `plugin.json`, which is a deliberate
choice made on the host rather than something the panel can do remotely.
