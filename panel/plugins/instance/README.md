# Instance

The panel-side application instance plugin owns the instance list, instance
creation and quick-start pages, the instance console route hierarchy, the base
instance cards and dialogs, and the HTTP API that forwards instance operations
to daemons.

Other instance features remain independently installable plugins. Terminal,
files, backups, Java management, monitoring and status integrations register
their cards or actions against the console supplied here.

The plugin provides the frontend `ctx.instance` service and the backend
`ctx.instances` service used by dependent plugins.
