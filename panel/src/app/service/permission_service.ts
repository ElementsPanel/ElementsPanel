import { getPanelAuthProvider, type AuthUser } from "./auth_provider";

// Instance ownership checks. The lookups delegate to the "user" plugin; without
// it the panel is unauthenticated, so every caller is an anonymous
// administrator and owns everything.

export function isTopPermission(user: AuthUser) {
  if (!user) return false;
  return user.permission >= 10;
}

export function isHaveInstance(user: AuthUser, daemonId: string, instanceUuid: string) {
  if (isTopPermission(user)) return true;
  if (user && user.instances) {
    for (const v of user.instances) {
      if (daemonId === v.daemonId && instanceUuid === v.instanceUuid) return true;
    }
  }
  return false;
}

export function isTopPermissionByUuid(uuid: string) {
  const provider = getPanelAuthProvider();
  if (!provider) return true;
  return provider.isTopPermissionByUuid(uuid);
}

export function isHaveInstanceByUuid(uuid: string, daemonId: string, instanceUuid: string) {
  const provider = getPanelAuthProvider();
  if (!provider) return true;
  return provider.isHaveInstanceByUuid(uuid, daemonId, instanceUuid);
}

export function getUserByUserName(userName: string) {
  return getPanelAuthProvider()?.users.getUserByUserName(userName);
}
