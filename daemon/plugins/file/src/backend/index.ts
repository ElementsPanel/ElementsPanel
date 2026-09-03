import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { registerFileEvents } from "./file_router";
import { getFileManager, getWindowsDisks } from "./file_service";
import { registerHttpRoutes } from "./http_router";
import { setPluginContext } from "./runtime";
import FileManager from "./system_file";
import uploadManager from "./upload_manager";

// The daemon's file subsystem.
//
// Everything about reading and writing instance files lives here: the
// `FileManager` that resolves and sandboxes a path, the chunked upload manager,
// the fourteen `file/*` protocol events and the upload/download HTTP routes.
//
// The primitives are handed to the rest of the daemon as `ctx.files`, because
// instance creation, the Java manager, SteamCMD and the mod service all need to
// touch files too. The core declares only the shape it uses and resolves it
// through `service/file_access.ts`, so removing this plugin removes the daemon's
// ability to touch instance files rather than breaking the build.

// File routes resolve the instance service when a request arrives. Keeping the
// dependency lazy avoids a startup cycle: the instance plugin depends on the
// file primitives, while the file routes only need instances at request time.
export const inject = {
  required: ["i18n", "settings", "protocol", "archive", "transfer", "koa"],
  // File routes resolve the instance subsystem lazily to avoid a startup
  // cycle: the instance plugin requires the file service in return.
  optional: ["instances"]
};

export function apply(ctx: DaemonPluginContext) {
  // Before anything else: the modules below read the logger, the configuration,
  // the instances and `$t` through this handle.
  setPluginContext(ctx);
  ctx.i18n.define(localeMessages);

  // `ctx.set()` from inside a plugin belongs to that plugin: the primitives — and
  // with them the daemon's access to instance files — leave when it unloads.
  ctx.set("files", {
    FileManager,
    uploads: uploadManager,
    getFileManager,
    getWindowsDisks
  });

  registerFileEvents();
  registerHttpRoutes();

  // Chunked uploads hold open file handles and lock files, so they are stopped
  // with the plugin. The daemon used to do this from its own shutdown path.
  ctx.on("dispose", () => void uploadManager.exit());
}
