import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { clearMarketCache, getAppMarketList } from "./service/market_service";
import { initMarketSettings, marketSettings, saveMarketSettings } from "./service/market_settings";

// Panel side of the app market. It owns the package catalogue, the settings
// that point at it, and the reinstall-from-package route. The panel core keeps
// nothing market-specific: the matching daemon plugin owns the install tasks.

export const inject = ["koa", "i18n", "storage", "middleware", "roles", "remote", "identity"];

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  await initMarketSettings(ctx);

  const { validator, permission, speedLimit, instanceAccess } = ctx.middleware;
  const requireUser = permission({ level: ctx.roles.USER });
  const requireAdmin = permission({ level: ctx.roles.ADMIN });
  const router = ctx.koa.router("/api/market");

  /** Packages may be installed by an elevated caller, or by anyone if allowed. */
  const canInstall = (requestCtx: Koa.ParameterizedContext) =>
    marketSettings().allowUsePreset || ctx.identity.of(requestCtx).elevated;

  const denyInstall = (requestCtx: Koa.ParameterizedContext) => {
    requestCtx.status = 403;
    requestCtx.body = new Error(ctx.i18n.$t("TXT_CODE_b5a47731"));
  };

  // Whether this caller may install packages. The terminal asks once so its
  // reinstall button can decide without a request per render.
  router.get("/config", requireUser, async (requestCtx) => {
    requestCtx.body = { allowUsePreset: canInstall(requestCtx) };
  });

  // The package catalogue.
  router.get("/packages", requireUser, async (requestCtx) => {
    if (!canInstall(requestCtx)) return denyInstall(requestCtx);
    try {
      requestCtx.body = await getAppMarketList();
    } catch (error) {
      // The market browser treats an empty catalogue as "source unreachable".
      ctx.logger.warn(`Failed to load the market catalogue: ${error}`);
      requestCtx.body = [];
    }
  });

  // Reinstall an existing instance from a catalogue package.
  router.post(
    "/install_instance",
    speedLimit(3),
    permission({ level: ctx.roles.USER, speedLimit: true }),
    validator({
      query: { daemonId: String, uuid: String },
      body: { description: String, title: String }
    }),
    instanceAccess,
    async (requestCtx: Koa.ParameterizedContext) => {
      if (!canInstall(requestCtx)) return denyInstall(requestCtx);
      try {
        const daemonId = String(requestCtx.query.daemonId);
        const instanceUuid = String(requestCtx.query.uuid);

        // "title" and "description" identify the package. Nothing else from the
        // request is used: the install parameters must come from the catalogue,
        // or a caller could inject an arbitrary start command.
        const description = String(requestCtx.request.body.description);
        const title = String(requestCtx.request.body.title);

        const packages = (await getAppMarketList())?.packages;
        if (!(packages instanceof Array)) throw new Error("Market catalogue is not an array!");
        const target = packages.find(
          (item) => item.title === title && item.description === description
        );
        if (!target) throw new Error("Market package is not found!");

        const remoteService = ctx.remote.services.getInstance(daemonId);
        new ctx.remote.Request(remoteService).request("instance/asynchronous", {
          taskName: "install_instance",
          instanceUuid,
          parameter: target,
          role: ctx.identity.of(requestCtx).role
        });
        requestCtx.body = true;
      } catch (error) {
        requestCtx.body = error;
      }
    }
  );

  router.get("/settings", requireAdmin, async (requestCtx) => {
    requestCtx.body = { ...marketSettings() };
  });

  router.put("/settings", requireAdmin, async (requestCtx: Koa.ParameterizedContext) => {
    const body = (requestCtx.request.body ?? {}) as Record<string, unknown>;
    const settings = marketSettings();
    if (body.presetPackAddr != null) {
      const address = String(body.presetPackAddr);
      if (address !== settings.presetPackAddr) {
        // A new source must not answer from the previous one's cache.
        await clearMarketCache().catch((error) =>
          ctx.logger.warn(`Failed to clear the market cache: ${error}`)
        );
      }
      settings.presetPackAddr = address;
    }
    if (body.allowUsePreset != null) settings.allowUsePreset = Boolean(body.allowUsePreset);
    await saveMarketSettings(ctx);
    requestCtx.body = true;
  });
}
