# config

Remote plugin management for this daemon.

The daemon core owns the mechanism: `ctx.plugins.inventory()` lists every
installed plugin, disabled ones included, and `ctx.plugins.setEnabled(id, on)`
persists the switch in that plugin's `plugin.json` and applies it to the running
process. This plugin only exposes those two over the protocol, because the page
that drives them is the panel's plugin manager.

| Event | Data | Answers |
| --- | --- | --- |
| `plugin/list` | — | `DaemonPluginRecord[]` |
| `plugin/enabled` | `{ id, enabled }` | the updated record |

Both are reachable only over an authenticated top-level session: the daemon's
auth middleware (`src/routers/auth_router.ts`) rejects every event other than
`auth` and `stream` until the caller has presented the daemon key. The panel side
guards the matching routes with `ROLE.ADMIN` on top of that.

## What it refuses

Two plugins cannot be switched off from the panel, because doing so would remove
the very channel the request arrived on:

- `server` — the daemon would stop listening, and the panel would lose the node.
- `config` — this plugin; the events above would go with it.

Both remain disableable on the host by setting `enabled` to `false` in their
`plugin.json`, which is a decision made with a shell rather than remotely.

Disabling anything else is applied immediately: cordis disposes that plugin's
scope, so its protocol handlers, async tasks, presets, schedules, timers and
feature flags leave with it. Enabling re-requires the entry module, so a plugin
that keeps module-level state starts from a clean one. Adding, deleting or
changing plugin *code* still needs a daemon restart.

## Errors

The refusals are translated in `src/i18n/` and thrown as protocol errors, so the
panel shows this daemon's own wording — in whichever language the panel last
pushed to it through `info/setting`.
