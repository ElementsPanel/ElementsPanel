# Plugin configuration

This frontend plugin registers the `/plugins/config` administration page and a
matching Desktop application. It lists the currently loaded frontend plugins
and renders the `configuration.component` exported by a plugin when available.
Its navigation and empty-state translations are bundled inside the plugin for
all panel locales and are removed with the plugin.

Plugins can also add Desktop applications through the `desktopApps` definition
array or `context.registerDesktopApp()`. These registrations are removed when
the owning plugin is unloaded.
