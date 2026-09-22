import path from "path";
import { pluginPackageDirectory, removePluginPackage, writePluginPackage } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { SettingsFormService } from "./settings";

// Daemon side of the plugin manager. The daemon core owns the mechanism —
// `ctx.plugins` lists what is installed and persists the enable switch — and
// this plugin only exposes it over the protocol, because the panel's plugin
// manager page is what drives it.
//
// Every event is reachable only over an authenticated top-level session: the
// daemon's auth middleware rejects every event other than "auth" and "stream"
// until the panel has presented the daemon key.

/** Turning this plugin off would remove the events the request came in over. */
const SELF = "config";

/**
 * Turning the web server off would drop the connection the request arrived on,
 * and with it every event that could turn it back on.
 */
const ESSENTIAL = new Set(["i18n", "storage", "runtime", "server", "monitor"]);

/**
 * Where a plugin sent over the protocol is written.
 *
 * `market_plugins/` is the directory both loaders scan besides `plugins/`, and
 * it is the one an installation may own: it never holds a built-in plugin, and
 * in a source checkout it is git-ignored, so an installation cannot add files to
 * the repository.
 */
const MARKET_PLUGINS_DIRECTORY = () => path.resolve(process.cwd(), "market_plugins");

/** The extensions a plugin package is allowed to contain. */
const ALLOWED_EXTENSIONS = new Set([
  ".json",
  ".js",
  ".cjs",
  ".mjs",
  ".css",
  ".scss",
  ".md",
  ".txt"
]);
const MAX_PLUGIN_ICON_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function validateTransferFile(file: TransferFile, destination: string) {
  // Icons are plugin-level metadata and may only live at the package root. Do
  // not turn the general package whitelist into an arbitrary image upload.
  if (file.path === "icon.png") {
    const encodedLimit = Math.ceil(MAX_PLUGIN_ICON_BYTES / 3) * 4 + 8;
    if (file.content.length > encodedLimit) throw new Error("Plugin icon is too large.");
    const data = Buffer.from(file.content, "base64");
    if (data.length > MAX_PLUGIN_ICON_BYTES) throw new Error("Plugin icon is too large.");
    if (data.length === 0 || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
      throw new Error("Invalid plugin icon.");
    return;
  }
  if (!ALLOWED_EXTENSIONS.has(path.extname(destination).toLowerCase())) {
    throw new Error(`The package contains an unacceptable file: ${file.path}`);
  }
}

function pluginDirectory(name: string): string {
  return pluginPackageDirectory(MARKET_PLUGINS_DIRECTORY(), name);
}

/** One file of a package, as the panel sends it. */
interface TransferFile {
  path: string;
  content: string;
}

function toTransferFiles(files: unknown): TransferFile[] {
  if (!Array.isArray(files)) throw new Error("The package contains no files.");
  return files.map((file) => ({
    path: String((file as TransferFile)?.path ?? ""),
    content: String((file as TransferFile)?.content ?? "")
  }));
}

export const inject = ["protocol", "i18n", "plugins"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.plugin(SettingsFormService);
  const settingsForm = ctx.get("settingsForm");
  if (!settingsForm) throw new Error("Daemon settings form service is unavailable.");

  ctx.protocol.on("plugin/list", (routerCtx) => {
    const declared = new Set(settingsForm.declared());
    ctx.protocol.response(
      routerCtx,
      ctx.plugins.inventory().map((record) => ({
        ...record,
        // So the panel can say "no configurable options" without a round trip.
        hasSettings: declared.has(record.id)
      }))
    );
  });

  ctx.protocol.on("plugin/enabled", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as { id?: unknown; enabled?: unknown };
      const id = String(payload.id ?? "");
      const enabled = Boolean(payload.enabled);
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      if (!enabled && id === SELF) {
        throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_SELF_DISABLE"));
      }
      if (!enabled && ESSENTIAL.has(id)) {
        throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ESSENTIAL_DISABLE"));
      }
      ctx.protocol.response(routerCtx, await ctx.plugins.setEnabled(id, enabled));
    } catch (error: any) {
      // The panel turns this into the error its page reports; an unhandled throw
      // from an async handler would reach nobody, because `emitRouter` only
      // catches the synchronous part.
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // A plugin installed from the market. The panel has already downloaded the
  // package and sends the daemon half here, because a daemon plugin has to sit on
  // the machine that loads it: nothing the panel writes locally is visible to
  // another host.
  ctx.protocol.on("plugin/install", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as {
        name?: unknown;
        pluginId?: unknown;
        version?: unknown;
        files?: unknown;
      };
      const name = String(payload.name ?? "");
      const directory = pluginDirectory(name);
      const root = path.resolve(directory);
      const files = toTransferFiles(payload.files);

      for (const file of files) {
        const destination = path.resolve(root, file.path);
        if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Illegal plugin path.");
        validateTransferFile(file, destination);
      }

      const info = {
        pluginId: String(payload.pluginId ?? ""),
        name,
        version: String(payload.version ?? ""),
        installedAt: Date.now()
      };
      await writePluginPackage(
        MARKET_PLUGINS_DIRECTORY(),
        info,
        files.map((file) => ({
          relative: file.path,
          content: Buffer.from(file.content, "base64")
        }))
      );
      ctx.protocol.response(routerCtx, { ...info, directory });
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // The other half of the same installation. The plugin id has to match the
  // marker, so a name that happens to collide with a built-in plugin cannot be
  // used to delete it.
  ctx.protocol.on("plugin/uninstall", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as { name?: unknown; pluginId?: unknown };
      await removePluginPackage(
        MARKET_PLUGINS_DIRECTORY(),
        String(payload.name ?? ""),
        String(payload.pluginId ?? "")
      );
      ctx.protocol.response(routerCtx, { removed: true });
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // Re-scan the plugin directories, for a plugin that arrived while the daemon
  // was running — the plugin market installs one into `market_plugins/` in a
  // source checkout. Development only: `ctx.plugins.reload()` refuses otherwise,
  // and the panel is told why.
  ctx.protocol.on("plugin/reload", async (routerCtx) => {
    try {
      await ctx.plugins.reload();
      ctx.protocol.response(routerCtx, ctx.plugins.inventory());
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // The configuration of one of this daemon's plugins, described by the plugin
  // itself. The panel renders the description; nothing about the form lives
  // there, which is the only way a daemon plugin can have a settings page at all.
  ctx.protocol.on("plugin/config", async (routerCtx, data) => {
    try {
      const id = String((data as { id?: unknown })?.id ?? "");
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      ctx.protocol.response(routerCtx, await settingsForm.read(id));
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/config/write", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as { id?: unknown; values?: unknown };
      const id = String(payload.id ?? "");
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      const values = (payload.values ?? {}) as Record<string, unknown>;
      await settingsForm.write(id, values);
      ctx.protocol.response(routerCtx, true);
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });
}
