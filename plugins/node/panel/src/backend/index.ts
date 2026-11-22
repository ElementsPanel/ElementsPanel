import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { localeMessages } from "../i18n";
import RemoteRequest, { RemoteRequestTimeoutError } from "./remote_command";
import remoteServices from "./remote_service";
import { registerNodeRoutes } from "./routers/nodes";
import { setPluginContext } from "./runtime";
import { registerBackgroundTaskRoutes } from "./background_tasks";
import { disposeTaskTickets, sweepTaskTickets, verifyTaskTicket } from "./task_ticket";
import { setTaskStreamSink, visibleTasks } from "./task_stream";

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settings",
  "middleware",
  "roles",
  "operations",
  "identity",
  "websocket"
];

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  setPluginContext(ctx);

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

  registerNodeRoutes(ctx);
}
