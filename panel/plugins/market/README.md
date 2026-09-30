# Plugin Market

Application templates moved to `external/epanel-plugin-mcsm-market`. This built-in
plugin retains plugin browsing, installation, updates and removal. Its settings
are stored in `PluginMarketSettings/config`, migrated from `MarketSettings/config`.

## Plugin market

`/market/plugins` is a second market: it installs **plugins**, not instance
templates. Its source is EPanel_Market, whose address is the `pluginMarketAddr`
setting on this plugin's own settings form.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/market/plugin/list` | the market's published plugins, each with the version installed here |
| GET | `/api/market/plugin/detail` | public plugin details and approved versions; accepts `pluginId` and optional `version`, and adds the locally installed version |
| GET | `/api/market/plugin/installed` | what has been installed from the market |
| GET | `/api/market/plugin/icon` | the plugin's icon as a data URL, proxied from the market; accepts `pluginId` and optional `version` |
| GET | `/api/market/plugin/nodes` | the daemons a daemon half can be sent to |
| GET | `/api/market/plugin/package` | what a published package contains, before installing it |
| POST | `/api/market/plugin/install` | download a package, write the panel half, send the daemon half to the named nodes |
| DELETE | `/api/market/plugin/uninstall` | remove it again, here and on the named nodes |

Selecting a plugin opens `/market/plugins/:pluginId`. The page is laid out like a
store listing: a header with the plugin's name, author and install action, a
Readme / Versions / Updates tab set, and a sidebar carrying the category and the
plugin's id, vendor and versions. The Readme tab renders the description the
market publishes with the plugin, which is the package's own `README.md`
(`readme` on the detail response); a market source that does not send one falls
back to the plugin's long description, and the rendering and sanitizing happen
here because that source is a configurable address. Versions lists
every approved release with its date, file count and package size, and each row
carries its own install button — the header's installs the latest release. The
Updates tab lists every release's notes. A row is not a link: clicking one no
longer switches the page to that release, and the page no longer reads or writes
the `version` query parameter. Installing uses the release the clicked button
belongs to for both the package lookup and download, including after the node
picker is confirmed.
The install and uninstall dialogs live in `components/PluginMarketInstall.vue`;
its `installOnly` flag drops the uninstall action for the release rows, since
uninstalling concerns the plugin rather than one release. Uninstall checks the
installed version's package when deciding whether to offer daemon removal.
Details are fetched through the panel backend, using the configured EPanel_Market
source and the same administrator permission as installation.

A card and the detail header both say which halves a plugin has. The market
reports the sides of each release — the first path segment of its package — as
`sides`, and `components/PluginMarketSideBadge.vue` turns that into
"Panel插件", "Daemon插件" or "双端插件". The list uses the plugin's own `sides`
(the latest release's) and the detail header the latest release's. A market source
that predates the field sends nothing, in which case no badge is shown rather than
a guess.

A card and the detail header also show the plugin's icon: the package's own
`icon.png`, announced as `hasIcon` on the market response. `hooks/usePluginIcons.ts`
fetches it once per plugin, through `/api/market/plugin/icon` rather than straight
from the market — the market's address is a backend setting, so the browser cannot
build that URL itself, the same reason every other market call goes through the
panel. That route answers with a **data URL**, not the image: the panel's request
layer only reads JSON (`console`'s `apiService` returns the body's `data` field),
so a binary response would not arrive. A plugin without an icon, or a market
source that predates `hasIcon`, simply has no entry and the page keeps the default
puzzle icon.

The desktop registers a separate administrator-only `plugin-market` application.
`desktop/DesktopPluginMarket.vue` keeps list/detail navigation inside its window,
leaving the desktop route unchanged. It shares
`components/PluginMarketList.vue`, `components/PluginMarketDetail.vue` and the
installation dialogs with normal mode. Returning to the list preserves its search
and scroll position, and installation events update the list's installed badges.
Desktop layouts respond to the window width, including while it is resized.

A published package is laid out with the side as its first path segment
(`panel/plugin.json`, `daemon/backend/index.cjs`, …), so installing is mostly
splitting that prefix and writing each file under the side's plugin root. In
development that is `<side>/data/plugins/<name>/`; production uses
`<side>/plugins/<name>/`.
`src/backend/service/plugin_market.ts` owns that, and marks every installed
directory with `.market-install.json` — without the marker a directory in a
plugin root is indistinguishable from a built-in plugin.

**The list is read in full.** The market pages `GET /api/plugins` (12 plugins by
default, at most 48 per page), and the page searches and filters on the client, so
`/api/market/plugin/list` reads every page before answering.

**Compatibility and checksums.** `/files` is asked with `pluginApi=1&pluginSdk=1`;
the market answers `409` for a package that declares another API or SDK, and
reports each side's `compatibility` (also on every version summary, which is what
greys out a release's install button) and each file's `sha256`. A downloaded file
whose length or digest differs from what `/files` advertised is refused before
anything is written or sent to a node. A market source that predates these fields
still installs, checked by size only.

**Where each half lands.** `installRoot()` writes the panel half to
`panel/data/plugins/` in development and `web/plugins/` in production. Both
loaders and `frontend/vite.config.ts` continue to discover the legacy
`data/plugins/` and `market_plugins/` roots, with the built-in directory first so
a market plugin cannot shadow one of ours.

The daemon half has to sit on every machine that loads it, so it is not written
here at all: the page asks which nodes to send it to (all of them selected to
start with), and `plugin/install` carries the files over the panel's existing
daemon connection, base64 in the event payload — the socket is already configured
for a 100 MB buffer, and a compiled plugin is a few hundred kilobytes. The daemon
writes them into its own `plugins/<name>/` in production (`data/plugins/<name>/`
in development), which both loaders scan, and marks the directory with the same
`.market-install.json` the panel uses; the panel keeps
a record of each node it installed on under `data/market-installs/`. Path escapes,
extensions outside `PLUGIN_PACKAGE_EXTENSIONS` (`common/src/plugin_package.ts`, the
same list the publish script and the market's upload check), and a name that is not
a plain directory name are all rejected there: the payload arrives from the network.

`src/backend/service/plugin_market.ts` owns the package — fetching its file list,
downloading it, writing a side, marking the directory — and the route decides
where each half goes.

**How "development" is detected.** Not with `process.env.NODE_ENV`: webpack bakes
`"production"` into every plugin bundle, and a plugin's `backend/index.cjs` is
what runs even while the dev servers are up, so the check would always say
production. `isDevelopment()` looks for `panel/src/app` instead — present in a
source checkout, absent from a built deployment, which is only
`production-code/web` and `production-code/daemon`.

**Hot loading and restart boundaries.** After an install or uninstall, the route
calls `ctx.plugins.reload()`, which re-scans the panel's own directories — loading
what has appeared and disposing what is gone — and asks the selected daemons to
do the same over `plugin/reload`. Each node reconnects afterwards because a daemon
binds protocol handlers onto each socket as that socket connects. This works in a
built production deployment as well as a source checkout. In production the
browser watches `/plugins/events`, re-reads the frontend manifest and applies the
new plugin graph; Vite handles source-checkout changes during development.

Reload does not replace backend code that has already run. Installing a newer
revision of an existing panel or daemon plugin therefore still answers
`restartRequired: true`; a completely new plugin, removal, or activation does not
require a service restart when each affected side reloads successfully.

**A node that cannot be reached.** Sending the daemon half to one node says
nothing about the others, so a failure is collected instead of thrown: the panel
half is already installed by then, and the route answers with the `failedNodes`
it could not update, which the page names. A package whose daemon half reached no
node at all is a package installed into the panel alone.
