import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";

// Panel side of the node plugin. It owns every HTTP route the node management
// UI talks to; the panel core only keeps the remote service subsystem itself,
// because instance routing, sockets and the overview all depend on it.

interface RemoteServiceLike {
  uuid: string;
  available: boolean;
  config: {
    ip: string;
    port: number;
    prefix: string;
    remarks: string;
    brand?: string;
  };
  connect: () => void;
}

function describeNode(remoteService: RemoteServiceLike) {
  return {
    uuid: remoteService.uuid,
    ip: remoteService.config.ip,
    port: remoteService.config.port,
    prefix: remoteService.config.prefix,
    available: remoteService.available,
    remarks: remoteService.config.remarks,
    brand: remoteService.config.brand
  };
}

export const inject = ["koa", "middleware", "roles", "remote", "operations"];

export function apply(ctx: PanelPluginContext) {
  const router = ctx.koa.router("/api/service");
  const remoteServices = ctx.remote.services;
  const RemoteRequest = ctx.remote.Request;
  const operationLogger = ctx.operations;
  const validator = ctx.middleware.validator;
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });

  // Get the list of remote services.
  // Contains only service information, not a list of instance information.
  router.get("/remote_services_list", requireAdmin, async (ctx) => {
    const result = [];
    for (const iterator of remoteServices.services.entries()) {
      result.push(describeNode(iterator[1]));
    }
    ctx.body = result;
  });

  // Get remote server system information
  router.get("/remote_services_system", requireAdmin, async (ctx) => {
    const result = [];
    for (const iterator of remoteServices.services.entries()) {
      const remoteService = iterator[1];
      let instancesInfo = null;
      try {
        instancesInfo = await new RemoteRequest(remoteService).request("info/overview");
      } catch (err) {
        continue;
      }
      result.push(instancesInfo);
    }
    ctx.body = result;
  });

  // Get remote server instance information (browse too large)
  router.get("/remote_services", requireAdmin, async (ctx) => {
    const result = [];
    for (const iterator of remoteServices.services.entries()) {
      const remoteService = iterator[1];
      let instancesInfo = [];
      try {
        instancesInfo = await new RemoteRequest(remoteService).request("instance/overview");
      } catch (err) {
        // ignore request errors
      }
      // send remote command if connection is available
      result.push({ ...describeNode(remoteService), instances: instancesInfo });
    }
    ctx.body = result;
  });

  // add remote service
  router.post(
    "/remote_service",
    requireAdmin,
    validator({ body: { apiKey: String, port: Number, ip: String, remarks: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const parameter = ctx.request.body;
      // do asynchronous registration
      const instance = await remoteServices.registerRemoteService({
        apiKey: parameter.apiKey,
        port: parameter.port,
        ip: parameter.ip,
        prefix: parameter.prefix ?? "",
        remarks: parameter.remarks ?? ""
      });

      operationLogger.log("daemon_create", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"],
        daemon_id: instance.uuid
      });

      ctx.body = instance.uuid;
    }
  );

  // Modify remote service parameters
  router.put(
    "/remote_service",
    requireAdmin,
    validator({ query: { uuid: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const uuid = String(ctx.request.query.uuid);
      const parameter = ctx.request.body || {};
      const daemonSetting = parameter?.setting || {};
      const daemon = remoteServices.getInstance(uuid);

      if (daemonSetting && daemon?.available) {
        await new RemoteRequest(daemon).request("info/setting", {
          ...daemonSetting,
          port: parameter.daemonPort
        });
      }

      if (!remoteServices.services.has(uuid)) throw new Error("Instance does not exist");

      await remoteServices.edit(uuid, {
        port: parameter.port,
        ip: parameter.ip,
        prefix: parameter.prefix ?? "",
        apiKey: parameter.apiKey,
        remarks: parameter.remarks,
        remoteMappings: parameter.remoteMappings ?? []
      });

      operationLogger.log("daemon_config_change", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"],
        daemon_id: uuid
      });

      ctx.body = true;
    }
  );

  // delete remote service
  router.delete(
    "/remote_service",
    requireAdmin,
    validator({ query: { uuid: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const uuid = String(ctx.request.query.uuid);
      if (!remoteServices.services.has(uuid)) throw new Error("Instance does not exist");
      await remoteServices.deleteRemoteService(uuid);
      operationLogger.log("daemon_remove", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"],
        daemon_id: uuid
      });
      ctx.body = true;
    }
  );

  // connect to remote instance
  router.get(
    "/link_remote_service",
    requireAdmin,
    validator({ query: { uuid: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const uuid = String(ctx.request.query.uuid);
      if (!remoteServices.services.has(uuid)) throw new Error("Instance does not exist");
      try {
        remoteServices.getInstance(uuid)?.connect();
        ctx.body = true;
      } catch (error) {
        ctx.body = error;
      }
    }
  );
}
