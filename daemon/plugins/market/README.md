# App Market (daemon)

Owns both ways a market package reaches an instance. The daemon core keeps
neither, so a daemon without this plugin is fully usable but cannot install
packages.

| Registration | What it does |
| --- | --- |
| `ctx.tasks.register("quick_install", …)` | Creates a new instance around a package |
| `ctx.presets.register("install", …)` | Reinstalls an existing instance from a package |

`quick_install` declares `requiresInstance: false` — the instance does not exist
yet, the task builds it — and `requiredRole: 10`, so only an administrator can
trigger it. `Instance_router.ts` reads both off the registration and has no
market-specific branch left.

The `install` preset is what `taskName: "install_instance"` runs through
`instance.execPreset("install", parameter)`. `FunctionDispatcher` applies
plugin-supplied presets after its own defaults, so the preset simply does not
exist while the plugin is absent.

`src/backend/quick_install.ts` and `src/backend/install_command.ts` each export a
factory rather than a class, because both extend a base class
(`InstallTask`, `InstanceCommand`) that the plugin can only reach through the setup
context — importing the daemon core directly would compile a second copy of the
task subsystem. `ctx.instances.InstallTask` supplies the common installation
lifecycle; this plugin supplies bundled configuration handling and reinstall
behavior. Minecraft installation and its capability flag belong to `instance`
and remain available without `market`.

`src/i18n/` holds the market-specific installation messages. See
`panel/plugins/market` for the panel side.
