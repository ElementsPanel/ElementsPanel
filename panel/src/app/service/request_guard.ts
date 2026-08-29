import Koa from "koa";
import { ROLE } from "../entity/user";

/**
 * The panel core does not implement authentication. A guard plugin — see
 * `plugins/user` — installs the complete policy at startup; until one does, the
 * panel is simply unguarded and every request is served.
 *
 * Only the shape of a guard and the "no guard installed" null object live here.
 * There is deliberately no core branch anywhere else that asks whether
 * authentication is enabled. Keep this module dependency-free so it can be
 * imported from anywhere.
 */

/** Everything the panel knows about the caller of a request. */
export interface RequestIdentity {
  uuid: string;
  userName: string;
  /** Forwarded to the daemon; the core never compares it itself. */
  role: number;
  /** May bypass instance ownership checks and per-user rate limits. */
  elevated: boolean;
}

/** Declared by a route; interpreted entirely by the guard. */
export interface GuardedRoute {
  token?: boolean;
  level?: number | null;
  speedLimit?: boolean;
}

export interface AuthUserInstanceRef {
  instanceUuid: string;
  daemonId: string;
}

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

/** Account records. Present only while a guard plugin is installed. */
export interface UserRecords {
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

/** Session establishment, needed by the business-mode redeem flow. */
export interface AccountService {
  loginSuccess(ctx: Koa.ParameterizedContext, userName: string): string;
}

export interface AuthStats {
  logined: number;
  illegalAccess: number;
  banips: number;
  loginFailed: number;
}

export interface RequestGuard {
  /** Decides whether a request may reach a route that declared requirements. */
  guardRoute(route: GuardedRoute): Koa.Middleware;
  identify(ctx: Koa.ParameterizedContext): RequestIdentity;
  canAccessInstance(
    ctx: Koa.ParameterizedContext,
    daemonId: string,
    instanceUuid: string
  ): boolean;
  canUpload(ctx: Koa.ParameterizedContext): boolean;
  stats(): AuthStats;
  accounts?: AccountService;
  users?: UserRecords;
}

const ANONYMOUS: RequestIdentity = {
  uuid: "",
  userName: "",
  role: ROLE.ADMIN,
  elevated: true
};

const NO_STATS: AuthStats = { logined: 0, illegalAccess: 0, banips: 0, loginFailed: 0 };

/** What "nobody is guarding this panel" means. Not a policy — the absence of one. */
const UNGUARDED: RequestGuard = {
  guardRoute: () => async (_ctx, next) => await next(),
  identify: () => ANONYMOUS,
  canAccessInstance: () => true,
  canUpload: () => true,
  stats: () => NO_STATS
};

let guard: RequestGuard = UNGUARDED;

export function setRequestGuard(value: RequestGuard) {
  guard = value;
}

export function clearRequestGuard() {
  guard = UNGUARDED;
}

/** Always returns a guard, so call sites never branch on whether one exists. */
export function getRequestGuard(): RequestGuard {
  return guard;
}

/**
 * Declare a hard dependency on a guard capability. Used by the few features
 * that cannot work without real accounts, so they fail loudly instead of
 * silently behaving as if everyone were an administrator.
 */
export function requireGuardFeature<T>(feature: string, value: T | undefined): T {
  if (!value) {
    throw new Error(`${feature} requires a panel plugin that provides user accounts.`);
  }
  return value;
}
