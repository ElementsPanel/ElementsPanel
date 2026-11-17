import Router from "@koa/router";
import Koa from "koa";
import { toBoolean } from "mcsmanager-common";
import { v4 } from "uuid";
import { core, $t, ROLE } from "../runtime";
import permission from "../middleware/permission";
import {
  bind2FA,
  confirm2FaQRCode,
  getToken,
  getUserFromCtx,
  getUserUuid,
  isAjax,
  logout
} from "../service/passport_service";
import { getUserByUserName, isTopPermissionByUuid } from "../service/permission_service";
import userSystem from "../service/user_service";
import { getUserProfile } from "../service/user_profile";

export default function createGeneralUserRouter() {
  const validator = core().middleware.validator;
  const router = new Router({ prefix: "/auth" });

  router.get(
    "/token",
    permission({ level: ROLE().USER, token: false, speedLimit: false }),
    async (ctx: Koa.ParameterizedContext) => {
      // Some and only Ajax requests can get the token
      if (isAjax(ctx)) {
        ctx.body = getToken(ctx);
      } else {
        throw new Error("The request is not an Ajax request.");
      }
    }
  );

  router.get(
    "/",
    permission({ level: ROLE().USER, token: false, speedLimit: false }),
    async (ctx) => {
      let uuid = getUserUuid(ctx);
      const advanced = ctx.query.advanced;

      // Admin permissions can be obtained from anyone
      if (isTopPermissionByUuid(uuid) && ctx.query.uuid) uuid = String(ctx.query.uuid);

      // Some and only Ajax requests grant access
      if (isAjax(ctx)) {
        const res = await getUserProfile(core(), uuid, undefined, toBoolean(advanced) || false);
        res.token = getToken(ctx);
        ctx.body = res;
      }
    }
  );

  router.put(
    "/update",
    permission({ level: ROLE().USER }),
    async (ctx: Koa.ParameterizedContext) => {
      const userUuid = getUserUuid(ctx);
      if (userUuid) {
        const config = ctx.request.body;
        const { passWord, isInit } = config;
        if (!userSystem.validatePassword(passWord))
          throw new Error($t("TXT_CODE_ROUTER_USER_PASSWORD_CHECK"));
        await userSystem.edit(userUuid, { passWord, isInit });
        ctx.body = logout(ctx);
      }
    }
  );

  router.put(
    "/api",
    permission({ level: ROLE().USER }),
    validator({ body: { enable: Boolean } }),
    async (ctx: Koa.ParameterizedContext) => {
      const userUuid = getUserUuid(ctx);
      const apiKey = ctx.request.body.enable ? v4().replace(/-/gim, "") : "";
      await userSystem.edit(userUuid, { apiKey });
      ctx.body = apiKey;
    }
  );

  router.post("/bind2fa", permission({ level: 1 }), async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (userUuid) {
      const qrcode = await bind2FA(ctx);
      ctx.body = qrcode;
    }
  });

  router.post(
    "/confirm2fa",
    permission({ level: 1 }),
    validator({ body: { enable: Boolean, TOTPCode: String } }),
    async (ctx: Koa.ParameterizedContext) => {
      const TOTPCode = ctx.request.body.TOTPCode;
      const MFAResult = userSystem.check2FA(TOTPCode, getUserFromCtx(ctx) ?? {}, 0);
      const enable = Boolean(ctx.request.body.enable);
      if (!MFAResult) {
        ctx.throw(400, $t("TXT_CODE_COMMON_TWO_FACTOR_AUTHENTICATION_CODE_IS_INCORRECT"));
      }
      const userUuid = getUserUuid(ctx);
      await confirm2FaQRCode(userUuid, enable);
      ctx.body = true;
    }
  );

  router.get(
    "/query_username",
    permission({ token: false, level: null }),
    validator({
      query: { username: String }
    }),
    async (ctx: Koa.ParameterizedContext) => {
      const userName = String(ctx.request.query.username);
      const user = getUserByUserName(userName);
      if (!user) {
        ctx.body = {
          uuid: null,
          userName: null
        };
      } else {
        ctx.body = {
          uuid: user?.uuid,
          userName: user?.userName
        };
      }
    }
  );

  return router;
}
