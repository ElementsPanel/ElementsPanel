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

`src/backend/index.ts` owns every HTTP route the node UI talks to:

| Method | Route |
| --- | --- |
| `GET` | `/api/service/remote_services_list` |
| `GET` | `/api/service/remote_services_system` |
| `GET` | `/api/service/remote_services` |
| `POST` | `/api/service/remote_service` |
| `PUT` | `/api/service/remote_service` |
| `DELETE` | `/api/service/remote_service` |
| `GET` | `/api/service/link_remote_service` |

The remote service subsystem itself stays in the panel core, because instance
routing, sockets, the overview and the exchange service all depend on it. The
plugin reaches it through `context.services.remote` and
`context.services.remoteRequest`. `/api/service/remote_service_instances` also
stays in the core, since the core frontend browses instances with it whether or
not this plugin is installed.

## Daemon side

`daemon/plugins/node` is the matching daemon plugin. It owns the `info/setting`
protocol event, which is how this plugin writes a node's configuration (speed
limits, allocatable port range, soft shutdown, instance backup, language). The
daemon core only reports that configuration back through `info/overview`.

A daemon without the plugin stays connectable and fully usable; it simply keeps
its own configuration, and the panel logs a warning instead of failing the
node's authentication.
