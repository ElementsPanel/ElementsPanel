import Router from "@koa/router";
import type { PanelPluginContext } from "../../../../src/app/plugins";

export function setup(context: PanelPluginContext) {
  const router = new Router({ prefix: "/api/overview" });

  router.put("/install", async (ctx) => {
    const config = (ctx.request.body ?? {}) as { language?: unknown };
    if ((context.services.users?.size() ?? 0) === 0) {
      if (config.language != null) {
        context.logger.warn(context.i18n.$t("TXT_CODE_e29a9317"), config.language);
        context.config.language = String(config.language);
        await context.i18n.i18next.changeLanguage(context.config.language.toLowerCase());
        context.services.remote.changeDaemonLanguage(context.config.language);
      }
      await context.storage.getStorage().store("SystemConfig", "config", context.config);
      ctx.body = "OK";
      return;
    }
    ctx.body = new Error(context.i18n.$t("TXT_CODE_d37f0418"));
  });

  context.registerRouter(router);
}
