import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import RemoteRequest, { RemoteRequestTimeoutError } from "./remote_command";
import remoteServices from "./remote_service";
import { setPluginContext } from "./runtime";

// Panel side of the node plugin. It owns the remote-node subsystem itself — the
// daemon connections, their stored configuration and the request helper — and
// every HTTP route the node management UI talks to.
//
// The subsystem is handed to everyone else as `ctx.remote`, which is why this is
// the one plugin the panel cannot reach a daemon without: the core resolves it
// through `service/remote_access.ts` and every other plugin injects it. It
// therefore loads early, ahead of the plugins that do.

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

export const inject = ["koa", "i18n", "storage", "settings", "middleware", "roles", "operations"];

export async function apply(ctx: PanelPluginContext) {
  // Before anything else: the subsystem's modules read the logger, the storage,
  // the panel configuration and `$t` through this handle, and every string they
  // translate — the connection, authentication and timeout messages — belongs to
  // this plugin, so the catalogue has to be registered before the first log line.
  setPluginContext(ctx);
  ctx.i18n.define(localeMessages);

  // Loads every stored node and starts connecting. Awaited, so `ctx.remote` is
  // never handed over half-initialised.
  await remoteServices.initialize();

  // `ctx.set()` from inside a plugin belongs to that plugin: the subsystem — and
  // with it the panel's ability to reach any daemon — leaves when this plugin
  // unloads. The core reads it through `remoteSubsystem()`, which says so.
  ctx.set("remote", {
    services: remoteServices,
    Request: RemoteRequest,
    RequestTimeoutError: RemoteRequestTimeoutError
  });

  ctx.effect(() => () => {
    // Sockets are not cordis effects, so closing them is this plugin's job.
    for (const service of remoteServices.services.values()) service.disconnect();
  });

  const router = ctx.koa.router("/api/service");
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
