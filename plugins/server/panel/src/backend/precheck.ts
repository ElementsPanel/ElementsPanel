import type { Context } from "koa";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";

function isUploadRequest(requestCtx: Context) {
  const headers = requestCtx.request?.headers;
  const contentType = headers?.["content-type"] ?? "";
  return contentType.toLowerCase().includes("multipart");
}

/** Resolve the live guard before multipart parsing; absence follows the unguarded policy. */
export function preCheck(ctx: PanelPluginContext) {
  return async function preCheckMiddleware(requestCtx: Context, next: () => Promise<void>) {
    const canUpload = () =>
      ctx.get("guard")?.canUpload(requestCtx) ??
      ctx.get("identity")?.of(requestCtx).elevated ??
      true;
    if (isUploadRequest(requestCtx) && !canUpload()) {
      requestCtx.throw(403, "Access denied: Invalid multipart/form-data request!");
    }
    return await next();
  };
}
