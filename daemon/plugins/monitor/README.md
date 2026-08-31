# Data Monitoring (daemon)

Samples this host's CPU and memory usage every three seconds, keeps the last 200
samples, and contributes them to `info/overview` as `cpuMemChart` through
`ctx.overview.provide()`. The daemon core collects no history of its
own.

`apply()` starts the sampler with `ctx.setInterval()`, so unloading the plugin
leaves no timer behind.

Without this plugin the daemon stays fully usable and still reports its *current*
usage in the `system` field. What disappears is the history line: the panel's
`useOverviewInfo()` turns `cpuMemChart` into the `cpuChartData`/`memChartData`
that the panel `node` plugin draws on each node card, so those sparklines go
flat.

See `panel/plugins/monitor` for the panel side.
