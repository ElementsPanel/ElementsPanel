import Router from "@koa/router";
import Koa from "koa";
import { core, $t, logger, operationLogger, ROLE } from "../runtime";
import { authSettings } from "../service/auth_settings";
import permission from "../middleware/permission";
import { check, checkBanIp, login, logout } from "../service/passport_service";
import userSystem, { TwoFactorError } from "../service/user_service";

export default function createLoginRouter() {
  const validator = core().middleware.validator;
  const router = new Router({ prefix: "/auth" });

  // [Public Permission]
  // login route
  router.post(
    "/login",
    permission({ token: false, level: null }),
    validator({ body: { username: String, password: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const config = authSettings();
      if (config.ssoEnabled && config.ssoOnlyMode) {
        ctx.body = new Error("Password login is disabled. Please use SSO.");
        return;
      }
      const userName = String(ctx.request.body.username);
      const passWord = String(ctx.request.body.password);
      const code = String(ctx.request.body.code);
      if (!checkBanIp(ctx)) throw new Error($t("TXT_CODE_router.login.ban"));
      if (check(ctx)) return (ctx.body = "Logined");
      try {
        ctx.body = login(ctx, userName, passWord, code);
        operationLogger().info("user_login", {
          operator_ip: ctx.ip,
          operator_name: userName,
          login_result: true
        });
      } catch (error: any) {
        if (error instanceof TwoFactorError && !code) {
          ctx.body = "NEED_2FA";
          return;
        }
        ctx.body = error;
        operationLogger().warning("user_login", {
          operator_ip: ctx.ip,
          operator_name: userName,
          login_result: false
        });
      }
    }
  );

  // [Public Permission]
  // exit route
  router.get(
    "/logout",
    permission({ token: false, level: null, speedLimit: false }),
    async (ctx: Koa.ParameterizedContext) => {
      logout(ctx);
      ctx.body = true;
    }
  );

  // [Public Permission]
  // Display the text of the login interface
  router.all(
    "/login_info",
    permission({ token: false, level: null, speedLimit: false }),
    async (ctx: Koa.ParameterizedContext) => {
      ctx.body = {
        loginInfo: authSettings().loginInfo
      };
    }
  );

  // [Public Permission]
  // Install the panel, only available when the number of user entities is 0
  router.all(
    "/install",
    permission({ token: false, level: null }),
    validator({ body: { username: String, password: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const userName = String(ctx.request.body.username);
      const passWord = String(ctx.request.body.password);
      if (userSystem.objects.size === 0) {
        if (!userSystem.validatePassword(passWord))
          throw new Error($t("TXT_CODE_router.user.passwordCheck"));
        logger().info($t("TXT_CODE_router.login.init", { userName }));
        await userSystem.create({
          userName,
          passWord,
          permission: ROLE().ADMIN
        });
        operationLogger().log("user_create", {
          operator_ip: ctx.ip,
          operator_name: userName,
          target_user_name: userName
        });
        login(ctx, userName, passWord);
        return (ctx.body = true);
      }
      throw new Error($t("TXT_CODE_router.user.installed"));
    }
  );

  return router;
}
