# terminal

The panel terminal plugin owns the instance terminal card, command history,
terminal stream client, terminal status components, and the HTTP endpoints used
to establish a stream and read an instance output log.

The Desktop console consumes `ctx.terminal` for its core component and hook.
The terminal configuration action also lives here, including its normal and
Desktop dialogs. Its configuration-specific translations are shipped in the
plugin's `src/i18n` catalogue; generic labels shared with the rest of the panel
remain in the panel's base translations.
