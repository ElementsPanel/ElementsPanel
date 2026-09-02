# terminal

The daemon terminal plugin owns the `stream/*` Socket.io protocol events,
stream authentication middleware, and the `instance/outputlog` event.

It uses the core passport and instance services through `DaemonPluginContext`,
so disabling the plugin removes terminal stream access without removing normal
instance lifecycle operations.
