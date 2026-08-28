import Router from "@koa/router";
import Koa from "koa";
import { core, $t, operationLogger, ROLE } from "../runtime";
import permission from "../middleware/permission";
import { register } from "../service/passport_service";
import userSystem from "../service/user_service";

export default function createManageUserRouter() {
  const validator = core().middleware.validator;
  const router = new Router({ prefix: "/auth" });

  // Add user
  router.post(
    "/",
    permission({ level: ROLE().ADMIN }),
    validator({ body: { username: String, password: String, permission: Number } }),
    async (ctx: Koa.ParameterizedContext) => {
      const userName = String(ctx.request.body.username);
      const passWord = String(ctx.request.body.password);
      const userPermission = Number(ctx.request.body.permission);
      if (!userSystem.validatePassword(passWord))
        throw new Error($t("TXT_CODE_router.user.invalidPassword"));
      if (userSystem.existUserName(userName))
        throw new Error($t("TXT_CODE_router.user.existsUserName"));
      operationLogger().log("user_create", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"],
        target_user_name: userName
      });
      ctx.body = await register(ctx, userName, passWord, userPermission);
    }
  );

  // Delete user
  router.del("/", permission({ level: ROLE().ADMIN }), async (ctx: Koa.ParameterizedContext) => {
    const uuids = ctx.request.body;
    try {
      for (const iterator of uuids) {
        const user = userSystem.getUserByUuid(iterator);
        operationLogger().log(
          "user_delete",
          {
            operator_ip: ctx.ip,
            operator_name: ctx.session?.["userName"],
            target_user_name: user?.userName || "Unknown"
          },
          "warning"
        );
        await userSystem.deleteInstance(iterator);
      }
      ctx.body = true;
    } catch (error: any) {
      ctx.throw(500, $t("TXT_CODE_router.user.deleteFailure") as string);
    }
  });

  // User search function
  router.get(
    "/search",
    permission({ level: ROLE().ADMIN }),
    validator({ query: { page: Number, page_size: Number } }),
    async (ctx: Koa.ParameterizedContext) => {
      // Fix parameter parsing - check if parameters exist before converting
      const userName = ctx.query.userName ? String(ctx.query.userName) : "";
      const role = ctx.query.role ? String(ctx.query.role) : "";
      const page = Math.max(1, Number(ctx.query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));

      const condition: any = {};
      if (userName && userName !== "undefined") condition["userName"] = `%${userName}%`;
      if (role && role !== "undefined" && role !== "null") condition["permission"] = Number(role);
      let resultPage = userSystem.getQueryWrapper().selectPage(condition, page, pageSize);
      // make a copy, delete redundant
      resultPage = JSON.parse(JSON.stringify(resultPage));
      resultPage.data.forEach((v) => {
        v.passWord = "";
        v.salt = "";
      });
      ctx.body = resultPage;
    }
  );

  return router;
}
