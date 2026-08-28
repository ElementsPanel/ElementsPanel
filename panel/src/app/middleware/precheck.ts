import { Context } from "koa";
import { getRequestGuard } from "../service/request_guard";

export function isUploadRequest(ctx: Context) {
  const headers = ctx.request?.headers;
  const contentType = headers?.["content-type"] ?? "";
  return contentType.toLowerCase().includes("multipart");
}

/**
 * Prevent users from performing unrestricted file uploads using koa-body,
 * occupying machine disk space. Who may upload is the guard's call.
 */
export async function preCheckMiddleware(ctx: Context, next: () => Promise<void>) {
  if (isUploadRequest(ctx) && !getRequestGuard().canUpload(ctx)) {
    throw new Error("Access denied: Invalid multipart/form-data request!");
  }
  return await next();
}
