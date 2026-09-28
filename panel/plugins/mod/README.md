# Mod Manager

`mod` owns the panel's Minecraft mod and server-plugin manager:

- `/api/mod/*`, including Modrinth, CurseForge and SpigotMC searches;
- the frontend `ctx.mod.api` service;
- the `/instances/terminal/mods` page;
- the `mod-manager` instance action in normal and Desktop modes;
- the feature's translations in all twelve panel locales.

The backend injects `koa`, `i18n`, `remote`, `middleware`, `roles` and `identity`.

The frontend injects the console registries, `instance` and `file`. It resolves
Desktop dialogs through `ctx.desktop.window`; it imports no Desktop implementation.
The action is available for Minecraft instances when file-management permission
allows it and the node reports `features.modManager`. An empty mods directory
does not prevent opening the manager to install the first mod.

The companion `daemon/plugins/mod` plugin owns `instance/mods/*`. Existing HTTP
and protocol paths are preserved. Previously saved `mod-manager` Desktop windows
are restored as `instance-action:mod-manager` and follow the normal action
unload behavior.

Each activation creates its own search service. Cordis cancels cache timers and
retry delays on unload; an effect aborts pending HTTP requests and clears caches.
Routes, actions, services and translations leave with the owning scope. The
instance and desktop plugins contain no mod API calls or mod UI.

Run the regression checks from the repository root after installing panel,
daemon and frontend dependencies (installation can use `--ignore-scripts`):

```sh
node --test scripts/tests/mod-plugin.test.cjs
```

These tests execute source in memory and do not build or start a server.
