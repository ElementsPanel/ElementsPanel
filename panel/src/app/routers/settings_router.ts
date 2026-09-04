import Router from "@koa/router";
import SystemConfig from "../entity/setting";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import { getRequestGuard as guard } from "../service/request_guard";
import { operationLogger } from "../service/operation_logger";
import { saveSystemConfig, systemConfig } from "../setting";

const router = new Router({ prefix: "/overview" });

// Get the remaining panel system configuration. Plugin-owned settings are
// exposed through the plugin configuration page instead.
router.get("/setting", permission({ level: ROLE.ADMIN }), async (ctx) => {
  ctx.body = systemConfig;
});

// Update panel configuration items still owned by the core.
router.put("/setting", permission({ level: ROLE.ADMIN }), async (ctx) => {
  const config = ctx.request.body as Partial<SystemConfig>;
  if (config && systemConfig) {
    // The HTTP server's own fields are edited by the "server" plugin, while
    // authentication and ordinary-user capabilities belong to the "user"
    // plugin. This route only accepts settings still owned by the panel core.
    if (config.gzip != null) systemConfig.gzip = config.gzip;
    if (config.maxCompress != null) systemConfig.maxCompress = config.maxCompress;
    if (config.maxDownload != null) systemConfig.maxDownload = config.maxDownload;
    if (config.zipType != null) systemConfig.zipType = config.zipType;
    if (config.forwardType != null) systemConfig.forwardType = Number(config.forwardType);
    if (config.dataPort != null) systemConfig.dataPort = Number(config.dataPort);

    operationLogger.log("system_config_change", {
      operator_ip: ctx.ip,
      operator_name: guard().identify(ctx).userName
    });

    saveSystemConfig(systemConfig);
    ctx.body = "OK";
    return;
  }
  ctx.body = new Error($t("TXT_CODE_e4d6cc20"));
});

export default router;
