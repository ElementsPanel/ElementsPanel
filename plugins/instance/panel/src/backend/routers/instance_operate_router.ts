import Router from "@koa/router";
import { isEmpty, toBoolean, toNumber, toText } from "mcsmanager-common";
import { $t, identity, middleware, operations, remote, roles } from "../runtime";
import { checkInstanceAdvancedParams } from "../service/instance_service";
export function createInstanceOperateRouter() {
  const ROLE = roles();
  const permission = middleware().permission;
  const validator = middleware().validator;
  const speedLimit = middleware().speedLimit;
  const instanceAccess = middleware().instanceAccess;
  const guard = identity;
  const operationLogger = operations();
  const remoteRequest = (service: any) => new (remote().Request)(service);
  const remoteSubsystem = () => remote().services;
  const isRemoteRequestTimeout = (error: unknown) => {
    const RequestTimeoutError = remote().RequestTimeoutError;
    return error instanceof RequestTimeoutError;
  };

  const router = new Router({ prefix: "/protected_instance" });

  router.use(instanceAccess);

  router.all(
    "/open",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/open", {
          instanceUuids: [instanceUuid]
        });
        operationLogger.log("instance_start", {
          daemon_id: daemonId,
          instance_id: instanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: result?.instances?.[0]?.nickname
        });
        ctx.body = result;
      } catch (err) {
        if (isRemoteRequestTimeout(err)) {
          ctx.body = {};
          return;
        }
        ctx.body = err;
      }
    }
  );

  router.all(
    "/stop",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/stop", {
          instanceUuids: [instanceUuid]
        });
        operationLogger.log("instance_stop", {
          daemon_id: daemonId,
          instance_id: instanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: result?.instances?.[0]?.nickname
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  // Keep the HTTP command endpoint available for API clients alongside the WebSocket transport.
  router.all(
    "/command",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String, command: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const command = String(ctx.query.command);
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/command", {
          instanceUuid,
          command
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.all(
    "/restart",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/restart", {
          instanceUuids: [instanceUuid]
        });
        operationLogger.log("instance_restart", {
          daemon_id: daemonId,
          instance_id: instanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: result?.instances?.[0]?.nickname
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.all(
    "/kill",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/kill", {
          instanceUuids: [instanceUuid]
        });
        operationLogger.warning("instance_kill", {
          daemon_id: daemonId,
          instance_id: instanceUuid,
          operator_ip: ctx.ip,
          operator_name: guard().identify(ctx).userName,
          instance_name: result?.instances?.[0]?.nickname
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/asynchronous",
    speedLimit(3),
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String, task_name: String },
      body: {}
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const taskName = String(ctx.query.task_name).toLowerCase().trim();
        const parameter = ctx.request.body;

        const needTopPermissionTask = ["quick_install", "minecraft_install"];
        if (needTopPermissionTask.includes(taskName) && !guard().identify(ctx).elevated) {
          throw new Error("illegal access");
        }

        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/asynchronous", {
          instanceUuid,
          taskName,
          parameter,
          role: guard().identify(ctx).role
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.all(
    "/stop_asynchronous",
    permission({ level: ROLE.USER }),
    validator({
      query: { daemonId: String, uuid: String }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const parameter = ctx.request.body;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/stop_asynchronous", {
          instanceUuid,
          parameter
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.all(
    "/query_asynchronous",
    permission({ level: ROLE.USER, speedLimit: false }),
    validator({
      query: { daemonId: String, uuid: String }
    }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const taskName = String(ctx.query.task_name);
        const parameter = ctx.request.body;
        const taskId = parameter.taskId;
        if (!taskId) {
          if (!guard().identify(ctx).elevated) {
            ctx.body = [];
            return;
          }
        }
        const remoteService = remoteSubsystem().getInstance(daemonId);
        ctx.body = await remoteRequest(remoteService).request("instance/query_asynchronous", {
          instanceUuid,
          taskName,
          parameter
        });
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.post(
    "/process_config/list",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const files = ctx.request.body.files;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/process_config/list", {
          instanceUuid,
          files
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.get(
    "/process_config/file",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String, fileName: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const fileName = String(ctx.query.fileName);
        const type = String(ctx.query.type);
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/process_config/file", {
          instanceUuid,
          fileName,
          config: null,
          type
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.put(
    "/process_config/file",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String, fileName: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const fileName = String(ctx.query.fileName);
        const type = String(ctx.query.type);
        const config = ctx.request.body;
        const remoteService = remoteSubsystem().getInstance(daemonId);
        const result = await remoteRequest(remoteService).request("instance/process_config/file", {
          instanceUuid,
          fileName,
          config,
          type
        });
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.put(
    "/instance_update",
    speedLimit(3),
    permission({ level: ROLE.USER }),
    validator({
      query: { uuid: String, daemonId: String },
      body: {}
    }),
    async (ctx) => {
      try {
        // Filter ordinary-user configuration updates to prevent writes to privileged fields.
        const daemonId = toText(ctx.query.daemonId);
        const instanceUuid = toText(ctx.query.uuid);
        const config = ctx.request.body;

        let instanceTags: string[] | null = null;

        if (config.tag instanceof Array && guard().identify(ctx).elevated) {
          instanceTags = (config.tag as any[]).map((tag: any) => {
            const tmp = String(tag).trim();
            if (tmp.length > 20)
              throw new Error(
                $t(
                  "TXT_CODE_COMMON_THE_LABEL_CONTENT_IS_TOO_LONG_PLEASE_REDUCE_THE_NUMBER_OF_CHARACTERS"
                )
              );
            return tmp;
          });
          if (instanceTags.length > 6) {
            throw new Error(
              $t("TXT_CODE_COMMON_SAVING_FAILED_A_SINGLE_INSTANCE_ONLY_SUPPORTS_UP_TO_6_TAGS")
            );
          }
          instanceTags = instanceTags!.sort((a, b) => (a > b ? 1 : -1));
        }

        const rconIp = toText(config.rconIp);
        const rconPort = toNumber(config.rconPort);
        const rconPassword = toText(config.rconPassword);
        const enableRcon = toBoolean(config.enableRcon);

        const pingConfig = {
          ip: toText(config.pingConfig?.ip),
          port: toNumber(config.pingConfig?.port),
          type: config.pingConfig?.type
        };

        const eventTask = {
          autoStart: toBoolean(config.eventTask?.autoStart),
          autoRestart: toBoolean(config.eventTask?.autoRestart),
          autoRestartMaxTimes: toNumber(config.eventTask?.autoRestartMaxTimes)
        };

        const terminalOption = {
          haveColor: toBoolean(config.terminalOption?.haveColor),
          pty: toBoolean(config.terminalOption?.pty),
          ptyWindowCol: toNumber(config.terminalOption?.ptyWindowCol),
          ptyWindowRow: toNumber(config.terminalOption?.ptyWindowRow)
        };

        const extraServiceConfig = {
          openFrpTunnelId: toText(config.extraServiceConfig?.openFrpTunnelId),
          openFrpToken: toText(config.extraServiceConfig?.openFrpToken)
        };

        const crlf = !isEmpty(config.crlf) ? toNumber(config?.crlf) : null;
        const oe = !isEmpty(config.oe) ? toText(config?.oe) : null;
        const ie = !isEmpty(config.ie) ? toText(config?.ie) : null;
        const fileCode = toText(config.fileCode);
        const stopCommand = config.stopCommand ? toText(config.stopCommand) : null;
        const remoteService = remoteSubsystem().getInstance(daemonId || "");
        const isTopPermission = guard().identify(ctx).elevated;

        let advancedConfig = {};
        advancedConfig = checkInstanceAdvancedParams(config, isTopPermission);

        await remoteRequest(remoteService).request("instance/update", {
          instanceUuid,
          config: {
            pingConfig: !isEmpty(config.pingConfig) ? pingConfig : null,
            eventTask: !isEmpty(config.eventTask) ? eventTask : null,
            terminalOption: !isEmpty(config.terminalOption) ? terminalOption : null,
            extraServiceConfig: !isEmpty(config.extraServiceConfig) ? extraServiceConfig : null,
            crlf,
            oe,
            ie,
            stopCommand,
            rconIp,
            rconPort,
            rconPassword,
            enableRcon,
            tag: instanceTags,
            fileCode,
            ...advancedConfig
          }
        });
        ctx.body = true;
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  return router;
}
