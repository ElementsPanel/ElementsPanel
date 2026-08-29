# Instance Backup

This plugin owns instance backup listing, creation, deletion and restoration in
both the normal panel and Desktop mode. It registers one removable instance
action with normal and Desktop components, and owns the panel-side backup HTTP
routes under `/api/protected_instance/backup`.

The generic asynchronous-task and file-editor APIs remain in the panel core;
the backup plugin composes them to run backup jobs and edit `.epbaklst`.
