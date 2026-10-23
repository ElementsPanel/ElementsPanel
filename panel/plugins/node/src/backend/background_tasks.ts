import { AsyncLocalStorage } from "async_hooks";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import type RemoteRequest from "./remote_command";
import type remoteServices from "./remote_service";
import { issueTaskTicket } from "./task_ticket";

export const taskRequestScope = new AsyncLocalStorage<Koa.ParameterizedContext>();

export function registerBackgroundTaskRoutes(
  ctx: PanelPluginContext,
  remote: { services: typeof remoteServices; Request: typeof RemoteRequest }
) {
  ctx.koa.use((request, next) => taskRequestScope.run(request, next));
  const router = ctx.koa.router("/api/tasks");
  const permission = ctx.middleware.permission({ level: ctx.roles.USER, speedLimit: false });
  const owner = (request: Koa.ParameterizedContext) =>
    ctx.identity.of(request).uuid || "_anonymous_";

  router.get("/stream-ticket", permission, async (request) => {
    const identity = ctx.identity.of(request);
    request.body = issueTaskTicket({
      uuid: identity.uuid || "_anonymous_",
      elevated: identity.elevated
    });
  });

  router.get("/", permission, async (request) => {
    const tasks: any[] = [];
    const unavailable: string[] = [];
    await Promise.all(
      [...remote.services.services.values()].map(async (node) => {
        if (!node.available) {
          unavailable.push(node.config.remarks || node.uuid);
          return;
        }
        try {
          const rows = await new remote.Request(node).request<any[]>("tasks/list", {
            owner: owner(request)
          });
          for (const task of rows) {
            if (
              task.instanceUuid
                ? !ctx.identity.canAccessInstance(request, node.uuid, task.instanceUuid)
                : !ctx.identity.of(request).elevated
            )
              continue;
            tasks.push({
              ...task,
              daemonId: node.uuid,
              nodeName: node.config.remarks || node.uuid
            });
          }
        } catch {
          unavailable.push(node.config.remarks || node.uuid);
        }
      })
    );
    request.body = {
      tasks: tasks.sort((a, b) => b.startedAt - a.startedAt),
      unavailable: unavailable.length > 0
    };
  });

  router.post(
    "/cancel",
    permission,
    ctx.middleware.validator({
      body: { daemonId: String, id: String }
    }),
    async (request) => {
      const { daemonId, id } = request.request.body;
      const node = remote.services.getInstance(daemonId);
      const rpc = new remote.Request(node);
      const rows = await rpc.request<any[]>("tasks/list", { owner: owner(request) });
      const task = rows.find((task) => task.id === id);
      if (
        !task ||
        (task.instanceUuid
          ? !ctx.identity.canAccessInstance(request, daemonId, task.instanceUuid)
          : !ctx.identity.of(request).elevated)
      ) {
        request.status = 403;
        return;
      }
      request.body = await rpc.request("tasks/cancel", { owner: owner(request), id });
    }
  );

  router.delete("/", permission, async (request) => {
    await Promise.all(
      [...remote.services.services.values()]
        .filter((node) => node.available)
        .map((node) =>
          new remote.Request(node)
            .request("tasks/clear", { owner: owner(request) })
            .catch(() => false)
        )
    );
    request.body = true;
  });
}
