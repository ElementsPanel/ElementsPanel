const Router = require("@koa/router");
const { getDesktopLayout, setDesktopLayout } = require("./desktop-layout-service.cjs");

module.exports.setup = function setupDesktopPlugin(context) {
  const router = new Router({ prefix: "/api/overview" });
  const requireUser = context.middleware.permission({ level: context.roles.USER });

  router.get("/desktop_layout", requireUser, async (ctx) => {
    const userUuid = ctx.session?.uuid;
    if (!userUuid) {
      ctx.status = 403;
      ctx.body = "User not logged in";
      return;
    }
    ctx.body = getDesktopLayout(userUuid, context.logger) || { windows: [], updatedAt: 0 };
  });

  router.post("/desktop_layout", requireUser, async (ctx) => {
    const userUuid = ctx.session?.uuid;
    if (!userUuid) {
      ctx.status = 403;
      ctx.body = "User not logged in";
      return;
    }
    setDesktopLayout(userUuid, ctx.request.body, context.logger);
    ctx.body = true;
  });

  context.registerRouter(router);
};
