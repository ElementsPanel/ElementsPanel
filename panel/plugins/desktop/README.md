# Desktop plugin

This panel plugin owns the `/desktop` frontend route, desktop UI components,
theme variables and icons. Its backend entry provides the authenticated
`/api/overview/desktop_layout` endpoints and keeps existing user layouts in
`data/desktop_layouts`.

Set `enabled` to `false` in `plugin.json` to exclude it when plugins are
discovered. The frontend entry is emitted to `dist/plugins/desktop/`, then
collected under `production-code/web/plugins/desktop/frontend/`; it can be
loaded or unloaded at runtime through `window.ElementsPanelPlugins`. Its
compiled JavaScript and CSS are stored in the plugin directory, its icons are
embedded in that JavaScript, and the production package does not retain `src/`.
Removing the production
`plugins/desktop` directory, removing its `frontend` directory, or setting
`enabled` to `false` prevents the frontend plugin from appearing in the runtime
manifest. The packaged `backend/` entry is loaded when the panel process
starts.
