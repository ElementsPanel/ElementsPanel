# file

The file manager, both halves of it.

Nothing about reading or writing an instance's files is left in the panel core:
the routes, the card, the editor, the viewer, the upload queue and the dialogs all
live here, and the matching `daemon/plugins/file` owns the daemon end.

## Backend

`src/backend/file_router.ts` owns every route the UI talks to, all under
`/api/files`: `status`, `list`, `chmod`, `chmod_batch`, `touch`, `mkdir`, `copy`,
`move`, `delete`, `edit`, `compress`, `download_from_url` and the two passport
registrations that hand the browser a direct upload or download URL.

No bytes pass through the panel. Each route forwards to the daemon that holds the
instance, over `ctx.remote`; the browser then uploads to and downloads from that
daemon directly, which is what the passport routes are for.

Two checks sit in front of every route: the user plugin's `canFileManager`
access-policy switch, exposed through `ctx.identity`, and
`ctx.middleware.instanceAccess` for whether this caller may touch this instance
at all. Both answers come from whichever guard is installed rather than from a
copy of the rules kept here.

## Frontend

| Module | What it is |
| --- | --- |
| `api.ts` | Every `/api/files/*` binding. |
| `hooks/useFileManager.ts` | The browsing, selecting and uploading logic behind both file managers. |
| `tools/fileManager.ts` | Filename helpers: icon, extension, display name, "is an archive". |
| `services/uploadService.ts` | The chunked upload queue and its reactive progress state. |
| `components/UploadBubble.vue` | The progress overlay, mounted with `ctx.ui.globalComponent()`. |
| `components/{Upload,Download}FileDialog.vue` | Pick a file to upload; enter a URL to fetch. |
| `dialogs.ts` | The three `use*Dialog()` helpers that mount them on demand. |
| `normal/{FileManager,FileEditor,ImageViewer}.vue` | The card and its two dialogs. |
| `desktop/Desktop*.vue` | The same three, as Desktop windows. |

`ctx.ui.layoutCard("InstanceFileManager", FileManager)` restores the card the
layout engine used to find in the core registry, and `ctx.ui.layoutCardPoolItem`
puts it back in the design-mode picker.

## What it publishes

`ctx.set("file", ...)` — the API, the hook, the upload queue, the filename
helpers, the three components and the three dialog openers. Everything that used
to `import` one of those now resolves the service with `usePluginService` and
degrades when it is absent:

| Consumer | Without this plugin |
| --- | --- |
| `Editor.vue` | Edits fine, but cannot tell which language to highlight. |
| `ArchivePreview.vue` | Rows show no file-type icon. |
| `plugins/console`'s appearance settings, `MusicCard.vue`, `PluginCard.vue`, `InstanceDetail.vue` | The "pick a file" buttons return nothing, so the image or URL is left unchanged. |
| `CreateInstanceForm.vue` | Creating an instance from an uploaded pack is unavailable; every other method works. |
| `ModManager.vue`, `useModUpload.ts` | Mods can be browsed but not uploaded, and their configuration cannot be edited. |
| `ServerConfigFile.vue` | The structured editor works; "edit the raw file" has nothing to open. |
| `plugins/backup` | Backups list and restore; editing a backup's configuration file is unavailable. |
| `plugins/desktop` | The file manager, file editor and image viewer windows have nothing to render. |

The Desktop components take their window shell from `ctx.desktop.window` rather
than importing `plugins/desktop`'s own component, so neither plugin reaches into
the other's source tree.

## Daemon side

`daemon/plugins/file` owns the fourteen `file/*` protocol events these
routes call, the upload/download HTTP routes the passports authorize, and the
sandboxed `FileManager` the rest of the daemon touches files through. Neither half
is useful without the other: a panel with this plugin talking to a daemon without
its own answers with a request timeout.
