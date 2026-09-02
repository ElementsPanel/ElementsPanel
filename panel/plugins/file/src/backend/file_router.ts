import { v4 } from "uuid";
import {
  $t,
  identity,
  koa,
  middleware,
  operations,
  remote,
  roles
} from "./runtime";

/** The upload/download passport key. Its own copy of the core's `timeUuid`. */
function timeUuid() {
  return v4().replace(/-/gim, "") + new Date().getTime();
}

/**
 * Every route the file manager UI talks to, all under `/api/files`.
 *
 * Registered from `apply()`, so the whole surface — the gate included — leaves
 * with the plugin.
 */
export function registerFileRoutes() {
  const router = koa().router("/api/files");
  const permission = middleware().permission;
  const validator = middleware().validator;
  const ROLE = roles();

  // The user plugin decides whether ordinary users may open the file manager;
  // the same guard also decides who may reach a particular instance.
  router.use(async (ctx, next) => {
    if (!identity().accessPolicy.canFileManager && !identity().of(ctx).elevated) {
      ctx.status = 403;
      ctx.body = new Error($t("TXT_CODE_router.file.off"));
      return;
    }
    await next();
  });
  router.use(middleware().instanceAccess);

  router.get(
    "/status",
    permission({ level: ROLE.USER, speedLimit: false }),
    validator({
      query: { daemonId: String, uuid: String }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/status", {
          instanceUuid
        });
        if (!identity().of(ctx).elevated) delete result.disk;
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.get(
    "/list",
    permission({ level: ROLE.USER, speedLimit: false }),
    validator({
      query: { daemonId: String, uuid: String, target: String, page: Number, page_size: Number }
    }),
    async (ctx) => {
      try {
        const target = String(ctx.query.target);
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const page = Math.max(0, Number(ctx.query.page) || 0);
        const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
        const fileName = String(ctx.query.file_name);
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/list", {
          instanceUuid,
          target,
          pageSize,
          page,
          fileName
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.get(
    "/preview",
    permission({ level: ROLE.USER, speedLimit: false }),
    validator({
      query: { daemonId: String, uuid: String, target: String, code: String }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const target = String(ctx.query.target);
        const code = String(ctx.query.code || "utf-8");
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/preview", {
          instanceUuid,
          target,
          code
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.put(
    "/chmod",
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String },
      body: { target: String, chmod: Number, deep: Boolean }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const target = String(ctx.request.body.target);
        const chmod = Number(ctx.request.body.chmod);
        const deep = Boolean(ctx.request.body.deep);
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/chmod", {
          target,
          instanceUuid,
          chmod,
          deep
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.put(
    "/chmod_batch",
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String },
      body: { targets: Array, chmod: Number, deep: Boolean }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const targets = (ctx.request.body.targets as string[]).map((target) => String(target));
        const chmod = Number(ctx.request.body.chmod);
        const deep = Boolean(ctx.request.body.deep);
        const remoteService = remote().services.getInstance(daemonId);
        const timeout = Math.min(5 * 60 * 1000, Math.max(15 * 1000, targets.length * 2 * 1000));
        const result = await new (remote().Request)(remoteService).request("file/chmod_batch", {
          targets,
          instanceUuid,
          chmod,
          deep
        }, timeout);
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/touch",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String }, body: { target: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const target = String(ctx.request.body.target);
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/touch", {
          target,
          instanceUuid
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/mkdir",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String }, body: { target: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const target = String(ctx.request.body.target);
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/mkdir", {
          target,
          instanceUuid
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.put(
    "/",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String }, body: { target: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const target = String(ctx.request.body.target);
        const text = ctx.request.body.text;
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request(
          "file/edit",
          {
            instanceUuid,
            target,
            text
          },
          100000
        );
        operations().log("instance_file_update", {
          operator_ip: ctx.ip,
          operator_name: identity().of(ctx).userName,
          instance_id: instanceUuid,
          daemon_id: daemonId,
          file: target
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/copy",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String }, body: { targets: Array } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const targets = ctx.request.body.targets as [];
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/copy", {
          instanceUuid,
          targets
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/download_from_url",
    permission({ level: ROLE.USER }),
    validator({
      query: { uuid: String, daemonId: String },
      body: { url: String, file_name: String }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const url = String(ctx.request.body.url);
        const fileName = String(ctx.request.body.file_name);

        const remoteService = remote().services.getInstance(daemonId);
        if (!remoteService) throw new Error($t("TXT_CODE_dd559000") + ` Daemon ID: ${daemonId}`);

        const downloadId = timeUuid();
        ctx.body = downloadId;

        operations().log("instance_file_download_from_url", {
          operator_ip: ctx.ip,
          operator_name: identity().of(ctx).userName,
          instance_id: instanceUuid,
          daemon_id: daemonId,
          url: url,
          fileName: fileName
        });

        await new (remote().Request)(remoteService).request("file/download_from_url", {
          url,
          fileName,
          instanceUuid
        });
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.put(
    "/move",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String }, body: { targets: Array } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const targets = ctx.request.body.targets as [];
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/move", {
          instanceUuid,
          targets
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.delete(
    "/",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String }, body: { targets: Object } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = ctx.query.uuid;
        const targets = ctx.request.body.targets;
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("file/delete", {
          instanceUuid,
          targets
        });
        operations().log("instance_file_delete", {
          operator_ip: ctx.ip,
          operator_name: identity().of(ctx).userName,
          instance_id: String(instanceUuid),
          daemon_id: daemonId,
          file: targets
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/compress",
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String },
      body: { source: String, targets: Object, type: Number, code: String }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const source = String(ctx.request.body.source);
        const targets = ctx.request.body.targets;
        const type = Number(ctx.request.body.type);
        const code = String(ctx.request.body.code);
        const remoteService = remote().services.getInstance(daemonId);
        const res = await new (remote().Request)(remoteService).request(
          "file/compress",
          {
            instanceUuid,
            targets,
            source,
            type,
            code
          },
          0
        );
        ctx.body = res;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.all(
    "/download",
    permission({ level: ROLE.USER }),
    validator({ query: { uuid: String, daemonId: String, file_name: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const fileName = String(ctx.query.file_name);
        const remoteService = remote().services.getInstance(daemonId);
        if (!remoteService) throw new Error($t("TXT_CODE_dd559000") + ` Daemon ID: ${daemonId}`);
        const addr = remoteService.config.fullAddr;
        const remoteMappings = remoteService.config.getConvertedRemoteMappings();
        const password = timeUuid();
        await new (remote().Request)(remoteService).request("passport/register", {
          name: "download",
          password: password,
          parameter: {
            fileName,
            instanceUuid
          }
        });
        operations().log("instance_file_download", {
          operator_ip: ctx.ip,
          operator_name: identity().of(ctx).userName,
          instance_id: instanceUuid,
          daemon_id: daemonId,
          file: fileName
        });
        ctx.body = {
          password,
          addr,
          remoteMappings
        };
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.all(
    "/upload",
    permission({ level: ROLE.USER }),
    validator({ query: { uuid: String, daemonId: String, upload_dir: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const uploadDir = String(ctx.query.upload_dir);
        const remoteService = remote().services.getInstance(daemonId);
        if (!remoteService) throw new Error($t("TXT_CODE_dd559000") + ` Daemon ID: ${daemonId}`);
        const addr = remoteService.config.fullAddr;
        const remoteMappings = remoteService.config.getConvertedRemoteMappings();
        const password = timeUuid();
        await new (remote().Request)(remoteService).request("passport/register", {
          name: "upload",
          password: password,
          parameter: {
            uploadDir,
            instanceUuid
          }
        });
        operations().log("instance_file_upload", {
          operator_ip: ctx.ip,
          operator_name: identity().of(ctx).userName,
          instance_id: instanceUuid,
          daemon_id: daemonId
        });
        ctx.body = {
          password,
          addr,
          remoteMappings
        };
      } catch (err) {
        ctx.body = err;
      }
    }
  );
}
