# Panel Runtime

`runtime` is the panel's foundational environment plugin. It initializes the
panel configuration and exposes shared infrastructure through the plugin
context:

- settings persistence and version metadata;
- storage, request middleware and role constants;
- the current identity/authorization view;
- global process values used by feature plugins.

The panel executable only loads the foundation and feature plugins, starts and
stops the Cordis container, and provides process-level logging. Feature plugins
should consume runtime capabilities through `ctx` rather than importing panel
implementation singletons.
