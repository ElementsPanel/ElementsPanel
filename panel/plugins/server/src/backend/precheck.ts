import type { Context } from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";

function isUploadRequest(requestCtx: Context) {
  const headers = requestCtx.request?.headers;
  const contentType = headers?.["content-type"] ?? "";
  return contentType.toLowerCase().includes("multipart");
}

/**
 * Prevent users from performing unrestricted file uploads using koa-body,
 * occupying machine disk space. Who may upload is the guard's call.
 *
 * The guard arrives with `plugins/user` and can leave again, so it is resolved
 * per request. No guard installed means the panel is unguarded, which is the
 * same answer the core's own accessor gives: every request is served.
 */
export function preCheck(ctx: PanelPluginContext) {
  return async function preCheckMiddleware(requestCtx: Context, next: () => Promise<void>) {
    if (isUploadRequest(requestCtx) && !(ctx.get("guard")?.canUpload(requestCtx) ?? true)) {
      throw new Error("Access denied: Invalid multipart/form-data request!");
    }
    return await next();
  };
}
