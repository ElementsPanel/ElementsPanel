# Panel Storage

The storage foundation owns the panel's entity persistence implementations and
exposes them as `ctx.storage`. It loads before `runtime`, which consumes the
service while initializing the panel configuration.
