# Data Monitoring (daemon)

Samples this host's CPU and memory usage every three seconds, keeps the last 200
samples, and contributes them to `info/overview` as `cpuMemChart` through
`ctx.overview.provide()`. The daemon core collects no history of its
own.

`apply()` starts the sampler with `ctx.setInterval()`, so unloading the plugin
leaves no timer behind. The plugin also owns the `info/overview` protocol event;
the server plugin only provides transport.

Without this plugin the daemon no longer answers `info/overview`; the daemon
server remains reachable, but monitoring data is intentionally unavailable.
When enabled, current usage is reported in the `system` field. What disappears
when monitoring is removed is the history line: the panel's
`useOverviewInfo()` turns `cpuMemChart` into the `cpuChartData`/`memChartData`
that the panel `node` plugin draws on each node card, so those sparklines go
flat.

See `panel/plugins/monitor` for the panel side.
