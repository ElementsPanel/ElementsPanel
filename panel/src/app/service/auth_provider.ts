import Koa from "koa";

/**
 * Authentication is owned by the "user" panel plugin. The panel core only keeps
 * this registry plus the delegating shims in `middleware/permission.ts`,
 * `service/permission_service.ts` and `service/passport_service.ts`.
 *
 * When no provider is registered the panel runs unauthenticated: every request
 * is treated as an anonymous administrator and no login is required. Keep this
 * module dependency-free so it can be imported from anywhere without dragging
 * the user subsystem into the import graph.
 */

export interface IPermissionCfg {
  token?: boolean;
  level?: number | null;
  speedLimit?: boolean;
}

export interface AuthUserInstanceRef {
  instanceUuid: string;
  daemonId: string;
}

/** The subset of a user record the panel core needs to know about. */
export interface AuthUser {
  uuid: string;
  userName: string;
  permission: number;
  instances: AuthUserInstanceRef[];
  // Profile fields echoed back by `service/instance_service.getInstancesByUuid`.
  loginTime?: string;
  registerTime?: string;
  apiKey?: string;
  isInit?: boolean;
  open2FA?: boolean;
  secret?: string;
}

export interface AuthUserStore {
  size(): number;
  getInstance(uuid: string): AuthUser | undefined;
  getUserByUserName(userName: string): AuthUser | null;
  create(config: Record<string, unknown>): Promise<AuthUser>;
  edit(uuid: string, config: Record<string, unknown>): Promise<void>;
  deleteUserInstances(
    uuid: string | null,
    instanceIds: AuthUserInstanceRef[],
    allUsers?: boolean
  ): void;
  unbindAllSso(): Promise<number>;
}

export interface PanelAuthProvider {
  permission(cfg: IPermissionCfg): Koa.Middleware;
  getUserFromCtx(ctx: Koa.ParameterizedContext): AuthUser | undefined;
  getUserUuid(ctx: Koa.ParameterizedContext): string;
  getUserPermission(ctx: Koa.ParameterizedContext): number;
  getUserNameBySession(ctx: Koa.ParameterizedContext): string;
  isTopPermissionByUuid(uuid: string): boolean;
  isHaveInstanceByUuid(uuid: string, daemonId: string, instanceUuid: string): boolean;
  /** False only while the panel still needs its first administrator. */
  isInstalled(): boolean;
  loginSuccess(ctx: Koa.ParameterizedContext, userName: string): string;
  register(
    ctx: Koa.ParameterizedContext,
    userName: string,
    passWord: string,
    permission: number
  ): Promise<{ uuid: string; userName: string; permission: number } | false>;
  checkBanIp(ctx: Koa.ParameterizedContext): boolean;
  users: AuthUserStore;
}

let provider: PanelAuthProvider | undefined;

export function setPanelAuthProvider(value: PanelAuthProvider) {
  provider = value;
}

export function clearPanelAuthProvider() {
  provider = undefined;
}

export function getPanelAuthProvider(): PanelAuthProvider | undefined {
  return provider;
}

export function isAuthEnabled(): boolean {
  return provider != null;
}

/**
 * Throw from features that cannot degrade to anonymous access, such as the
 * business-mode redeem flow which has to create real accounts.
 */
export function requireAuthProvider(feature: string): PanelAuthProvider {
  if (!provider) {
    throw new Error(`${feature} requires the "user" panel plugin, which is not installed.`);
  }
  return provider;
}
