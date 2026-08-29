# Data Monitoring

Owns the `/overview` page — the panel's data monitoring view — and everything
collected purely to draw it: the panel host's CPU/memory history, the API request
rate, the status tiles and the panel-wide operation log.

`GET /api/overview` itself stays in the panel core. Half the panel reads it for
the node list, the panel process and the host it runs on — `useOverviewInfo()` is
the single shared fetch behind the node plugin's cards, the instance manager
buttons and the node picker. This plugin *contributes to* that response rather
than owning it.

## Backend

`src/backend/service/visual_data.ts` keeps the two rolling histories the page
charts: 60 samples of host CPU/memory, and 60 samples of "API requests in the
last ten seconds" alongside the instance counts at that moment. Both used to be
a panel core singleton (`service/visual_data.ts`).

`setup()` wires three things:

| Registration | What it does |
| --- | --- |
| `registerOverviewProvider()` | Adds the `chart` field to `GET /api/overview` |
| `registerMiddleware()` | Counts `/api/` requests for the request chart |
| `registerRouter()` | `GET /api/monitor/operation_logs` |

The request counter lives here rather than in the core response middleware: the
request rate exists only to be charted. Koa runs the plugin's middleware for
every request regardless of where in the chain it was mounted, so the count is
complete either way.

`GET /api/monitor/operation_logs` replaces the core's
`GET /api/overview/operation_logs`. The **per-instance** log routes
(`/api/overview/instance_operation_logs`, `/instance_crash`,
`/instance_auto_restart`) stay in the core, because the instance pages read those
whether or not the monitoring page exists. The operation logger itself is core
infrastructure — every router writes to it.

`dispose()` stops both samplers, so unloading the plugin leaves no timers behind.

## Frontend

Registered by `src/frontend.ts`:

- Route `/overview`
- Layout cards `DataOverview`, `StatusBlock`, `RequestChart`, `InstanceChart`,
  `OperationLogCard`, plus their card-pool entries
- A Desktop application (`DesktopOverview`, moved out of the `desktop` plugin)

`src/hooks/useOverviewChart.ts` holds the full monitoring chart — axes, gradient
area fill, tooltip. The core keeps `useSimpleChart` in
`frontend/src/hooks/useOverviewChart.ts`, because the `node` plugin draws its
per-node sparklines with it.

### A note on `chart.system`

The panel host's CPU/memory history is collected and reported, but no card
currently draws it — the page shows the *current* figures instead, which come
from `system` and `process`. This predates the extraction; the field is kept so
the shape of `GET /api/overview` does not change for anything reading it.

## Daemon side

`daemon/plugins/monitor` is the matching daemon plugin. It samples that host's
CPU and memory and contributes `cpuMemChart` to `info/overview`. Note that the
consumer is mostly the **`node` plugin**: `useOverviewInfo()` turns `cpuMemChart`
into the per-node `cpuChartData`/`memChartData` that the node cards draw. So a
daemon without the monitoring plugin still connects and reports its current
usage; only the history line on node cards goes flat.
