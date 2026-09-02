# terminal

The panel terminal plugin owns the instance terminal card, command history,
terminal stream client, terminal status components, and the HTTP endpoints used
to establish a stream and read an instance output log.

The Desktop console consumes `ctx.terminal` for its core component and hook.
The terminal plugin has no private catalogue; its labels use the shared panel
translations.
