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
- Layout cards `Market`, `MarketEditor`, `McPreset`, plus their card-pool entries
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
