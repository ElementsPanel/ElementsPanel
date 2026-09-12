import type { PanelPluginContext } from "../../../../src/app/plugin";
import type { ModManagerService } from "./mod_manager";
import { checkSafeUrl } from "./url";

export function registerModManagerRoutes(
  ctx: PanelPluginContext,
  modManagerService: ModManagerService
) {
  const router = ctx.koa.router("/api/mod");
  const ROLE = ctx.roles;
  const { permission, validator, speedLimit, requestConcurrencyLimiter } = ctx.middleware;
  const $t = (key: string) => String(ctx.i18n.$t(key));
  const remoteRequest = (daemonId: string) =>
    new ctx.remote.Request(ctx.remote.services.getInstance(daemonId));

  // Permission check middleware
  router.use(async (requestCtx, next) => {
    const instanceUuid = requestCtx.query.uuid || requestCtx.request.body?.uuid;
    const daemonId = requestCtx.query.daemonId || requestCtx.request.body?.daemonId;

    // Check global file manager setting
    if (!ctx.identity.accessPolicy.canFileManager && !ctx.identity.of(requestCtx).elevated) {
      requestCtx.status = 403;
      requestCtx.body = new Error($t("TXT_CODE_router.file.off"));
      return;
    }

    // Check instance access
    if (instanceUuid && daemonId) {
      if (ctx.identity.canAccessInstance(requestCtx, String(daemonId), String(instanceUuid))) {
        await next();
      } else {
        requestCtx.status = 403;
        requestCtx.body = $t("TXT_CODE_permission.forbiddenInstance");
      }
    } else {
      await next();
    }
  });

  router.get(
    "/mc_versions",
    speedLimit(0.5),
    permission({ level: ROLE.USER }),
    async (requestCtx) => {
      try {
        const result = await modManagerService.getMinecraftVersions();
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.get(
    "/list",
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String }
    }),
    async (requestCtx) => {
      try {
        const daemonId = String(requestCtx.query.daemonId);
        const instanceUuid = String(requestCtx.query.uuid);
        const page = Math.max(1, Number(requestCtx.query.page) || 1);
        const pageSize = Math.min(50, Math.max(1, Number(requestCtx.query.pageSize) || 50));
        const folder = requestCtx.query.folder ? String(requestCtx.query.folder) : undefined;
        const remoteService = daemonId;
        const result = await remoteRequest(remoteService).request("instance/mods/list", {
          instanceUuid,
          page,
          pageSize,
          folder: folder || ""
        });
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.get(
    "/info",
    speedLimit(0.5),
    permission({ level: ROLE.USER }),
    validator({
      query: { hash: String }
    }),

    async (requestCtx) => {
      try {
        const hash = String(requestCtx.query.hash);
        const result = await modManagerService.getInfoByHash(hash);
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.get(
    "/search",
    permission({ level: ROLE.USER }),
    requestConcurrencyLimiter("mod_manager:search"),
    async (requestCtx) => {
      try {
        const query = String(requestCtx.query.query || "");
        const offset = Number(requestCtx.query.offset) || 0;
        const limit = Number(requestCtx.query.limit) || 20;
        const source = String(requestCtx.query.source || "all");
        const version = String(requestCtx.query.version || "");
        const type = String(requestCtx.query.type || "all");
        const loader = String(requestCtx.query.loader || "all");
        const environment = String(requestCtx.query.environment || "all");

        if (offset < 0 || offset > 100000) {
          throw new Error("Offset must be between 0 and 100000");
        }
        if (limit < 1 || limit > 50) {
          throw new Error("Limit must be between 1 and 50");
        }

        const result = await modManagerService.searchProjects(query, offset, limit, {
          source,
          version,
          type,
          loader,
          environment
        });
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.get(
    "/versions",
    speedLimit(1),
    permission({ level: ROLE.USER }),
    validator({
      query: { projectId: String, source: String }
    }),
    async (requestCtx) => {
      try {
        const projectId = String(requestCtx.query.projectId);
        const source = String(requestCtx.query.source || "Modrinth");
        const result = await modManagerService.getProjectVersions(projectId, source);
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.post(
    "/download",
    permission({ level: ROLE.USER }),
    speedLimit(5),
    requestConcurrencyLimiter("mod_manager:download"),
    validator({
      body: {
        daemonId: String,
        uuid: String,
        url: String,
        fileName: String,
        projectType: String
      }
    }),
    async (requestCtx) => {
      try {
        const { daemonId, uuid, url, fileName, projectType, fallbackUrl, extraInfo } =
          requestCtx.request.body;

        // Validate URL to prevent SSRF attacks
        if (!checkSafeUrl(url)) {
          requestCtx.status = 400;
          requestCtx.body = new Error("Invalid or unsafe URL");
          return;
        }

        // Validate fallbackUrl if provided
        if (fallbackUrl && !checkSafeUrl(fallbackUrl)) {
          requestCtx.status = 400;
          requestCtx.body = new Error("Invalid or unsafe fallback URL");
          return;
        }

        const remoteService = daemonId;
        const result = await remoteRequest(remoteService).request("instance/mods/install", {
          instanceUuid: uuid,
          url,
          fileName,
          type: projectType,
          fallbackUrl,
          extraInfo
        });
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.post(
    "/stop_transfer",
    speedLimit(1),
    permission({ level: ROLE.USER }),
    validator({
      body: { daemonId: String, uuid: String, fileName: String, type: String }
    }),
    async (requestCtx) => {
      try {
        const { daemonId, uuid, fileName, type, uploadId } = requestCtx.request.body;
        const remoteService = daemonId;
        if (type === "download") {
          const result = await remoteRequest(remoteService).request("file/download_stop", {
            instanceUuid: uuid,
            fileName
          });
          requestCtx.body = result;
        } else {
          // Upload stop is handled by deleting the file or specific upload task
          const result = await remoteRequest(remoteService).request("file/delete", {
            instanceUuid: uuid,
            targets: [fileName]
          });
          requestCtx.body = result;
        }
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.get(
    "/config_files",
    speedLimit(0.5),
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String, modId: String, type: String, fileName: String }
    }),
    async (requestCtx) => {
      try {
        const { daemonId, uuid, modId, type, fileName } = requestCtx.query;
        const remoteService = String(daemonId);
        const result = await remoteRequest(remoteService).request("instance/mods/config_files", {
          instanceUuid: uuid,
          modId,
          type,
          fileName
        });
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.post(
    "/toggle",
    speedLimit(0.5),
    permission({ level: ROLE.USER }),
    validator({
      body: { daemonId: String, uuid: String, fileName: String }
    }),
    async (requestCtx) => {
      try {
        const { daemonId, uuid, fileName } = requestCtx.request.body;
        const remoteService = daemonId;
        const result = await remoteRequest(remoteService).request("instance/mods/toggle", {
          instanceUuid: uuid,
          fileName
        });
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.post(
    "/delete",
    speedLimit(1),
    permission({ level: ROLE.USER }),
    validator({
      body: { daemonId: String, uuid: String, fileName: String }
    }),
    async (requestCtx) => {
      try {
        const { daemonId, uuid, fileName } = requestCtx.request.body;
        const remoteService = daemonId;
        const result = await remoteRequest(remoteService).request("instance/mods/delete", {
          instanceUuid: uuid,
          fileName
        });
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  router.post(
    "/batch_info",
    speedLimit(0.1),
    permission({ level: ROLE.USER }),
    validator({
      body: { hashes: Array }
    }),
    async (requestCtx) => {
      try {
        const hashes = requestCtx.request.body.hashes as string[];
        const result = await modManagerService.getInfosByHashes(hashes);
        requestCtx.body = result;
      } catch (err) {
        requestCtx.body = err;
      }
    }
  );

  return router;
}
