# filemanager

The panel side of the file manager.

`src/backend/file_router.ts` owns every route the file manager UI talks to, all
under `/api/files`: `status`, `list`, `chmod`, `chmod_batch`, `touch`, `mkdir`,
`copy`, `move`, `delete`, `edit`, `compress`, `download_from_url` and the two
passport registrations that hand the browser a direct upload or download URL.

No bytes pass through the panel. Each route forwards to the daemon that holds the
instance, over `ctx.remote`; the browser then uploads to and downloads from that
daemon directly, which is what the passport routes are for.

## The gate

Two checks sit in front of every route:

- `canFileManager` — the panel-wide switch. While it is off, only an elevated
  caller gets through, and the refusal is the same string `mod_manager_router`
  shows, so it stays in the shared catalogue rather than moving here.
- `ctx.middleware.instanceAccess` — whether this caller may touch this instance
  at all. It is the shared middleware, so the answer comes from whichever guard
  is installed rather than from a copy of the rule kept here.

## Daemon side

`daemon/plugins/filemanager` is the matching plugin: it owns the fourteen
`file/*` protocol events these routes call and the upload/download HTTP routes the
passports authorize. Neither half is useful without the other — a panel with this
plugin talking to a daemon without its own answers with a request timeout.

## What stays in the core

`/api/service/remote_service_instances` and the instance routes are unaffected:
this plugin only adds the file surface. `plugins/user`'s asset upload
(`/api/overview/upload_assets`) is the panel's own storage and has nothing to do
with instance files.
