import Router from "@koa/router";
import type { PanelPluginContext } from "../../../../src/app/plugins";

class OobeState {
  completed = false;
}

const CATEGORY = "OobeState";
const ID = "config";

export async function setup(context: PanelPluginContext) {
  const storage = context.storage.getStorage();
  const users = context.services.users;
  const stored = (await storage.load(CATEGORY, OobeState, ID)) as OobeState | null;
  const state = stored ?? new OobeState();

  if (!stored) {
    // Existing installations with an administrator should not see OOBE again
    // after upgrading to the standalone plugin.
    state.completed = Boolean(users && users.size() > 0);
    await storage.store(CATEGORY, ID, state);
  } else if (users) {
    const completedWithUsers = users.size() > 0;
    if (state.completed !== completedWithUsers) {
      // Adding the user plugin requires an administrator, while an existing
      // administrator means an interrupted or legacy setup is already usable.
      state.completed = completedWithUsers;
      await storage.store(CATEGORY, ID, state);
    }
  }

  context.registerInstallationState({
    isInstalled: () => state.completed
  });

  const router = new Router({ prefix: "/api/overview" });

  router.put("/install", async (ctx) => {
    const config = (ctx.request.body ?? {}) as { language?: unknown };
    if (!state.completed) {
      if (config.language != null) {
        context.logger.warn(context.i18n.$t("TXT_CODE_e29a9317"), config.language);
        context.config.language = String(config.language);
        await context.i18n.i18next.changeLanguage(context.config.language.toLowerCase());
        context.services.remote.changeDaemonLanguage(context.config.language);
      }
      context.saveConfig();
      ctx.body = "OK";
      return;
    }
    ctx.body = new Error(context.i18n.$t("TXT_CODE_d37f0418"));
  });

  router.post("/complete", async (ctx) => {
    const currentUsers = context.services.users;
    if (currentUsers && currentUsers.size() === 0) {
      ctx.status = 409;
      ctx.body = false;
      return;
    }
    state.completed = true;
    await storage.store(CATEGORY, ID, state);
    ctx.body = true;
  });

  context.registerRouter(router);
}
