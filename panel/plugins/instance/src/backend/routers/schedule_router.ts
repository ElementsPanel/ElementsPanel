import Router from "@koa/router";
import { $t, FILENAME_BLACKLIST, identity, middleware, operations, remote, roles } from "../runtime";
export function createScheduleRouter() {
  const router = new Router({ prefix: "/protected_schedule" });
  const ROLE = roles();
  const permission = middleware().permission;
  const validator = middleware().validator;
  const guard = identity;
  const operationLogger = operations();
  const remoteRequest = (service: any) => new (remote().Request)(service);
  const remoteSubsystem = () => remote().services;

// Routing permission verification middleware
router.use(async (ctx, next) => {
  const instanceUuid = String(ctx.query.uuid);
  const daemonId = String(ctx.query.daemonId);
  if (guard().canAccessInstance(ctx, daemonId, instanceUuid)) {
    await next();
  } else {
    ctx.status = 403;
    ctx.body = $t("TXT_CODE_permission.forbiddenInstance");
  }
});

// [Low-level Permission]
// Get the list of scheduled tasks
router.get(
  "/",
  permission({ level: ROLE.USER }),
  validator({ query: { daemonId: String, uuid: String } }),
  async (ctx) => {
    try {
      const daemonId = String(ctx.query.daemonId);
      const instanceUuid = String(ctx.query.uuid);
      const list = await remoteRequest(remoteSubsystem().getInstance(daemonId)).request(
        "schedule/list",
        {
          instanceUuid
        }
      );
      ctx.body = list;
    } catch (err) {
      ctx.body = err;
    }
  }
);

// [Low-level Permission]
// create a scheduled task
router.post(
  "/",
  permission({ level: ROLE.USER }),
  validator({
    query: { daemonId: String, uuid: String },
    body: { name: String, count: Number, time: String, actions: Array, type: Number }
  }),
  async (ctx) => {
    try {
      const daemonId = String(ctx.query.daemonId);
      const instanceUuid = String(ctx.query.uuid);
      const task = ctx.request.body;

      // Scheduled task name needs file name format check
      const name = String(task.name);
      FILENAME_BLACKLIST.forEach((ch) => {
        if (name.includes(ch)) throw new Error($t("TXT_CODE_router.schedule.invalidName"));
      });

      operationLogger.log("instance_task_create", {
        operator_ip: ctx.ip,
        operator_name: guard().identify(ctx).userName,
        instance_id: instanceUuid,
        daemon_id: daemonId,
        task_name: name
      });

      ctx.body = await remoteRequest(remoteSubsystem().getInstance(daemonId)).request(
        "schedule/register",
        {
          instanceUuid,
          name,
          count: Number(task.count),
          time: String(task.time),
          actions: task.actions,
          type: Number(task.type)
        }
      );
    } catch (err) {
      ctx.body = err;
    }
  }
);

// [Low-level Permission]
// delete scheduled task
router.delete(
  "/",
  permission({ level: ROLE.USER }),
  validator({ query: { daemonId: String, uuid: String } }),
  async (ctx) => {
    try {
      const daemonId = String(ctx.query.daemonId);
      const instanceUuid = String(ctx.query.uuid);
      const name = String(ctx.query.task_name);

      operationLogger.log("instance_task_delete", {
        operator_ip: ctx.ip,
        operator_name: guard().identify(ctx).userName,
        instance_id: instanceUuid,
        daemon_id: daemonId,
        task_name: name
      });

      ctx.body = await remoteRequest(remoteSubsystem().getInstance(daemonId)).request(
        "schedule/delete",
        {
          instanceUuid,
          name
        }
      );
    } catch (err) {
      ctx.body = err;
    }
  }
);

  return router;
}
