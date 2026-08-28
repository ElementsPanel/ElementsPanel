import Koa from "koa";
import { ROLE } from "../entity/user";
import { getPanelAuthProvider, requireAuthProvider, type AuthUser } from "./auth_provider";

// Session/identity readers used across the panel core. The implementations live
// in the "user" plugin; the fallbacks below describe an unauthenticated panel,
// where every caller is an anonymous administrator.
//
// The counter keys stay here because `routers/overview_router.ts` reports them
// while the plugin is the one incrementing them (through `context.common`).

export const BAN_IP_COUNT = "banip";
export const LOGIN_FAILED_KEY = "loginFailed";
export const ILLEGAL_ACCESS_KEY = "illegalAccess";
export const LOGIN_COUNT = "loginCount";
export const LOGIN_FAILED_COUNT_KEY = "loginFailedCount";

export function getUserFromCtx(ctx: Koa.ParameterizedContext): AuthUser | undefined {
  return getPanelAuthProvider()?.getUserFromCtx(ctx);
}

export function getUserUuid(ctx: Koa.ParameterizedContext): string {
  return getPanelAuthProvider()?.getUserUuid(ctx) ?? "";
}

export function getUserPermission(ctx: Koa.ParameterizedContext): number {
  return getPanelAuthProvider()?.getUserPermission(ctx) ?? ROLE.ADMIN;
}

export function getUserNameBySession(ctx: Koa.ParameterizedContext): string {
  return getPanelAuthProvider()?.getUserNameBySession(ctx) ?? "";
}

export function getToken(ctx: Koa.ParameterizedContext): string {
  return ctx.session?.["token"] || "";
}

export function isAjax(ctx: Koa.ParameterizedContext) {
  return (
    ctx.header["x-requested-with"] &&
    ctx.header["x-requested-with"].toString().toLocaleLowerCase() === "xmlhttprequest"
  );
}

export function isApiRequest(ctx: Koa.ParameterizedContext) {
  return ctx.query.apikey || ctx.request?.header["x-request-api-key"] ? true : false;
}

export function getApiKey(ctx: Koa.ParameterizedContext) {
  return String(ctx.query.apikey || ctx.request?.header["x-request-api-key"] || "");
}

export function getLoginIp(ctx: Koa.ParameterizedContext) {
  return ctx.ip ?? "";
}

// Account creation and session establishment cannot degrade: the redeem flow in
// `instance_exchange_router` needs real accounts.
export function loginSuccess(ctx: Koa.ParameterizedContext, userName: string): string {
  return requireAuthProvider("Account login").loginSuccess(ctx, userName);
}

export function register(
  ctx: Koa.ParameterizedContext,
  userName: string,
  passWord: string,
  permission: number
) {
  return requireAuthProvider("Account registration").register(ctx, userName, passWord, permission);
}

export function checkBanIp(ctx: Koa.ParameterizedContext) {
  return getPanelAuthProvider()?.checkBanIp(ctx) ?? true;
}
