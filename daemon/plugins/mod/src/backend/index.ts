import type { DaemonPluginContext } from "../../../../src/plugin";
import { ModService } from "./mod_service";

export const inject = ["instances", "protocol", "files", "transfer", "features"];

export function apply(ctx: DaemonPluginContext) {
  const modService = new ModService(ctx);
  const downloads = ctx.transfer.downloads;
  ctx.features.add("modManager");

  // Validate at this boundary as well as in the instance plugin's middleware.
  // These routes must never depend on another plugin's registration order.
  const on = (event: string, handler: Parameters<DaemonPluginContext["protocol"]["on"]>[1]) => {
    ctx.protocol.on(event, (routerCtx, data) => {
      const instanceUuid = data?.instanceUuid;
      if (!ctx.instances.subsystem.exists(instanceUuid)) {
        return ctx.protocol.error(routerCtx, event, {
          instanceUuid,
          err: `The operation failed, the instance ${instanceUuid} does not exist.`
        });
      }
      return handler(routerCtx, data);
    });
  };

  on("instance/mods/list", async (routerCtx, data) => {
    const instanceUuid = data.instanceUuid;
    const page = Number(data.page) || 1;
    const pageSize = Math.min(Number(data.pageSize) || 50, 50); // Max 50
    const folder = data.folder ? String(data.folder) : undefined;
    try {
      const mods = await modService.listMods(instanceUuid, page, pageSize, folder);
      const downloadTasks = [];
      if (downloads.task) {
        downloadTasks.push({
          path: downloads.task.path,
          total: downloads.task.total,
          current: downloads.task.current,
          status: downloads.task.status,
          error: downloads.task.error,
          type: "download"
        });
      }

      const uploadTasks = [];
      for (const [id, writer] of ctx.files.uploads.getUploads()) {
        if (writer.cwd === instanceUuid || writer.path.includes(instanceUuid)) {
          uploadTasks.push({
            id,
            path: writer.path,
            total: writer.size,
            current: writer.received.reduce(
              (acc: number, r: { start: number; end: number }) => acc + (r.end - r.start),
              0
            ),
            status: 0,
            type: "upload"
          });
        }
      }

      ctx.protocol.response(routerCtx, {
        ...mods,
        downloadTasks: [...downloadTasks, ...uploadTasks],
        downloadFileFromURLTask: downloads.downloadingCount
      });
    } catch (err: any) {
      ctx.protocol.responseError(routerCtx, err);
    }
  });

  on("instance/mods/toggle", async (routerCtx, data) => {
    const { instanceUuid, fileName } = data;
    try {
      await modService.toggleMod(instanceUuid, fileName);
      ctx.protocol.response(routerCtx, true);
    } catch (err: any) {
      ctx.protocol.responseError(routerCtx, err);
    }
  });

  on("instance/mods/delete", async (routerCtx, data) => {
    const { instanceUuid, fileName } = data;
    try {
      await modService.deleteMod(instanceUuid, fileName);
      ctx.protocol.response(routerCtx, true);
    } catch (err: any) {
      ctx.protocol.responseError(routerCtx, err, { disablePrint: true });
    }
  });

  on("instance/mods/install", async (routerCtx, data) => {
    const { instanceUuid, url, fileName, type, fallbackUrl } = data;
    try {
      // async
      void modService
        .installMod(instanceUuid, url, fileName, type, {
          fallbackUrl
        })
        .catch((error) => ctx.logger.warn("Mod installation failed:", error));
      ctx.protocol.response(routerCtx, true);
    } catch (err: any) {
      ctx.protocol.responseError(routerCtx, err, { disablePrint: true });
    }
  });

  on("instance/mods/config_files", async (routerCtx, data) => {
    const { instanceUuid, modId, type, fileName } = data;
    try {
      const files = await modService.getModConfig(instanceUuid, modId, type, fileName);
      ctx.protocol.response(routerCtx, files);
    } catch (err: any) {
      ctx.protocol.responseError(routerCtx, err, { disablePrint: true });
    }
  });
}
