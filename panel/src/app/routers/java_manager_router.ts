import Router from "@koa/router";
import { ROLE } from "../entity/user";
import permission from "../middleware/permission";
import { getRequestGuard as guard } from "../service/request_guard";

const router = new Router({ prefix: "/java_manager" });

import { $t } from "../i18n";
import { speedLimit } from "../middleware/limit";
import validator from "../middleware/validator";
import { remoteRequest, remoteSubsystem } from "../service/remote_access";

router.use(async (ctx, next) => {
  const daemonId = String(ctx.query.daemonId);
  const instanceId = String(ctx.query.instanceId);
  if (guard().canAccessInstance(ctx, daemonId, instanceId)) {
    await next();
  } else {
    throw new Error($t("TXT_CODE_eb401a37"));
  }
});

router.get(
  "/list",
  permission({ level: ROLE.USER }),
  validator({ query: { daemonId: String, instanceId: String } }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = remoteSubsystem().getInstance(daemonId);
    const response = await remoteRequest(remoteService).request("java_manager/list");
    ctx.body = response;
  }
);

router.post(
  "/add",
  speedLimit(3),
  permission({ level: ROLE.ADMIN }),
  validator({
    query: {
      daemonId: String
    },
    body: {
      name: String,
      path: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = remoteSubsystem().getInstance(daemonId);
    const response = await remoteRequest(remoteService).request("java_manager/add", {
      name: ctx.request.body.name,
      path: ctx.request.body.path
    });
    ctx.body = response;
  }
);

router.post(
  "/download",
  speedLimit(3),
  permission({ level: ROLE.ADMIN }),
  validator({
    query: {
      daemonId: String,
      instanceId: String
    },
    body: {
      name: String,
      version: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = remoteSubsystem().getInstance(daemonId);
    const response = await remoteRequest(remoteService).request("java_manager/download", {
      name: ctx.request.body.name,
      version: ctx.request.body.version
    });
    ctx.body = response;
  }
);

router.post(
  "/using",
  permission({ level: ROLE.USER }),
  validator({
    query: {
      daemonId: String,
      instanceId: String
    },
    body: {
      id: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = remoteSubsystem().getInstance(daemonId);

    const response = await remoteRequest(remoteService).request("java_manager/using", {
      instanceId: ctx.query.instanceId,
      id: ctx.request.body.id
    });
    ctx.body = response;
  }
);

router.delete(
  "/delete",
  permission({ level: ROLE.ADMIN }),
  validator({
    query: {
      daemonId: String
    },
    body: {
      id: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = remoteSubsystem().getInstance(daemonId);

    const response = await remoteRequest(remoteService).request("java_manager/delete", {
      id: ctx.request.body.id
    });
    ctx.body = response;
  }
);

export default router;
