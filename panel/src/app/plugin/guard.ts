import type Koa from "koa";

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
  ): Promise<void>;
  unbindAllSso(): Promise<number>;
}

/** Session establishment for authentication-backed routes. */
export interface AccountService {
  loginSuccess(ctx: Koa.ParameterizedContext, userName: string): string;
}

export interface AuthStats {
  logined: number;
  illegalAccess: number;
  banips: number;
  loginFailed: number;
}

/** User-facing capabilities decided by the installed authorization policy. */
export interface UserAccessPolicy {
  allowChangeCmd: boolean;
  canFileManager: boolean;
  allowJavaManager: boolean;
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
  accessPolicy(): UserAccessPolicy;
  stats(): AuthStats;
  accounts?: AccountService;
  users?: UserRecords;
}
