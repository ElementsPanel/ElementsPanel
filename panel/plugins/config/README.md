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

Plugins add Desktop applications with `ctx.desktop.app()`. Those are removed when
the owning plugin is unloaded.
