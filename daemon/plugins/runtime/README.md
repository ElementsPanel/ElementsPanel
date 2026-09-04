# Daemon Runtime

`runtime` is the daemon's foundational environment plugin. It loads the
configuration, performs startup checks and exposes shared infrastructure through
the plugin context:

- settings and version information;
- storage and upload middleware;
- transfer passports, downloads and rate-limited file sending;
- archive and 7-Zip helpers.

The daemon executable does not use these implementations directly. It only
loads the foundation plugins, loads enabled feature plugins, starts/stops the
Cordis container and owns process-level logging. Feature plugins should consume
the services above through `ctx` and should not import daemon implementation
singletons.
