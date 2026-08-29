# Out-of-Box Experience

This plugin owns the panel's `/install` route, the public
`PUT /api/overview/install` language bootstrap endpoint and the first-run
shell: language selection, the welcome step and completion.

Account creation is not implemented here. The plugin resolves the optional
`user.oobeCreateAdminAccount` component service at render time. The `user`
plugin supplies that component and emits `complete` after it creates and logs
in the first administrator.

Removing this plugin removes the first-run UI. Removing the `user` plugin
removes authentication and reports the panel as already installed, so no
account-creation OOBE is required.
