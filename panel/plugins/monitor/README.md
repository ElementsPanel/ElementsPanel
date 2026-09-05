# Data Monitoring

Owns the `/overview` page — the panel's data monitoring view — and everything
collected purely to draw it: the panel host's CPU/memory history, the API request
rate, the status tiles and the panel-wide operation log.

`GET /api/overview` is owned by this plugin. Half the panel reads it for
the node list, the panel process and the host it runs on — `useOverviewInfo()` is
the single shared fetch behind the node plugin's cards, the instance manager
buttons and the node picker. Additional fields are contributed through the
overview registry so each feature can own the data it displays.

## Backend

`src/backend/service/visual_data.ts` keeps the two rolling histories the page
charts: 60 samples of host CPU/memory, and 60 samples of "API requests in the
last ten seconds" alongside the instance counts at that moment. Both used to be
a panel core singleton (`service/visual_data.ts`).

`apply()` wires three things:

| Registration             | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `ctx.overview.provide()` | Adds the `chart` field to `GET /api/overview` |
| `ctx.koa.use()`          | Counts `/api/` requests for the request chart |
| `ctx.koa.router()`       | `GET /api/monitor/operation_logs`             |

The request counter lives here rather than in the core response middleware: the
request rate exists only to be charted. Koa runs the plugin's middleware for
every request regardless of where in the chain it was mounted, so the count is
complete either way.

`GET /api/monitor/operation_logs` is the panel-wide operation log endpoint.
The **per-instance** log routes
(`/api/overview/instance_operation_logs`, `/instance_crash`,
`/instance_auto_restart`) are registered by this plugin, so disabling monitor
removes all operation-log HTTP behavior together. The monitor plugin owns the
per-instance log viewer and feature plugins write through its operation logger.
No operation-log implementation remains in the panel core; feature plugins use
the monitor service exposed on `ctx.operations`.

`dispose()` stops both samplers, so unloading the plugin leaves no timers behind.

## Frontend

Registered by `src/frontend.ts`:

- Route `/overview`
- Layout cards `DataOverview`, `StatusBlock`, `RequestChart`, `InstanceChart`,
  `OperationLogCard`, plus their card-pool entries
- The instance-console operation-log action and its normal/Desktop log window
- A Desktop application (`DesktopOverview`, moved out of the `desktop` plugin)

`src/hooks/useOverviewChart.ts` holds the full monitoring chart — axes, gradient
area fill, tooltip. The console plugin provides the shared `useSimpleChart`
implementation in `plugins/console/src/hooks/useOverviewChart.ts`, because the
`node` plugin draws its per-node sparklines with it.

### A note on `chart.system`

The panel host's CPU/memory history is collected and reported, but no card
currently draws it — the page shows the _current_ figures instead, which come
from `system` and `process`. This predates the extraction; the field is kept so
the shape of `GET /api/overview` does not change for anything reading it.

## Daemon side

`daemon/plugins/monitor` is the matching daemon plugin. It samples that host's
CPU and memory and contributes `cpuMemChart` to `info/overview`. Note that the
consumer is mostly the **`node` plugin**: `useOverviewInfo()` turns `cpuMemChart`
into the per-node `cpuChartData`/`memChartData` that the node cards draw. So a
daemon without the monitoring plugin still connects and reports its current
usage; only the history line on node cards goes flat.
