# Mod Manager

`mod` owns the daemon's five `instance/mods/*` events: `list`, `toggle`, `delete`,
`install` and `config_files`. It parses JAR metadata, locates mod configuration
files and delegates file access and downloads to the existing services.

It injects `instances`, `protocol`, `files`, `transfer` and `features`. All
cross-plugin access goes through the injected context; importing this module
creates no instance subsystem, download manager or global cache.

The `features.modManager` flag exists only while the plugin is active. Removing
this plugin or one of its required services removes its protocol handlers and
flag without disabling general instance management. Each activation has a fresh
metadata cache. Unload stops an active mod download only while that download is
still the task reported by the shared transfer service.

Installation remains asynchronous, with progress exposed through the existing
list response. Rejections are handled by the plugin logger. Every handler also
validates the instance independently of the instance plugin's middleware order.

Use this with `panel/plugins/mod`. As described in the daemon plugin guide,
enabling previously absent protocol events on an already connected node requires
reconnecting that node, because the transport snapshots event names on connection.
