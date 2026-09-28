# Mod Manager

`mod` owns the daemon's seven `instance/mods/*` events: `list`, `toggle`, `delete`,
`install`, `install_task`, `install_status` and `config_files`. It parses JAR metadata, locates mod configuration
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

## Tracked downloads

`instance/mods/install_task` accepts an instance ID, catalog download URL, JAR filename,
project type (`mod`/`plugin`), optional fallback URL and explicit `overwrite` flag.
It returns an accepted receipt and task ID; query `instance/mods/install_status` with
the same instance and task IDs for progress and completion. The `modInstallTasks`
feature advertises this capability. Update the runtime plugin together with mod.
Tracked downloads require an idle shared downloader and default to refusing existing
files. Status records stay in memory for up to 30 minutes, with a maximum of 256
records, and never expose other instances' transfers or raw download errors.
