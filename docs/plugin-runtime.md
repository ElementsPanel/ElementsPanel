# Plugin runtime and SDK 1

Panel, Daemon and browser still use Cordis 3.18.1. Deployment remains `node app.js`
with precompiled plugins; no runtime package manager, compiler or extra port is
required. Backend package upgrades continue to require a process restart.

## Defaults, overrides and configuration

Each backend reads its own `data/plugin-overrides.json`:

```json
{
  "version": 1,
  "plugins": {
    "example": { "enabled": true, "config": { "interval": 30 } }
  }
}
```

Package manifests supply defaults. An override replaces the complete `config`
object and overrides `enabled`; omitting a property inherits the package value.
Disabling or updating a plugin never modifies its package manifest. Existing
manifest switches remain defaults until a user changes them. Invalid override
files fail visibly and must be corrected, rather than silently enabling plugins.

The management API writes atomically through one per-process queue. Direct file
edits take effect on restart. It does not implement multiple writable profiles
or watch configuration files. Back up `data` as before. New market installations
live in `data/plugins`; the loaders still discover `plugins` and `market_plugins`.
A persistent package can supersede a legacy installation only with the same
market ownership marker; it cannot shadow a bundled plugin. Existing legacy
copies remain until uninstall and are not silently deleted or moved.

A plugin can export a Cordis `Config` schema, consume `apply(ctx, config)`, and
supply a generic form without writing its own storage service:

```json
{
  "id": "example",
  "backend": "backend/index.cjs",
  "config": { "interval": 30 },
  "configFields": [
    { "key": "interval", "type": "number", "title": "Interval", "min": 1, "required": true }
  ]
}
```

`ctx.plugins.configure(id, config)` validates the config and saves its override.
Ordinary plugins restart their scope after cleanup. Foundational/management
plugins report `restart-required`. The generic settings endpoints use this path
when no custom form was declared. Existing `settingsForm.declare()` forms retain
their `read`/`write` storage and semantic validation; the host first checks field
types, finite numbers, bounds and select values. Set `restartRequired: true` on
forms whose writes only take effect at startup. Backend config is never included
in the public browser manifest; `frontendConfig` is the explicit public input.

Browser entries can also declare their activation graph in `plugin.json`:

```json
{
  "frontendInject": ["runtime", "i18n", "console"],
  "frontendImmediate": false,
  "frontendRequired": false
}
```

`frontendInject` contains plugin ids, not Cordis service names. The browser
topologically orders the graph and reports missing dependencies and cycles.
`frontendRequired` turns a failed or pending entry into a startup failure;
optional entries remain visible in diagnostics while the rest of the UI starts.
`frontendImmediate` identifies foundation/prefetch entries for hosts that split
activation into tiers.

## Results and lifecycle

Enablement endpoints retain their inventory fields and add:

```json
{ "result": { "saved": true, "application": "pending" } }
```

`application` is `applied`, `pending`, `failed` or `restart-required`. Saving a
choice does not imply activation. Inventory reports `state` from Cordis scopes;
`running` is true only for an active scope. A failed plugin may be enabled again
to retry. A failed activation retains the user's desired config for repair.
Cleanup failures are reported separately from persistence failures. Cordis
registrations and explicit `ctx.effect()` disposers participate in cleanup;
untracked module/global side effects remain the plugin author's responsibility.

Daemon protocol handlers are bound at socket connection time. The panel's
management endpoint reconnects after toggling a daemon plugin. Package operations
continue to report failed nodes independently; a successful panel install does
not imply every node installed or activated the same version.

## Independent browser plugins

Import host services through `@elements-panel/sdk` (`ctx`, `usePluginService`,
`serviceRevision`, API/SDK constants and context types). Prefer the scoped `ctx`
passed to `apply` for registration. The compiler redirects legacy host-runtime
imports to this entry instead of bundling a second host context. The shared
module list is `frontend/plugin-sdk.config.mjs`: Vue, router, Pinia, vue-i18n,
Cordis, Cosmokit and VueUse. The host emits ESM bridges in its own Vite graph and
inserts an import map before its module entry, so plugins use the same instances.
The browser must support native import maps. Other dependencies are compiled into the plugin. SDK major 1 is the compatibility
boundary; a breaking public change needs a new major.

Production resources use `/plugins/<folder>@<revision>/frontend/...`. The revision
covers the complete frontend directory, so plugin-local chunks and styles share
a generation. Host builds put only plugin entry chunks in these directories;
shared JavaScript chunks live in the host's content-hashed `/assets/` directory.
Relative imports from every versioned entry resolve to the same host URL, so
router, user state and API clients are not instantiated separately through
versioned and unversioned plugin URLs. Independently compiled plugins may keep
their own nested chunks under their versioned directory and use the host import
map for shared SDK dependencies. Unknown/stale revisions return 404. The manifest
contains URLs and public metadata only, never local filesystem directories.
`/plugins/events` sends graph generation changes and heartbeat comments over SSE.
Reconnect receives the current generation. Browsers serialize notifications with
manual load/unload/reload operations and remove owned routes and styles on unload.
Foundational browser replacements require a page refresh; a backend with newer
code/config on disk first requires a service restart. Failed frontend activation
is visible in plugin settings and in `window.ElementsPanelPlugins.loaded()`;
`reload(id)` retries an ordinary plugin. This is not state-preserving code HMR.
`window.ElementsPanelPlugins.diagnostics()` exposes state, required services,
missing services and the loaded revision; `audit()` throws only for required
entries that are not active. Reload URLs use the server-provided revision rather
than timestamps, so one code generation has one browser cache identity.

The console exposes typed extension seats through `ctx.slots.register()`. For
example, a route-independent overlay is registered and disposed with its plugin:

```ts
ctx.slots.register("shell.overlay", ExampleDialog, {
  id: "example-dialog",
  order: 10
});
```

Current seats are `shell.overlay`, `shell.header.leading` and
`shell.header.actions`. `ctx.ui.globalComponent()` remains a compatibility
wrapper around `shell.overlay`; new plugins should use slots directly.

Panel API requests now send session tokens with `Authorization: Bearer ...`.
The backend temporarily accepts the legacy `?token=` form for older clients,
but new integrations should avoid putting credentials in URLs.

## Publication and compatibility

The compiler adds `elements: { "api": 1, "sdk": 1 }` to browser packages and
`elements: { "api": 1 }` to backend-only packages. Missing metadata identifies a
legacy package. Both runtime and installer reject unsupported declared versions
before executing code. Do not stamp metadata on an incompatible hand-built package.

The market reads compatibility from each side's artifact (no DB migration),
validates both halves and declared entries before publication, and returns it in
version summaries and `/files`. New clients send `pluginApi=1&pluginSdk=1` with
that request. Declared packages require matching client capabilities; old clients
can still fetch legacy packages. `/files` includes SHA-256 for each file; the
panel verifies checksummed bytes before writing or distributing them. Declared daemon packages
also require a matching `plugin/capabilities` response from each target node;
legacy nodes must be updated before installing those packages. Older market
servers without these fields remain readable. A digest detects mismatched bytes;
it does not authenticate a malicious market or make same-process plugins sandboxed.

## Feature ownership and optional dependencies

The runtime plugins own audit logging, base overview responses and daemon feature
registries. `monitor` contributes history and viewers, so it can be disabled
without suspending authentication or other plugins that report capabilities.
`user` assembles account profiles and optionally requests instance details;
instance availability is not an authentication dependency. Backup settings are
validated and written only by the daemon backup settings form.

The console-owned desktop registry accepts `view({ id, component, title, icon,
accepts?, ... })` and `open({ id, view, props?, title? })`. A desktop application
can reference a registered `view`. The desktop shell provides the opener and
window frame; feature plugins own their components and event handlers. Removing
a provider removes its views, applications and open windows. Saved windows use
the view id and props; unavailable or invalid views are skipped on restore.

Console compatibility hooks resolve the current instance service instead of
re-exporting implementation modules. Shared instance ids and quick-start enums
are available from `@elements-panel/sdk`. Optional integrations should use
`ctx.inject([...], scope => ...)` so only their dependent contributions disappear
when a provider unloads.
