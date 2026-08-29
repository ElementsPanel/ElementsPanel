# Out-of-Box Experience

This plugin owns the panel's `/install` route, its persistent completion state,
the public `PUT /api/overview/install` language bootstrap endpoint and the
first-run shell: language selection, the welcome step and completion.

Account creation is not implemented here. The plugin resolves the optional
`user.oobeCreateAdminAccount` component service at render time. The `user`
plugin supplies that component and emits `complete` after it creates and logs
in the first administrator. When the service is absent, OOBE skips the account
step and continues to completion.

The plugin registers its completion state with the panel core. Removing the
plugin restores the core's installed-by-default fallback, so the router never
redirects to a missing `/install` page.
