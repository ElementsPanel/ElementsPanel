# i18n

This foundational plugin owns the panel's base translation catalogues on both
the backend and frontend. It provides `ctx.i18n`, initializes the shared
`i18next` instance for the panel process, creates the browser's `vue-i18n`
instance, and scopes translation bundles registered by other plugins.

The host loads this plugin before configuration, routes, layouts, and ordinary
plugins. The frontend bootstrap and shared plugin code import `@/lang/i18n` as
a compatibility facade over the instances owned here.

The plugin also declares the panel language setting consumed by the central
plugin configuration page. Saving it updates the persisted panel setting and
pushes the selected language to connected daemons; each daemon may opt out of
that push through its own i18n setting.
