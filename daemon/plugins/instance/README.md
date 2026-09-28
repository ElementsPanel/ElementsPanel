# Instance

The daemon-side instance plugin owns application instance entities, command
dispatch, process adapters, Docker support, scheduled tasks, instance events,
environment inspection and the core instance protocols. Optional protocols such
as `instance/mods/*` are owned by their feature plugins.

The plugin provides the daemon `ctx.instances` service consumed by terminal,
file, backup, Java, mod, market and monitoring plugins. Disabling it removes the
instance runtime and its protocols while leaving the daemon's generic services
available.

Minecraft download installation belongs to this plugin: `minecraft_install` is
an administrator-only task and `features.minecraftInstall` advertises it through
`info/overview`. Both registrations leave with the instance scope. Minecraft
creation remains available when the app market is disabled.

`ctx.instances.InstallTask` supplies the shared download, checksum, extraction,
update and cancellation lifecycle. Minecraft supplies its artifact and startup
command rules; market supplies its package configuration and reinstall policy.
Consumers extend this service instead of importing another plugin's internals.
Shared installation messages and Minecraft diagnostics live in `src/i18n/`.
