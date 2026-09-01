# Plugin configuration

This plugin registers the `/plugins/config` administration page and a matching
Desktop application. The page lists every installed plugin and renders the
settings form a plugin contributed with `ctx.settings.page()`.

Each plugin also gets an enable switch. It calls `PUT /api/plugins/enabled`,
which this plugin's backend forwards to `ctx.plugins.setEnabled()`: the panel
writes `enabled` into that plugin's `plugin.json` and applies it live, then the
page calls `ctx.plugins.refresh()` so the browser drops or picks up the frontend
half. `GET /api/plugins` lists every installed plugin, disabled ones included,
because a disabled plugin has to stay listed to be enabled again. This plugin
refuses to disable itself — that would remove the page the request came from; set
`enabled` to false in its own `plugin.json` if you really mean it.

Its own translations are bundled inside the plugin for all panel locales and are
removed with it. `src/backend/` registers the same catalogue on the panel's
i18next instance, so the message it throws when refusing to disable itself is
translated too.

## Node plugins

The page has a second scope: the plugins installed on each connected node. It is
a thin proxy onto the daemon-side `config` plugin, which exposes the daemon's own
`ctx.plugins` over the protocol.

| Method | Route | Goes to |
| --- | --- | --- |
| `GET` | `/api/plugins/node/list` | the panel's own node list |
| `GET` | `/api/plugins/node/plugins?daemonId=` | `plugin/list` |
| `PUT` | `/api/plugins/node/enabled?daemonId=` | `plugin/enabled` |

All three live inside `ctx.inject(["remote"], ...)`, so a panel without
`plugins/node` still manages its own plugins — the node scope simply reports that
it cannot list anything. Nothing here decides *which* daemon plugins may be
switched off: that is the daemon's call, and its refusal arrives as a protocol
error, translated by the node itself.

A daemon binds its protocol events onto each socket as that socket connects, so a
handler that has just appeared is invisible to the connection the panel is already
holding. The `PUT` therefore reconnects the node once the daemon has answered,
which is what makes the change reachable; the page re-reads the list with a few
retries, because the first attempt often lands while the socket is still coming
back up.

A daemon plugin has no browser half, so the node scope shows the switch and what
the daemon reports about the plugin, and no settings form.

Plugins add Desktop applications with `ctx.desktop.app()`. Those are removed when
the owning plugin is unloaded.
