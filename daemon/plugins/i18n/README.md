# i18n

This foundational daemon plugin owns the complete daemon-wide translation
catalogue in `src/languages/`. It initializes the shared `i18next` singleton and
provides `ctx.i18n` so other daemon plugins can register scoped translations
with `ctx.i18n.define(localeMessages)`.

The daemon loads this plugin before configuration, migration, diagnostics and
all ordinary plugins. Its twelve language files are self-contained and do not
depend on a repository-level `languages/` directory.
