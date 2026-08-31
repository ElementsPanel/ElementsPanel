import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";

// First-run setup. It owns the "is the panel installed" answer the frontend
// reads from `/api/auth/status`; the core defaults to installed, so removing
// this plugin cannot redirect the browser to a route that no longer exists.

class OobeState {
  completed = false;
}

const CATEGORY = "OobeState";
const ID = "config";

export const inject = ["koa", "i18n", "storage", "settings", "remote", "identity"];

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);

  const storage = ctx.storage.getStorage();
  const users = ctx.identity.users;
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

  // `ctx.set()` from inside a plugin belongs to that plugin: the service is
  // removed when it unloads, and the core falls back to "installed".
  ctx.set("installation", { isInstalled: () => state.completed });

  const router = ctx.koa.router("/api/overview");

  router.put("/install", async (requestCtx) => {
    const config = (requestCtx.request.body ?? {}) as { language?: unknown };
    if (!state.completed) {
      if (config.language != null) {
        ctx.logger.warn(ctx.i18n.$t("TXT_CODE_e29a9317"), config.language);
        ctx.settings.config.language = String(config.language);
        await ctx.i18n.i18next.changeLanguage(ctx.settings.config.language.toLowerCase());
        ctx.remote.services.changeDaemonLanguage(ctx.settings.config.language);
      }
      ctx.settings.save();
      requestCtx.body = "OK";
      return;
    }
    requestCtx.body = new Error(ctx.i18n.$t("TXT_CODE_d37f0418"));
  });

  router.post("/complete", async (requestCtx) => {
    const currentUsers = ctx.identity.users;
    if (currentUsers && currentUsers.size() === 0) {
      requestCtx.status = 409;
      requestCtx.body = false;
      return;
    }
    state.completed = true;
    await storage.store(CATEGORY, ID, state);
    requestCtx.body = true;
  });
}
