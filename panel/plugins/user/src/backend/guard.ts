import Koa from "koa";
import type {
  AuthStats,
  GuardedRoute,
  RequestGuard,
  RequestIdentity,
  UserRecords
} from "../../../../src/app/service/request_guard";
import guardRoute from "./middleware/permission";
import { globalVariable, ROLE } from "./runtime";
import {
  BAN_IP_COUNT,
  getUserFromCtx,
  ILLEGAL_ACCESS_KEY,
  LOGIN_COUNT,
  LOGIN_FAILED_COUNT_KEY,
  loginSuccess
} from "./service/passport_service";
import { isHaveInstance, isTopPermission } from "./service/permission_service";
import userSystem from "./service/user_service";

// The complete authorization policy for the panel. The core holds none of it:
// it only asks whichever guard is installed, and serves everything when there
// is none.

const GUEST = 0;

const ANONYMOUS: RequestIdentity = {
  uuid: "",
  userName: "",
  role: GUEST,
  elevated: false
};

function userRecords(): UserRecords {
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

export function createRequestGuard(): RequestGuard {
  return {
    guardRoute: (route: GuardedRoute) => guardRoute(route),

    identify(ctx: Koa.ParameterizedContext): RequestIdentity {
      const user = getUserFromCtx(ctx);
      if (!user) return ANONYMOUS;
      return {
        uuid: user.uuid,
        userName: user.userName,
        role: user.permission === ROLE().ADMIN ? ROLE().ADMIN : ROLE().USER,
        elevated: isTopPermission(user)
      };
    },

    canAccessInstance(ctx, daemonId, instanceUuid) {
      const user = getUserFromCtx(ctx);
      if (!user) return false;
      return isHaveInstance(user, daemonId, instanceUuid);
    },

    // Unrestricted multipart uploads would let any account fill the disk.
    canUpload: (ctx) => getUserFromCtx(ctx)?.permission === ROLE().ADMIN,

    stats(): AuthStats {
      const GlobalVariable = globalVariable();
      return {
        logined: GlobalVariable.get(LOGIN_COUNT, 0),
        illegalAccess: GlobalVariable.get(ILLEGAL_ACCESS_KEY, 0),
        banips: GlobalVariable.get(BAN_IP_COUNT, 0),
        loginFailed: GlobalVariable.get(LOGIN_FAILED_COUNT_KEY, 0)
      };
    },

    accounts: {
      loginSuccess: (ctx, userName) => loginSuccess(ctx, userName)
    },

    users: userRecords()
  };
}
