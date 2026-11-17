import type Koa from "koa";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { localeMessages } from "../i18n";
import RemoteRequest, { RemoteRequestTimeoutError } from "./remote_command";
import remoteServices from "./remote_service";
import { setPluginContext } from "./runtime";
import { registerBackgroundTaskRoutes } from "./background_tasks";
import { disposeTaskTickets, sweepTaskTickets, verifyTaskTicket } from "./task_ticket";
import { setTaskStreamSink, visibleTasks } from "./task_stream";

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

export const inject = ["koa", "i18n", "storage", "settings", "middleware", "roles", "operations", "identity", "websocket"];

export async function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  ctx.i18n.define(localeMessages);

  // Finish loading stored nodes before exposing the remote service.
  await remoteServices.initialize();

  const remote = {
    services: remoteServices,
    Request: RemoteRequest,
    RequestTimeoutError: RemoteRequestTimeoutError
  };
  ctx.set("remote", remote);
  // Pass the newly created service directly to avoid a self-dependency.
  registerBackgroundTaskRoutes(ctx, remote);

  ctx.setInterval(() => sweepTaskTickets(), 60_000);
  ctx.on("dispose", () => disposeTaskTickets());

  const anyUnavailable = () =>
    [...remoteServices.services.values()].some((node) => !node.available);

  ctx.websocket.io.use((socket, next) => {
    const identity = verifyTaskTicket(socket.handshake.auth?.ticket);
    if (!identity) return next(new Error("Task stream ticket is invalid or expired"));
    void socket.join(`tasks:${identity.uuid}`);
    next();
  });

  setTaskStreamSink({
    tasks(daemonId, nodeName, data) {
      const registry = ctx.identity.users;
      const tasks = registry
        ? visibleTasks(daemonId, data.tasks, registry.getInstance(data.owner))
        : data.tasks;
      ctx.websocket.io.to(`tasks:${data.owner}`).emit("tasks/update", {
        daemonId,
        nodeName,
        tasks: tasks.map((task) => ({ ...task, daemonId, nodeName })),
        unavailable: anyUnavailable()
      });
    },
    availability() {
      ctx.websocket.io.emit("tasks/availability", { unavailable: anyUnavailable() });
    }
  });
  ctx.effect(() => () => setTaskStreamSink(undefined));

  ctx.effect(() => () => {
    // Suppress logging while closing sockets after scope disposal.
    for (const service of remoteServices.services.values()) service.close();
    remoteServices.services.clear();
  });

  const router = ctx.koa.router("/api/service");
  const operationLogger = ctx.operations;
  const validator = ctx.middleware.validator;
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });

  router.get("/remote_services_list", requireAdmin, async (ctx) => {
    const result = [];
    for (const iterator of remoteServices.services.entries()) {
      result.push(describeNode(iterator[1]));
    }
    ctx.body = result;
  });

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

  router.get("/remote_services", requireAdmin, async (ctx) => {
    const result = [];
    for (const iterator of remoteServices.services.entries()) {
      const remoteService = iterator[1];
      let instancesInfo = [];
      try {
        instancesInfo = await new RemoteRequest(remoteService).request("instance/overview");
      } catch (err) {
      }
      result.push({ ...describeNode(remoteService), instances: instancesInfo });
    }
    ctx.body = result;
  });

  router.post(
    "/remote_service",
    requireAdmin,
    validator({ body: { apiKey: String, port: Number, ip: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const parameter = ctx.request.body;
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

  router.put(
    "/remote_service",
    requireAdmin,
    validator({ query: { uuid: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const uuid = String(ctx.request.query.uuid);
      const parameter = ctx.request.body || {};
      if (!remoteServices.services.has(uuid)) throw new Error("Instance does not exist");

      await remoteServices.edit(uuid, {
        port: parameter.port,
        ip: parameter.ip,
        prefix: parameter.prefix,
        apiKey: parameter.apiKey,
        remarks: parameter.remarks
      });

      operationLogger.log("daemon_config_change", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"],
        daemon_id: uuid
      });

      ctx.body = true;
    }
  );

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
