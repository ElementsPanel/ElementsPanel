# Data Monitoring (daemon)

Samples this host's CPU and memory usage every three seconds, keeps the last 200
samples, and contributes them to `info/overview` as `cpuMemChart` through
`ctx.overview.provide()`. The daemon core collects no history of its
own.

`apply()` starts the sampler and system-report timer with `ctx.setInterval()`,
so unloading the plugin leaves no timer behind. `plugins/runtime` owns the
`info/overview` protocol event and the `features`/`overview` registries.

Without monitoring, the daemon still reports its version, configuration,
current system usage, instance counts and capabilities. Only `cpuMemChart`
is absent. The panel keeps basic node information and renders empty history
series until monitoring is enabled again.

See `panel/plugins/monitor` for the panel side.
