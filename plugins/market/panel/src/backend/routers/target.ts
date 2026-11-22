import type Koa from "koa";

export function selectedDaemon(requestCtx: Koa.ParameterizedContext): string | undefined {
  return typeof requestCtx.query.daemonId === "string" ? requestCtx.query.daemonId : undefined;
}
