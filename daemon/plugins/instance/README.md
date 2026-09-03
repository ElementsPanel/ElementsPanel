# Instance

The daemon-side instance plugin owns application instance entities, command
dispatch, process adapters, Docker support, scheduled tasks, instance events,
environment inspection and all `instance/*` protocols.

The plugin provides the daemon `ctx.instances` service consumed by terminal,
file, backup, Java, market and monitoring plugins. Disabling it removes the
instance runtime and its protocols while leaving the daemon's generic services
available.
