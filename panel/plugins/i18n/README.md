# i18n

This foundational plugin owns the panel's base translation catalogues on both
the backend and frontend. It provides `ctx.i18n`, initializes the shared
`i18next` instance for the panel process, creates the browser's `vue-i18n`
instance, and scopes translation bundles registered by other plugins.

The host loads this plugin before configuration, routes, layouts, and ordinary
plugins. Core imports from `app/i18n` and `@/lang/i18n` are compatibility
facades over the instances owned here.
