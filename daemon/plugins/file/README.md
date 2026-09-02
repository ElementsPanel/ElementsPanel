# file

The daemon's file subsystem.

Everything about reading and writing instance files lives here: the sandboxed
`FileManager`, the chunked upload manager, the fourteen `file/*` protocol events
and the upload/download HTTP routes.

| Module | What it is |
| --- | --- |
| `system_file.ts` | `FileManager` — resolves a path inside one instance's working directory and refuses to leave it. |
| `upload_manager.ts` | The chunked uploads in flight. |
| `file_writer.ts` | One upload's file handle, lock and received ranges. |
| `file_service.ts` | `getFileManager(instanceUuid)` and the Windows drive list. |
| `file_router.ts` | The `file/*` events, plus the middleware that gates them. |
| `http_router.ts` | `GET /download/:key/:fileName` and the three upload routes. |
| `filepath.ts`, `url.ts` | Path normalisation and the download-URL safety check. |
| `runtime.ts` | This plugin's handle on `ctx`, and the daemon-wide file task counter. |

## What it provides

`ctx.set("files", { FileManager, uploads, getFileManager, getWindowsDisks })`.

This is the one plugin the daemon cannot touch instance files without: instance
creation and update, the Java manager, SteamCMD and the mod service all go
through it, and so does `ctx.instances.fileManager`, which `plugins/market` uses
to write a package's configuration. The core declares only the shape it needs
(`DaemonFilesService` in `src/plugin/context.ts`) and resolves it at use time
through `src/service/file_access.ts`, so removing the plugin leaves those callers
answering with a clear error rather than breaking the build.

## What it needs

`ctx.transfer` is the counterpart: the core hands over the passports that
authorize a transfer (`routers/passport_router.ts` issues them and
`plugins/terminal` checks the stream passport), the URL downloader the Java manager
and mod service share, and the rate-limited file sender. `ctx.archive` carries the
compression helpers, extended here with `compress`, `decompress` and
`listArchiveEntries`.

The upload routes sit behind the core's upload middleware, which the web server
mounts ahead of the body parser. Without this plugin that middleware rejects
every multipart request, because there is nothing left to receive one.

## Ordering

`priority: 30` — after `plugins/auth` (20), whose middleware must run first, and
after `plugins/server` (10), whose `ctx.koa` the HTTP routes need. The daemon does
not listen until the server binds on `ready`, so no request is ever routed before
these registrations exist.

Chunked uploads hold open file handles and lock files, so `ctx.on("dispose")`
stops them; the daemon's own shutdown path used to do that.
