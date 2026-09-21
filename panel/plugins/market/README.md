# App Market

Owns the application market end to end: browsing the package catalogue,
creating an instance from a package, reinstalling an existing instance from one,
and editing a custom catalogue. Removing the plugin removes the market pages,
the market API and the two settings that configure it — nothing in the panel
core refers to a package.

## Backend

`src/backend/index.ts` mounts everything under `/api/market`:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/market/config` | Whether this caller may install packages |
| `GET` | `/api/market/packages` | The package catalogue |
| `POST` | `/api/market/install_instance` | Reinstall an instance from a package |
| `GET` `PUT` | `/api/market/settings` | Market source and install permission |

`service/market_service.ts` resolves the catalogue from either an uploaded file
under `public/upload_files/` or the remote source, caching remote responses in
`data/market_cache.json` for twelve hours. Changing the source address clears
that cache.

`POST /api/market/install_instance` identifies a package by its `title` and
`description` only, looks the real record up in the catalogue and forwards
*that* to the daemon. Nothing else from the request body is used, so a caller
cannot smuggle in a start command.

### Settings

`presetPackAddr` and `allowUsePreset` used to live in the panel's
`SystemConfig`. They are market settings, so this plugin owns them:
`entity/market_settings.ts` defines them and `service/market_settings.ts`
stores them under `MarketSettings/config`, copying the values out of the panel's
stored `SystemConfig` once on first start so upgrades keep their configuration.
That migration also performs the pre-10.8 market source upgrade the panel core
used to do in `version_adapter.ts`.

`/api/auth/status` no longer reports `allowUsePreset`; the terminal button asks
`/api/market/config` instead. They are edited through the `config` plugin's page
(`src/PluginConfig.vue`), not the panel Settings page.

## Frontend

Registered by `src/frontend.ts`:

- Routes `/market` and `/market/editor`
- Fixed pages for `Market` and `MarketEditor`, plus the `McPreset` layout card used by quick start
- A Desktop application (`DesktopMarket`)
- A terminal action — the "reinstall from a package" button
- Services `market.api`, `market.openMarketDialog`, `market.useMarketPackages`

`src/hooks/useMarketPackages.ts` holds the catalogue fetch and all the filter
state. `src/market-dialog.ts` mounts the package picker; it is registered as
`market.openMarketDialog` so the core Iframe bridge
(`plugins/console/src/components/IframeBox/handler.ts`) can open it without importing
this plugin, and reports a clear error when the plugin is absent.

`src/runtime.ts` caches the install permission once the plugin is ready, because
the terminal button's `condition` is evaluated synchronously on every render.

### Shared console implementation

`FilterOption` and `SEARCH_ALL_KEY` live in the console plugin's shared types,
and `InstanceDetail.vue` is provided by the instance plugin: the market editor
uses that plugin service directly when it edits a package's instance
configuration.

The default layouts for `/market` and `/market/editor` are contributed through
the console layout registry, alongside the node and users pages. The panel core
does not own feature layout definitions.

`plugins/console/src/components/InstallOptionButton.vue` is a generic button
used by the instance-creation page and has nothing to do with the market.

## Daemon side

`daemon/plugins/market` is the matching daemon plugin. It owns the
`quick_install` asynchronous task (create an instance around a package) and the
`install` instance preset (reinstall an existing one). A daemon without it stays
fully usable; it simply cannot install packages.

## Plugin market

`/market/plugins` is a second market: it installs **plugins**, not instance
templates. Its source is EPanel_Market, whose address is the `pluginMarketAddr`
setting on this plugin's own settings form.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/market/plugin/list` | the market's published plugins, each with the version installed here |
| GET | `/api/market/plugin/detail` | public plugin details and approved versions; accepts `pluginId` and optional `version`, and adds the locally installed version |
| GET | `/api/market/plugin/installed` | what has been installed from the market |
| GET | `/api/market/plugin/nodes` | the daemons a daemon half can be sent to |
| GET | `/api/market/plugin/package` | what a published package contains, before installing it |
| POST | `/api/market/plugin/install` | download a package, write the panel half, send the daemon half to the named nodes |
| DELETE | `/api/market/plugin/uninstall` | remove it again, here and on the named nodes |

Selecting a plugin opens `/market/plugins/:pluginId`. The detail page renders
the description and release notes as sanitized Markdown and shows version dates,
file counts and package sizes. Its version picker preserves the choice in the
`version` query parameter. Installation uses that exact approved version for both
the package lookup and download, including after the node picker is confirmed.
The install and uninstall dialogs live in `components/PluginMarketInstall.vue`.
Uninstall checks the installed version's package when deciding whether to offer
daemon removal. Details are fetched through the panel backend, using the configured
EPanel_Market source and the same administrator permission as installation.

A published package is laid out with the side as its first path segment
(`panel/plugin.json`, `daemon/backend/index.cjs`, …), so installing is mostly
splitting that prefix and writing each file under `<side>/<plugins>/<name>/`.
`src/backend/service/plugin_market.ts` owns that, and marks every installed
directory with `.market-install.json` — without the marker a directory in
`plugins/` is indistinguishable from a built-in plugin.

**Where each half lands.** The panel half is written into this process's plugin
directory: `installRoot()` puts it in `panel/market_plugins/` in development and
in `panel/plugins/` otherwise, so an installation never adds files to the
repository — `market_plugins/` is git-ignored. Both loaders and
`frontend/vite.config.ts` therefore list `market_plugins` as a discovery root,
with the built-in directory first so a market plugin cannot shadow one of ours.

The daemon half has to sit on every machine that loads it, so it is not written
here at all: the page asks which nodes to send it to (all of them selected to
start with), and `plugin/install` carries the files over the panel's existing
daemon connection, base64 in the event payload — the socket is already configured
for a 100 MB buffer, and a compiled plugin is a few hundred kilobytes. The daemon
writes them into its own `market_plugins/<name>/`, which both loaders scan
everywhere, and marks the directory with the same `.market-install.json` the panel
uses, so `listInstalled()` recognises it on either side. Path escapes, extensions
outside a compiled package's set, and a name that is not a plain directory name
are all rejected there: the payload arrives from the network.

`src/backend/service/plugin_market.ts` owns the package — fetching its file list,
downloading it, writing a side, marking the directory — and the route decides
where each half goes.

**How "development" is detected.** Not with `process.env.NODE_ENV`: webpack bakes
`"production"` into every plugin bundle, and a plugin's `backend/index.cjs` is
what runs even while the dev servers are up, so the check would always say
production. `isDevelopment()` looks for `panel/src/app` instead — present in a
source checkout, absent from a built deployment, which is only
`production-code/web` and `production-code/daemon`.

**Restart required — except in development.** The panel and the daemon load their
plugins at startup, so in a deployment an install or an uninstall only takes
effect after both are restarted; the page says so, and the install route answers
`restartRequired: true`.

A source checkout reloads instead: the route calls `ctx.plugins.reload()`, which
re-scans the panel's own directories — installing what has appeared and disposing
what is gone — and asks the daemons the package was sent to do the same over
`plugin/reload`, reconnecting each node afterwards because a daemon binds its
protocol handlers onto each socket as that socket connects. The browser half
needs nothing: the Vite dev server watches the plugin directories and reloads the
page. `reload()` itself refuses to run outside development, so a built
deployment keeps the restart it asks for. What reload cannot do is replace a
plugin that is already loaded — installing a newer version of one still needs a
restart.

**A node that cannot be reached.** Sending the daemon half to one node says
nothing about the others, so a failure is collected instead of thrown: the panel
half is already installed by then, and the route answers with the `failedNodes`
it could not update, which the page names. A package whose daemon half reached no
node at all is a package installed into the panel alone.
