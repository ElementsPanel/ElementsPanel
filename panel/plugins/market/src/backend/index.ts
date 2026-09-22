import axios from "axios";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import {
  downloadPackage,
  fetchPackage,
  forgetRemoteInstall,
  isDevelopment,
  listInstalled,
  PluginMarketError,
  readRemoteInstalls,
  recordRemoteInstall,
  toTransferFiles,
  uninstallPlugin,
  writePlugin,
  type MarketFileContent,
  type MarketInstallInfo,
  type PluginSide,
  type RemoteMarketInstall
} from "./service/plugin_market";
import { clearMarketCache, getAppMarketList } from "./service/market_service";
import { initMarketSettings, marketSettings, saveMarketSettings } from "./service/market_settings";
import { encodePluginIcon, MAX_PLUGIN_ICON_BYTES } from "./plugin_icon";

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

// Install and uninstall must share a queue: a second request cannot overwrite
// files or installation records while the first request is still using them.
const pluginOperations = new Map<string, Promise<void>>();

async function withPluginLock<T>(pluginId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pluginOperations.get(pluginId) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => {},
    () => {}
  );
  pluginOperations.set(pluginId, settled);
  try {
    return await result;
  } finally {
    if (pluginOperations.get(pluginId) === settled) pluginOperations.delete(pluginId);
  }
}

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
        await new ctx.remote.Request(remoteService).request("instance/asynchronous", {
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
      installedVersion: installed.get(String(item.id))?.version,
      installedDaemonIds: installed.get(String(item.id))?.daemonIds ?? []
    }));
  }

  function reportPluginMarketError(error: unknown): never {
    const reason =
      error instanceof PluginMarketError
        ? error.message
        : axios.isAxiosError(error) && error.response?.status === 404
        ? "NOT_FOUND"
        : "UNREACHABLE";
    const messages: Record<string, string> = {
      NOT_FOUND: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_NOT_FOUND"),
      DIR_TAKEN: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_DIR_TAKEN"),
      EMPTY_PACKAGE: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_EMPTY_PACKAGE"),
      BAD_PATH: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_BAD_PACKAGE"),
      NO_NODES: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_SELECT_NODES")
    };
    const statusByReason: Record<string, number> = {
      NOT_FOUND: 404,
      DIR_TAKEN: 409,
      EMPTY_PACKAGE: 400,
      BAD_PATH: 400,
      NO_NODES: 400
    };
    throw Object.assign(
      new Error(messages[reason] ?? ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE")),
      { status: statusByReason[reason] ?? 502 }
    );
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
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    return [
      ...new Set(
        values
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ];
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
  ): Promise<{ failedNodes: string[]; changedNodes: string[] }> {
    const payload = {
      name: info.name,
      pluginId: info.pluginId,
      version: info.version,
      files: toTransferFiles(files)
    };
    const failedNodes: string[] = [];
    const changedNodes: string[] = [];
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        failedNodes.push(daemonId);
        continue;
      }
      try {
        await new ctx.remote.Request(node).request("plugin/install", payload, 60000);
      } catch (error) {
        ctx.logger.warn(`Failed to install a plugin on daemon ${daemonId}: ${error}`);
        failedNodes.push(daemonId);
        continue;
      }
      await recordRemoteInstall(info, daemonId);
      changedNodes.push(daemonId);
    }
    return { failedNodes, changedNodes };
  }

  /** Failed or unselected installs stay recorded until a later successful retry. */
  async function removeFromNodes(installations: readonly RemoteMarketInstall[]) {
    const failedNodes = new Set<string>();
    const changedNodes = new Set<string>();
    for (const installation of installations) {
      const { daemonId, name, pluginId } = installation;
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        failedNodes.add(daemonId);
        continue;
      }
      try {
        await new ctx.remote.Request(node).request("plugin/uninstall", { name, pluginId }, 30000);
      } catch (error) {
        ctx.logger.warn(`Failed to uninstall a plugin on daemon ${daemonId}: ${error}`);
        failedNodes.add(daemonId);
        continue;
      }
      await forgetRemoteInstall(installation);
      changedNodes.add(daemonId);
    }
    return { failedNodes: [...failedNodes], changedNodes: [...changedNodes] };
  }

  /**
   * Asks the daemons the user picked to re-scan their plugin directories.
   *
   * A daemon binds its protocol handlers onto each socket as that socket
   * connects, so the node is reconnected afterwards: without that, a handler
   * that has just appeared stays invisible to the connection the panel holds.
   */
  async function reloadNodes(daemonIds: readonly string[]): Promise<boolean> {
    let reloaded = true;
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        reloaded = false;
        continue;
      }
      try {
        await new ctx.remote.Request(node).request("plugin/reload");
        node.refreshReconnect();
      } catch (error) {
        // A daemon that cannot reload — an older one, or one that is not a
        // development checkout — keeps what it has until its next restart.
        ctx.logger.warn(`Failed to reload a daemon's plugins: ${error}`);
        reloaded = false;
      }
    }
    return reloaded;
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
    if (!sides.length) return true;
    if (!isDevelopment()) return false;
    try {
      if (sides.includes("panel")) await ctx.plugins.reload();
      if (sides.includes("daemon")) return await reloadNodes(daemonIds);
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

  router.get(
    "/plugin/detail",
    requireAdmin,
    validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      try {
        const pluginId = String(requestCtx.query.pluginId);
        const version = requestCtx.query.version ? String(requestCtx.query.version) : undefined;
        const response = await axios.get(
          `${marketSettings().pluginMarketAddr}/api/plugins/${encodeURIComponent(pluginId)}`,
          { params: { version }, timeout: 15000 }
        );
        const detail = response.data;
        // Also support market sources that predate the selectedVersion field.
        const selectedVersion = version
          ? detail.versions?.find((item: { version: string }) => item.version === version)
          : detail.latestVersion;
        if (!selectedVersion || selectedVersion.status !== "approved") {
          throw new PluginMarketError("NOT_FOUND");
        }
        const installed = listInstalled().find((item) => item.pluginId === pluginId);
        requestCtx.body = {
          ...detail,
          selectedVersion,
          installedVersion: installed?.version,
          installedDaemonIds: installed?.daemonIds ?? []
        };
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );

  // The daemons the page offers to install a daemon plugin on.
  router.get("/plugin/nodes", requireAdmin, async (requestCtx) => {
    requestCtx.body = listNodes();
  });

  /**
   * 插件图标。市场地址只配在后端，浏览器拿不到，所以图片也经这里转一手，与其余市场
   * 接口一致。
   *
   * 返回的是 data URL 而不是图片本身：面板的请求层按 JSON 协议收发（console 的
   * apiService 只取响应体里的 `data`），返回二进制它读不了。图标很小，转成 data URL
   * 由页面直接放进 <img> 最省事。
   *
   * 包里没有 icon.png 时市场返回 404，这里当作「没有图标」——dataUrl 为 null，
   * 页面回退到拼图图标，缺图标不是错误。
   */
  router.get(
    "/plugin/icon",
    requireAdmin,
    validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const pluginId = String(requestCtx.query.pluginId);
      const version = requestCtx.query.version ? String(requestCtx.query.version) : undefined;
      try {
        const response = await axios.get<ArrayBuffer>(
          `${marketSettings().pluginMarketAddr}/api/plugins/${encodeURIComponent(pluginId)}/icon`,
          {
            params: version ? { version } : {},
            responseType: "arraybuffer",
            timeout: 15000,
            maxContentLength: MAX_PLUGIN_ICON_BYTES,
            maxBodyLength: MAX_PLUGIN_ICON_BYTES
          }
        );
        requestCtx.body = { dataUrl: encodePluginIcon(response.data) };
      } catch {
        // 市场没有图标，或这个市场源不可达：都当作没有图标。
        requestCtx.body = { dataUrl: null };
      }
    }
  );

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
        requestCtx.body = await withPluginLock(String(body.pluginId), async () => {
          const addr = marketSettings().pluginMarketAddr;
          const pkg = await fetchPackage(addr, {
            pluginId: String(body.pluginId),
            name: String(body.name),
            version: body.version ? String(body.version) : undefined
          });
          const daemonIds = requestedNodes(body.daemonIds);
          if (!pkg.files.some((file) => file.side === "panel") && !daemonIds.length)
            throw new PluginMarketError("NO_NODES");
          const files = await downloadPackage(addr, pkg);
          const info: MarketInstallInfo = {
            pluginId: pkg.pluginId,
            name: pkg.name,
            version: pkg.version,
            installedAt: Date.now()
          };
          const previous = listInstalled().find((item) => item.pluginId === info.pluginId);

          const sides: PluginSide[] = [];
          const ofSide = (side: PluginSide) => files.filter((file) => file.side === side);
          const panelFiles = ofSide("panel");
          if (panelFiles.length) {
            await writePlugin("panel", info, panelFiles);
            sides.push("panel");
          }
          const daemonFiles = ofSide("daemon");
          const { failedNodes, changedNodes } = daemonFiles.length
            ? await pushToNodes(daemonIds, info, daemonFiles)
            : { failedNodes: [], changedNodes: [] };
          if (changedNodes.length) sides.push("daemon");
          const reloaded = await hotReload(sides, changedNodes);
          // Development discovery loads new plugins, but retains already loaded
          // module instances. Replacing an existing side still needs a restart.
          const replaced =
            (panelFiles.length > 0 && previous?.sides.includes("panel")) ||
            changedNodes.some((daemonId) => previous?.daemonIds.includes(daemonId));

          return {
            restartRequired: Boolean(replaced) || !reloaded,
            installedVersion: listInstalled().find((item) => item.pluginId === info.pluginId)
              ?.version,
            failedNodes
          };
        });
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
      requestCtx.body = await withPluginLock(pluginId, async () => {
        const selectedNodes = new Set(daemonIds);
        const installations = readRemoteInstalls(pluginId).filter((item) =>
          selectedNodes.has(item.daemonId)
        );
        const removed = await uninstallPlugin(pluginId);
        const { failedNodes, changedNodes } = await removeFromNodes(installations);
        const sides: PluginSide[] = removed?.directories.length ? ["panel"] : [];
        if (changedNodes.length) sides.push("daemon");
        const remaining = listInstalled().find((item) => item.pluginId === pluginId);
        return {
          removed: !remaining,
          installedVersion: remaining?.version,
          failedNodes,
          restartRequired: !(await hotReload(sides, changedNodes))
        };
      });
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
