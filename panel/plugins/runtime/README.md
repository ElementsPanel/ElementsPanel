# Panel Runtime

`runtime` is the panel's foundational environment plugin. It initializes the
panel configuration and exposes shared infrastructure through the plugin
context:

- settings persistence and version metadata;
- request middleware and role constants;
- the current identity/authorization view;
- global process values used by feature plugins.

The panel executable only loads the foundation and feature plugins, starts and
stops the Cordis container, and provides process-level logging. Feature plugins
should consume runtime capabilities through `ctx` rather than importing panel
implementation singletons.

Runtime also owns the audit logger (`ctx.operations`), the overview extension
registry and the base `/api/overview` endpoint. Instance audit endpoints belong
to `plugins/instance` and consume the shared logger. Monitoring
is an optional contributor; removing it does not interrupt these services.
