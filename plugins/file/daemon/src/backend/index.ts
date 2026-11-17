import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import { localeMessages } from "../i18n";
import { registerFileEvents } from "./file_router";
import { getFileManager, getWindowsDisks } from "./file_service";
import { registerHttpRoutes } from "./http_router";
import { setPluginContext } from "./runtime";
import FileManager from "./system_file";
import uploadManager from "./upload_manager";
import { registerSettings } from "./settings";

// Resolve instances at request time to avoid a startup cycle with the instance plugin.
export const inject = {
  i18n: { required: true },
  settings: { required: true },
  protocol: { required: true },
  archive: { required: true },
  transfer: { required: true },
  koa: { required: true },
  instances: { required: false }
};

export function apply(ctx: DaemonPluginContext) {
  setPluginContext(ctx);
  ctx.i18n.define(localeMessages);
  registerSettings(ctx);

  ctx.set("files", {
    FileManager,
    uploads: uploadManager,
    getFileManager,
    getWindowsDisks
  });

  registerFileEvents();
  registerHttpRoutes();

  // Close upload handles and lock files when the plugin unloads.
  ctx.on("dispose", () => uploadManager.exit());
}
