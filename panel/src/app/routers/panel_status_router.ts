import Router from "@koa/router";
import axios from "axios";
import Koa from "koa";
import { GlobalVariable } from "mcsmanager-common";
import SystemConfig from "../entity/setting";
import { ROLE } from "../entity/user";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { getRequestGuard } from "../service/request_guard";
import { systemConfig } from "../setting";

// Bootstrap endpoints that must stay in the core: the frontend reads /status
// before any plugin has loaded, and /proxy is a generic admin helper unrelated
// to accounts. The login and account routes live in the "user" plugin.
const router = new Router({ prefix: "/auth" });

// [Public Permission]
// Get the state information that the panel can expose
router.all(
  "/status",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    // Without the "user" plugin the panel has no accounts to create, so it is
    // never "waiting to be installed".
    const isInstall = getRequestGuard().isInstalled();
    ctx.body = {
      versionChange: GlobalVariable.get("versionChange", null),
      isInstall,
      language: systemConfig?.language || null,
      settings: {
        canFileManager: systemConfig?.canFileManager || false,
        allowUsePreset: systemConfig?.allowUsePreset || false,
        businessMode: systemConfig?.businessMode || false,
        businessId: systemConfig?.businessId || null,
        allowChangeCmd: systemConfig?.allowChangeCmd || false,
        allowJavaManager: systemConfig?.allowJavaManager ?? true,
        panelId: systemConfig?.panelId || null,
        ssoEnabled: systemConfig?.ssoEnabled || false,
        ssoOnlyMode: systemConfig?.ssoOnlyMode || false
      } as Partial<SystemConfig>
    };
  }
);

router.all(
  "/proxy",
  validator({ query: { target: String } }),
  permission({ level: ROLE.ADMIN }),
  async (ctx) => {
    try {
      const response = await axios.request({
        method: (ctx.query.method as string) || ctx.method,
        url: String(ctx.query.target)
      });
      if (response.status !== 200) throw new Error("Response code != 200");
      ctx.body = response.data;
    } catch (err) {
      ctx.body = err;
    }
  }
);

export default router;
