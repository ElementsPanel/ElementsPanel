import axios from "axios";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import {
  downloadPackage,
  fetchPackage,
  isDevelopment,
  listInstalled,
  PluginMarketError,
  toTransferFiles,
  uninstallPlugin,
  writePlugin,
  type MarketFileContent,
  type MarketInstallInfo,
  type PluginSide
} from "./service/plugin_market";
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
  "identity",
  "plugins"
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
    if (values.pluginMarketAddr != null)
      settings.pluginMarketAddr = String(values.pluginMarketAddr).trim().replace(/\/+$/, "");
    await saveMarketSettings(ctx);
  }

  // The catalogue editor writes the path of a freshly uploaded template here.
  // It is the same write the declared form performs, reached from the market's
  // own page rather than from the plugin manager.
  router.put("/settings", requireAdmin, async (requestCtx: Koa.ParameterizedContext) => {
    await writeMarketSettings((requestCtx.request.body ?? {}) as Record<string, unknown>);
    requestCtx.body = true;
  });

  // ---- Plugin market -----------------------------------------------------
  // The catalogue above installs instances; these install plugins, into the
  // panel's and the daemon's own plugin directories.

  /** Plugins are listed publicly by the market, so this needs no token. */
  async function fetchMarketPlugins(addr: string) {
    const response = await axios.get<{ items: Array<Record<string, unknown>> }>(
      `${addr}/api/plugins`,
      { timeout: 15000 }
    );
    const installed = new Map(listInstalled().map((item) => [item.pluginId, item]));
    return (response.data?.items ?? []).map((item) => ({
      ...item,
      installedVersion: installed.get(String(item.id))?.version
    }));
  }

  function reportPluginMarketError(error: unknown): never {
    const reason =
      error instanceof PluginMarketError ? error.message : "UNREACHABLE";
    const messages: Record<string, string> = {
      DIR_TAKEN: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_DIR_TAKEN"),
      EMPTY_PACKAGE: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_EMPTY_PACKAGE"),
      BAD_PATH: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_BAD_PACKAGE")
    };
    throw new Error(messages[reason] ?? ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
  }

  /** The daemons a daemon plugin can be installed on, as the page lists them. */
  function listNodes() {
    return Array.from(ctx.remote.services.services.entries()).map(([daemonId, node]) => ({
      daemonId,
      remarks: node.config.remarks,
      ip: node.config.ip,
      port: node.config.port,
      available: node.available
    }));
  }

  /**
   * The daemons a request names. The install sends them as an array in the body;
   * an uninstall has no body, so it names them in the query instead.
   */
  function requestedNodes(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
    return [];
  }

  /**
   * Sends one half of a package to the daemons the user picked.
   *
   * A daemon plugin has to sit on the machine that loads it, so the files go
   * over the socket and the daemon writes them itself. A node that cannot be
   * reached is reported rather than thrown: the panel half is already installed
   * by then, and a failure on one node says nothing about the others.
   */
  async function pushToNodes(
    daemonIds: readonly string[],
    info: MarketInstallInfo,
    files: readonly MarketFileContent[]
  ): Promise<string[]> {
    const payload = {
      name: info.name,
      pluginId: info.pluginId,
      version: info.version,
      files: toTransferFiles(files)
    };
    const failed: string[] = [];
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node) {
        failed.push(daemonId);
        continue;
      }
      try {
        await new ctx.remote.Request(node).request("plugin/install", payload, 60000);
      } catch (error) {
        ctx.logger.warn(`Failed to install a plugin on daemon ${daemonId}: ${error}`);
        failed.push(daemonId);
      }
    }
    return failed;
  }

  /** Asks the daemons the user picked to delete their half of a package. */
  async function removeFromNodes(daemonIds: readonly string[], name: string, pluginId: string) {
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node) continue;
      try {
        await new ctx.remote.Request(node).request("plugin/uninstall", { name, pluginId }, 30000);
      } catch (error) {
        ctx.logger.warn(`Failed to uninstall a plugin on daemon ${daemonId}: ${error}`);
      }
    }
  }

  /**
   * Asks the daemons the user picked to re-scan their plugin directories.
   *
   * A daemon binds its protocol handlers onto each socket as that socket
   * connects, so the node is reconnected afterwards: without that, a handler
   * that has just appeared stays invisible to the connection the panel holds.
   */
  async function reloadNodes(daemonIds: readonly string[] = []) {
    const targets = daemonIds.length ? daemonIds : Array.from(ctx.remote.services.services.keys());
    for (const daemonId of targets) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) continue;
      try {
        await new ctx.remote.Request(node).request("plugin/reload");
        node.refreshReconnect();
      } catch (error) {
        // A daemon that cannot reload — an older one, or one that is not a
        // development checkout — keeps what it has until its next restart.
        ctx.logger.warn(`Failed to reload a daemon's plugins: ${error}`);
      }
    }
  }

  /**
   * Makes a freshly written package take effect without a restart.
   *
   * Both halves load their plugins once, at startup, so installing normally
   * only writes files and the answer tells the page to ask for a restart. In a
   * source checkout the two re-scan instead: the panel its own directories, and
   * the daemons the package was sent to the ones they own. A production install
   * still answers `restartRequired`, because `ctx.plugins.reload()` refuses to
   * run there.
   */
  async function hotReload(
    sides: PluginSide[],
    daemonIds: readonly string[] = []
  ): Promise<boolean> {
    if (!isDevelopment()) return false;
    try {
      if (sides.includes("panel")) await ctx.plugins.reload();
      if (sides.includes("daemon")) await reloadNodes(daemonIds);
      return true;
    } catch (error) {
      ctx.logger.warn(`Failed to reload plugins after a market install: ${error}`);
      return false;
    }
  }

  router.get("/plugin/list", requireAdmin, async (requestCtx) => {
    try {
      requestCtx.body = await fetchMarketPlugins(marketSettings().pluginMarketAddr);
    } catch (error) {
      reportPluginMarketError(error);
    }
  });

  router.get("/plugin/installed", requireAdmin, async (requestCtx) => {
    requestCtx.body = listInstalled();
  });

  // The daemons the page offers to install a daemon plugin on.
  router.get("/plugin/nodes", requireAdmin, async (requestCtx) => {
    requestCtx.body = listNodes();
  });

  // What a package contains, before anything is installed: the page asks this to
  // find out whether it has to ask the user which nodes to send it to.
  router.get(
    "/plugin/package",
    requireAdmin,
    ctx.middleware.validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      try {
        const query = requestCtx.request.query;
        const pkg = await fetchPackage(marketSettings().pluginMarketAddr, {
          pluginId: String(query.pluginId),
          version: query.version ? String(query.version) : undefined
        });
        requestCtx.body = {
          name: pkg.name,
          version: pkg.version,
          sides: [...new Set(pkg.files.map((file) => file.side))]
        };
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );

  // Installing writes the panel half into this process's plugin directory and
  // sends the daemon half to the nodes the user picked. Both halves load their
  // plugins at startup, so in a development checkout the two are asked to
  // re-scan, and everywhere else the answer tells the page to ask for a restart.
  router.post(
    "/plugin/install",
    requireAdmin,
    ctx.middleware.speedLimit(3),
    ctx.middleware.validator({ body: { pluginId: String, name: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const body = (requestCtx.request.body ?? {}) as Record<string, unknown>;
      try {
        const addr = marketSettings().pluginMarketAddr;
        const pkg = await fetchPackage(addr, {
          pluginId: String(body.pluginId),
          name: String(body.name),
          version: body.version ? String(body.version) : undefined
        });
        const files = await downloadPackage(addr, pkg);
        const info: MarketInstallInfo = {
          pluginId: pkg.pluginId,
          name: pkg.name,
          version: pkg.version,
          installedAt: Date.now()
        };

        const sides = [...new Set(files.map((file) => file.side))];
        const ofSide = (side: PluginSide) => files.filter((file) => file.side === side);
        if (sides.includes("panel")) await writePlugin("panel", info, ofSide("panel"));

        const daemonIds = requestedNodes(body.daemonIds);
        // A package with a daemon half installs that half nowhere at all unless
        // the page was given nodes to send it to.
        const failedNodes = sides.includes("daemon")
          ? await pushToNodes(daemonIds, info, ofSide("daemon"))
          : [];

        requestCtx.body = {
          restartRequired: !(await hotReload(sides, daemonIds)),
          failedNodes
        };
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );

  router.delete(
    "/plugin/uninstall",
    requireAdmin,
    ctx.middleware.validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const pluginId = String(requestCtx.request.query.pluginId);
      const daemonIds = requestedNodes(requestCtx.request.query.daemonIds);
      const removed = await uninstallPlugin(pluginId);
      if (removed) await removeFromNodes(daemonIds, removed.name, pluginId);
      // A reload is what disposes the plugin whose directory has just been
      // deleted, on the panel and on every node the package was sent to.
      requestCtx.body = {
        removed: Boolean(removed),
        restartRequired: removed
          ? !(await hotReload(removed.sides, daemonIds))
          : false
      };
    }
  );

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
      {
        key: "pluginMarketAddr",
        type: "string",
        title: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR"),
        description: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR_DESC")
      },
      { type: "link", title: ctx.i18n.$t("TXT_CODE_ad207008"), route: "/market/editor" },
      { type: "link", title: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET"), route: "/market/plugins" },
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
