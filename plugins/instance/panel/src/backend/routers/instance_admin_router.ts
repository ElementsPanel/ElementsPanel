import Router from "@koa/router";
import axios from "axios";
import { $t, identity, middleware, operations, remote, roles } from "../runtime";
import { multiOperationForwarding } from "../service/instance_service";
import { timeUuid } from "../runtime";

export function createInstanceAdminRouter() {
  const router = new Router({ prefix: "/instance" });
  const ROLE = roles();
  const permission = middleware().permission;
  const validator = middleware().validator;
  const guard = identity;
  const operationLogger = operations();
  const remoteRequest = (service: any) => new (remote().Request)(service);
  const remoteSubsystem = () => remote().services;

  // [Low-level Permission]
  // Get the details of an instance
  router.get(
    "/",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        if (!guard().canAccessInstance(ctx, daemonId, instanceUuid))
          throw new Error($t("TXT_CODE_permission.forbidden"));
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/detail", {
          instanceUuid
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  // [Top-level Permission]
  // create instance
  router.post(
    "/",
    permission({ level: ROLE.ADMIN }),
    validator({ query: { daemonId: String } }),

    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const config = ctx.request.body;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/new", config);
        ctx.body = result;
        operationLogger.log("instance_create", {
          daemon_id: daemonId,
          instance_id: result.instanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: result.nickname
        });
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  // [Top-level Permission]
  // upload the file when creating the instance
  router.post(
    "/upload",
    permission({ level: ROLE.ADMIN }),
    validator({ query: { daemonId: String, upload_dir: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        // const uploadDir = String(ctx.query.upload_dir);
        const config = ctx.request.body;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        if (!remoteService) throw new Error($t("TXT_CODE_dd559000") + ` Daemon ID: ${daemonId}`);
        const result = await remoteRequest(remoteService).request("instance/new", config);
        const newInstanceUuid = result.instanceUuid;
        if (!newInstanceUuid) throw new Error($t("TXT_CODE_router.instance.createError"));
        operationLogger.log("instance_create", {
          daemon_id: daemonId,
          instance_id: newInstanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: result.nickname
        });
        // Send a cross-end file upload task to the daemon
        const addr = remoteService.config.fullAddr;
        const remoteMappings = remoteService.config.getConvertedRemoteMappings();
        const password = timeUuid();
        await remoteRequest(remoteService).request("passport/register", {
          name: "upload",
          password: password,
          parameter: {
            uploadDir: ".",
            instanceUuid: newInstanceUuid
          }
        });
        ctx.body = {
          instanceUuid: newInstanceUuid,
          password,
          addr,
          remoteMappings
        };
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  // [Top-level Permission]
  // Update instance information (manage users)
  router.put(
    "/",
    permission({ level: ROLE.ADMIN }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const config = ctx.request.body;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/update", {
          instanceUuid,
          config
        });
        operationLogger.log("instance_config_change", {
          daemon_id: daemonId,
          instance_id: instanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: config.nickname
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  // [Top-level Permission]
  // delete instance
  router.delete(
    "/",
    permission({ level: ROLE.ADMIN }),
    validator({ query: { daemonId: String }, body: { uuids: Array, deleteFile: Boolean } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuids = ctx.request.body.uuids;
        const deleteFile = ctx.request.body.deleteFile;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        if (!instanceUuids || !Array.isArray(instanceUuids))
          throw new Error("Type error, invalid uuids or daemonId");
        const result = await remoteRequest(remoteService).request("instance/delete", {
          instanceUuids,
          deleteFile
        });
        const instanceIds = result.instances.map((instance: { instanceUuid: string }) => ({
          instanceUuid: instance.instanceUuid,
          daemonId
        }));
        await guard().users?.deleteUserInstances(null, instanceIds, true);
        result.instances.forEach((e: { instanceUuid: string; nickname: string }) => {
          operationLogger.log(
            "instance_delete",
            {
              daemon_id: daemonId,
              instance_id: e.instanceUuid,
              operator_ip: ctx.ip,
              operator_name: guard().identify(ctx).userName,
              instance_name: e.nickname
            },
            "error"
          );
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  // Batch routes share authorization, forwarding, failure handling and logging.
  for (const [operation, logType] of [
    ["open", "instance_start"],
    ["stop", "instance_stop"],
    ["kill", "instance_kill"],
    ["restart", "instance_restart"]
  ] as const) {
    router.post(`/multi_${operation}`, permission({ level: ROLE.ADMIN }), async (ctx) => {
      await multiOperationForwarding(ctx.request.body, async (daemonId, instanceUuids) => {
        // Older daemons reply once per instance using the same request ID. Give
        // each instance its own request so a first success cannot hide later failures.
        const results = await Promise.all(
          instanceUuids.map(async (instanceUuid) => {
            try {
              const result = await remoteRequest(remoteSubsystem().getInstance(daemonId)).request(
                `instance/${operation}`,
                { instanceUuids: [instanceUuid] }
              );
              const instance = result.instances?.find(
                (item: { instanceUuid: string }) => item.instanceUuid === instanceUuid
              );
              operationLogger.log(
                logType,
                {
                  daemon_id: daemonId,
                  instance_id: instanceUuid,
                  operator_ip: ctx.ip,
                  operator_name: guard().identify(ctx).userName,
                  instance_name: instance?.nickname ?? instanceUuid
                },
                operation === "kill" ? "warning" : "info"
              );
              return undefined;
            } catch (error) {
              return `${daemonId}/${instanceUuid}: ${
                error instanceof Error ? error.message : String(error)
              }`;
            }
          })
        );
        const failures = results.filter((result): result is string => result !== undefined);
        if (failures.length) throw new Error(failures.join("\n"));
      });
      ctx.body = true;
    });
  }

  // [Top-level Permission]
  // forward request
  router.all(
    "/forward",
    permission({ level: ROLE.ADMIN }),
    validator({ query: { target: String } }),
    async (ctx) => {
      const ADDR = String(ctx.query.target);
      try {
        const response = await axios.request({
          method: ctx.request.method,
          url: ADDR,
          data: ctx.request.body
        });
        if (response.status !== 200) throw new Error("Response code != 200");
        ctx.body = response.data;
      } catch (err) {
        ctx.body = [];
      }
    }
  );

  return router;
}
