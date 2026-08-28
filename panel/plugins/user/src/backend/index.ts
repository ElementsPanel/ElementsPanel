import Router from "@koa/router";
import type {
  PanelAuthProvider,
  AuthUserStore
} from "../../../../src/app/service/auth_provider";
import type { PanelPluginContext } from "../../../../src/app/plugins";
import permission from "./middleware/permission";
import createGeneralUserRouter from "./routers/general_user_router";
import createLoginRouter from "./routers/login_router";
import createManageUserRouter from "./routers/manage_user_router";
import createSsoRouter from "./routers/sso_router";
import createUserOverviewRouter from "./routers/user_overview_router";
import {
  checkBanIp,
  getUserFromCtx,
  getUserNameBySession,
  getUserPermission,
  getUserUuid,
  loginSuccess,
  register
} from "./service/passport_service";
import { isHaveInstanceByUuid, isTopPermissionByUuid } from "./service/permission_service";
import userSystem from "./service/user_service";
import { setPluginContext } from "./runtime";

function createUserStore(): AuthUserStore {
  return {
    size: () => userSystem.objects.size,
    getInstance: (uuid) => userSystem.getInstance(uuid),
    getUserByUserName: (userName) => userSystem.getUserByUserName(userName),
    create: (config) => userSystem.create(config),
    edit: (uuid, config) => userSystem.edit(uuid, config),
    deleteUserInstances: (uuid, instanceIds, allUsers) =>
      userSystem.deleteUserInstances(uuid, instanceIds, allUsers),
    unbindAllSso: () => userSystem.unbindAllSso()
  };
}

export async function setup(context: PanelPluginContext) {
  setPluginContext(context);

  await userSystem.initialize();

  const provider: PanelAuthProvider = {
    permission,
    getUserFromCtx,
    getUserUuid,
    getUserPermission,
    getUserNameBySession,
    isTopPermissionByUuid,
    isHaveInstanceByUuid,
    // The panel still needs its first administrator while no user exists.
    isInstalled: () => userSystem.objects.size > 0,
    loginSuccess,
    register,
    checkBanIp,
    users: createUserStore()
  };

  // From here on the whole panel enforces authentication. Removing this plugin
  // leaves the panel open, which is the documented behaviour.
  context.registerAuthProvider(provider);

  // Nested under a single /api router, in the same order the core used to mount
  // them: several of these share the "/auth/" path and only differ by method,
  // so a flat registration would let one router's allowedMethods() answer 405
  // before the next router got a chance to match.
  const apiRouter = new Router({ prefix: "/api" });
  for (const router of [
    createManageUserRouter(),
    createLoginRouter(),
    createGeneralUserRouter(),
    createUserOverviewRouter(),
    createSsoRouter()
  ]) {
    apiRouter.use(router.routes()).use(router.allowedMethods());
  }
  context.registerRouter(apiRouter);
}
