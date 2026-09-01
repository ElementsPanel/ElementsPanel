import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { clearMarketCache, getAppMarketList } from "./service/market_service";
import { initMarketSettings, marketSettings, saveMarketSettings } from "./service/market_settings";

// Panel side of the app market. It owns the package catalogue, the settings
// that point at it, and the reinstall-from-package route. The panel core keeps
// nothing market-specific: the matching daemon plugin owns the install tasks.

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settingsForm",
  "middleware",
  "roles",
  "remote",
  "identity"
];

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

  async function writeMarketSettings(values: Record<string, unknown>) {
    const settings = marketSettings();
    if (values.presetPackAddr != null) {
      const address = String(values.presetPackAddr);
      if (address !== settings.presetPackAddr) {
        // A new source must not answer from the previous one's cache.
        await clearMarketCache().catch((error) =>
          ctx.logger.warn(`Failed to clear the market cache: ${error}`)
        );
      }
      settings.presetPackAddr = address;
    }
    if (values.allowUsePreset != null) settings.allowUsePreset = Boolean(values.allowUsePreset);
    await saveMarketSettings(ctx);
  }

  // The catalogue editor writes the path of a freshly uploaded template here.
  // It is the same write the declared form performs, reached from the market's
  // own page rather than from the plugin manager.
  router.put("/settings", requireAdmin, async (requestCtx: Koa.ParameterizedContext) => {
    await writeMarketSettings((requestCtx.request.body ?? {}) as Record<string, unknown>);
    requestCtx.body = true;
  });

  // Described, not drawn: the market's two settings are rendered by the plugin
  // manager's generic form, the same one that renders a daemon plugin's
  // configuration. The two buttons that used to sit beside them are `link`
  // fields, because a route is all they ever were.
  ctx.settingsForm.declare({
    fields: () => [
      {
        key: "presetPackAddr",
        type: "string",
        title: ctx.i18n.$t("TXT_CODE_6265ae47"),
        description: ctx.i18n.$t("TXT_CODE_24c4768a")
      },
      {
        key: "allowUsePreset",
        type: "boolean",
        title: ctx.i18n.$t("TXT_CODE_3c93920b"),
        description: ctx.i18n.$t("TXT_CODE_bc2e52a0")
      },
      { type: "link", title: ctx.i18n.$t("TXT_CODE_ad207008"), route: "/market/editor" },
      {
        type: "link",
        title: ctx.i18n.$t("TXT_CODE_53499d7"),
        route: "/market/editor?newTemplate=true"
      }
    ],
    read: () => ({ ...marketSettings() }),
    write: writeMarketSettings
  });
}
