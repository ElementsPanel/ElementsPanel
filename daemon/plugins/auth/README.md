# auth

The daemon's identity check.

Everything about deciding *who* may talk to this daemon lives here: the top-level
protocol middleware that gates every event, the key comparison the panel
authenticates with, the optional panel IP whitelist, and the timeout that hangs up
on a connection that never authenticates.

| What | Where |
| --- | --- |
| `ctx.protocol.use(...)` | Rejects every event other than `auth` and `stream*` until the session is authenticated. |
| `ctx.protocol.on("auth")` | Compares the presented key with `config.key` using `timingSafeEqual`, checks the IP whitelist, and marks the session. |
| `ctx.protocol.on("connection")` | Disconnects after 6 s if nothing authenticated. |

It loads at `priority: 20`, before every plugin that registers protocol
handlers, and the daemon does not listen until `plugins/server` binds on the
container's `ready` hook — so no socket is ever routed without this middleware in
place.

## The session type

`TOP_LEVEL` is this plugin's own, and so is the code that stamps it onto a
session. `src/service/mission_passport.ts` keeps `LOGIN_FROM_STREAM`,
`streamLoginSuccessful` and the upload passports, because a stream login and an
upload passport are the core's business — the file router issues them, and the
upload middleware checks them.

## Removing it

The daemon core holds no "is authentication enabled" branch anywhere; it simply
has no opinion on who is calling. Without this plugin:

- there is no `auth` event, so the panel's authentication times out and the node
  never becomes available — the panel cannot use the daemon at all;
- and there is no middleware, so anything else that speaks the protocol can call
  every event.

That is the same trade the panel makes with `plugins/user`, with one difference
worth keeping in mind: the panel still has a login page in front of it, while a
daemon is a bare API surface.

The shared transfer passport store belongs to the runtime foundation. This
plugin issues upload passports, while `plugins/terminal` consumes stream
passports; the server plugin only transports those protocol events.

## Errors

The four `TXT_CODE_auth_router.*` strings are bundled in `src/i18n/` for all
locales and leave with the plugin. A rejected event answers with the protocol's
`IGNORE` marker so `error()` does not print it a second time — this plugin has
already logged the refusal itself, with the caller's id, address and the event
they tried.
