import Router from "@koa/router";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugins";
import { localeMessages } from "../i18n";
import { clearMarketCache, getAppMarketList } from "./service/market_service";
import {
  initMarketSettings,
  marketSettings,
  saveMarketSettings,
  setPluginContext
} from "./service/market_settings";

// Panel side of the app market. It owns the package catalogue, the settings
// that point at it, and the reinstall-from-package route. The panel core keeps
// nothing market-specific: the matching daemon plugin owns the install tasks.

export async function setup(context: PanelPluginContext) {
  setPluginContext(context);
  context.registerLocaleMessages(localeMessages);
  await initMarketSettings();

  const { validator, permission, speedLimit, instanceAccess } = context.middleware;
  const requireUser = permission({ level: context.roles.USER });
  const requireAdmin = permission({ level: context.roles.ADMIN });
  const router = new Router({ prefix: "/api/market" });

  /** Packages may be installed by an elevated caller, or by anyone if allowed. */
  const canInstall = (ctx: Koa.ParameterizedContext) =>
    marketSettings().allowUsePreset || context.services.identify(ctx).elevated;

  const denyInstall = (ctx: Koa.ParameterizedContext) => {
    ctx.status = 403;
    ctx.body = new Error(context.i18n.$t("TXT_CODE_b5a47731"));
  };

  // Whether this caller may install packages. The terminal asks once so its
  // reinstall button can decide without a request per render.
  router.get("/config", requireUser, async (ctx) => {
    ctx.body = { allowUsePreset: canInstall(ctx) };
  });

  // The package catalogue.
  router.get("/packages", requireUser, async (ctx) => {
    if (!canInstall(ctx)) return denyInstall(ctx);
    try {
      ctx.body = await getAppMarketList();
    } catch (error) {
      // The market browser treats an empty catalogue as "source unreachable".
      context.logger.warn(`Failed to load the market catalogue: ${error}`);
      ctx.body = [];
    }
  });

  // Reinstall an existing instance from a catalogue package.
  router.post(
    "/install_instance",
    speedLimit(3),
    permission({ level: context.roles.USER, speedLimit: true }),
    validator({
      query: { daemonId: String, uuid: String },
      body: { description: String, title: String }
    }),
    instanceAccess,
    async (ctx: Koa.ParameterizedContext) => {
      if (!canInstall(ctx)) return denyInstall(ctx);
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);

        // "title" and "description" identify the package. Nothing else from the
        // request is used: the install parameters must come from the catalogue,
        // or a caller could inject an arbitrary start command.
        const description = String(ctx.request.body.description);
        const title = String(ctx.request.body.title);

        const packages = (await getAppMarketList())?.packages;
        if (!(packages instanceof Array)) throw new Error("Market catalogue is not an array!");
        const target = packages.find(
          (item) => item.title === title && item.description === description
        );
        if (!target) throw new Error("Market package is not found!");

        const remoteService = context.services.remote.getInstance(daemonId);
        new context.services.remoteRequest(remoteService).request("instance/asynchronous", {
          taskName: "install_instance",
          instanceUuid,
          parameter: target,
          role: context.services.identify(ctx).role
        });
        ctx.body = true;
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.get("/settings", requireAdmin, async (ctx) => {
    ctx.body = { ...marketSettings() };
  });

  router.put("/settings", requireAdmin, async (ctx: Koa.ParameterizedContext) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const settings = marketSettings();
    if (body.presetPackAddr != null) {
      const address = String(body.presetPackAddr);
      if (address !== settings.presetPackAddr) {
        // A new source must not answer from the previous one's cache.
        await clearMarketCache().catch((error) =>
          context.logger.warn(`Failed to clear the market cache: ${error}`)
        );
      }
      settings.presetPackAddr = address;
    }
    if (body.allowUsePreset != null) settings.allowUsePreset = Boolean(body.allowUsePreset);
    await saveMarketSettings();
    ctx.body = true;
  });

  context.registerRouter(router);
}
