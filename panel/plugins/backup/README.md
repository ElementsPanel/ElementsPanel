# Instance Backup

This plugin owns instance backup listing, creation, deletion and restoration in
both the normal panel and Desktop mode. It registers one removable instance
action with normal and Desktop components, and owns the panel-side backup HTTP
routes under `/api/protected_instance/backup`.

The generic asynchronous-task and file-editor APIs remain in the console
plugin's shared browser implementation;
the backup plugin composes them to run backup jobs and edit `.epbaklst`.

## Translations

`src/i18n/` holds the strings for the backup UI, passed to the panel as
`ctx.i18n.define()` by `src/frontend.ts`. The lines an instance prints while a
backup runs belong to `daemon/plugins/backup`, which ships its own catalogue —
the two never share a key.

`TXT_CODE_INSTANCE_BACKUP_RESTORE` moved here with the rest; the Desktop
plugin, which had been reusing it for its restore-window button, now has its
own `TXT_CODE_DESKTOP_RESTORE`.
