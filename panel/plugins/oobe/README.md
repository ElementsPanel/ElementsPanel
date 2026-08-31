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

## Translations

`src/i18n/` holds the welcome, completion and "already installed" strings.
`src/frontend.ts` passes them to the panel with `ctx.i18n.define()` and
`src/backend/index.ts` registers the same catalogue with i18next, so the
language bootstrap endpoint can answer in the caller's language. Every locale
ships with the plugin rather than being loaded on demand, because the install
page offers a language picker before a language has been chosen.
