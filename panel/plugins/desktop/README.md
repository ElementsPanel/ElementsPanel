# Desktop plugin

This panel plugin owns the `/desktop` frontend route, desktop UI components,
theme variables and icons. Its backend entry provides the authenticated
`/api/overview/desktop_layout` endpoints and keeps existing user layouts in
`data/desktop_layouts`.

Set `enabled` to `false` in `plugin.json` to exclude it when plugins are
discovered. Frontend plugin changes take effect after the normal frontend
compilation step.
