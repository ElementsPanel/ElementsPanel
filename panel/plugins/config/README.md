# Plugin configuration

This frontend plugin registers the `/plugins/config` administration page and a
matching Desktop application. It lists the currently loaded frontend plugins
and renders the settings form a plugin contributed with `ctx.settings.page()`.
Its navigation and empty-state translations are bundled inside the plugin for
all panel locales and are removed with the plugin.

Plugins add Desktop applications with `ctx.desktop.app()`. Those are removed when
the owning plugin is unloaded.
