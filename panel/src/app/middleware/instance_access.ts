import type Koa from "koa";
import { $t } from "../i18n";
import { getRequestGuard } from "../service/request_guard";

export default async function instanceAccess(
  ctx: Koa.ParameterizedContext,
  next: Koa.Next
) {
  const instanceUuid = String(ctx.query.uuid);
  const daemonId = String(ctx.query.daemonId);
  if (getRequestGuard().canAccessInstance(ctx, daemonId, instanceUuid)) {
    await next();
    return;
  }
  ctx.status = 403;
  ctx.body = $t("TXT_CODE_permission.forbiddenInstance");
}
