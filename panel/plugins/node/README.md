# Node Management

Provides the regular node management pages, Docker image management cards, node overview cards, and the node manager window in Desktop mode.

The plugin owns the node API factories (`src/api.ts`) and the shared
`useRemoteNode` hook (`src/hooks/useRemoteNode.ts`). They are registered as
runtime services (`node.api` and `node.useRemoteNode`) so other plugins can
consume node functionality without importing this plugin's source files.

It registers its routes and layout cards at runtime, so disabling or removing
the plugin removes the associated pages, cards, APIs, and hook services as
well.

## Backend

`src/backend/` owns the remote-node subsystem itself, and every HTTP route the
node UI talks to:

| Module | What it is |
| --- | --- |
| `remote_service.ts` | `RemoteServiceSubsystem` — the set of nodes, their persistence, the localhost auto-scan and the reconnect timer. |
| `remote_entity.ts` | `RemoteService` — one daemon: its socket, its authentication and every connection log line. |
| `remote_command.ts` | `RemoteRequest` — one request/response round trip, and the timeout error. |
| `remote_config.ts` | The `RemoteServiceConfig` entity, stored under that category name. |
| `remote_base.ts` | The tiny `UniversalRemoteSubsystem` map wrapper it extends. |
| `runtime.ts` | This plugin's handle on `ctx`, so the modules above can log and read storage. |
| `index.ts` | `ctx.set("remote", …)` plus the routes below. |

| Method | Route |
| --- | --- |
| `GET` | `/api/service/remote_services_list` |
| `GET` | `/api/service/remote_services_system` |
| `GET` | `/api/service/remote_services` |
| `POST` | `/api/service/remote_service` |
| `PUT` | `/api/service/remote_service` |
| `DELETE` | `/api/service/remote_service` |
| `GET` | `/api/service/link_remote_service` |

Because the subsystem is handed over as `ctx.remote`, this is the plugin the
panel cannot reach a daemon without: instance routing, the file manager, the
overview and the exchange service all go through it. The core declares only the
shape it needs (`PanelRemoteService` in `src/app/plugin/context.ts`) and resolves
it at use time through `src/app/service/remote_access.ts` — `remoteSubsystem()`,
`remoteRequest(node)` and `isRemoteRequestTimeout(error)`. Removing the plugin
therefore leaves those routes answering with a clear error rather than breaking
the build, and every connection log line is prefixed `node` because it is this
plugin's `ctx.logger` writing it.

That is also why the plugin loads at `priority: 20`, right after
`plugins/server`: `oobe`, `monitor`, `backup` and `market` all inject `remote`,
and it has to exist before they apply.

`/api/service/remote_service_instances` stays in the core, since the core
frontend browses instances with it whether or not this plugin is installed.

## Daemon side

`daemon/plugins/node` is the matching daemon plugin. It owns the `info/setting`
protocol event, which is how this plugin writes a node's configuration (speed
limits, allocatable port range, soft shutdown, instance backup, language). The
daemon core only reports that configuration back through `info/overview`.

A daemon without the plugin stays connectable and fully usable; it simply keeps
its own configuration, and the panel logs a warning instead of failing the
node's authentication.
