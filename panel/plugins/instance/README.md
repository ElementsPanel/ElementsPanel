# Instance

The panel-side application instance plugin owns the instance list, instance
creation and quick-start pages, the instance console route hierarchy, the base
instance cards and dialogs, and the HTTP API that forwards instance operations
to daemons.

Other instance features remain independently installable plugins. Terminal,
files, backups, Java management, mod management, monitoring and status integrations register
their cards or actions against the console supplied here.

The plugin provides the frontend `ctx.instance` service and the backend
`ctx.instances` service used by dependent plugins.

Instance owns the Desktop manager, My Apps, instance console, schedule, event
and server-configuration windows. It registers them through `ctx.desktop.view`
and optional dependency scopes; the shell does not import their implementations.
The server configuration catalogue and editor live here as well.

`ctx.instances.getDetails(references)` only returns instance data. Account
profiles are assembled by `user`; the legacy `getByUuid` method delegates to
that account service for compatibility.

The per-instance operation-log, crash and auto-restart endpoints retain their
`/api/overview/...` paths here and consume runtime audit storage. Removing the
monitoring viewer does not remove these instance APIs.
