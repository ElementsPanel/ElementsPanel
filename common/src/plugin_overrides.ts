import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { DiscoveredPlugin } from "./plugin_manifest";

export interface PluginOverride {
  enabled?: boolean;
  config?: Record<string, unknown>;
}
interface Overrides {
  version: 1;
  plugins: Record<string, PluginOverride>;
}

export function pluginOverridesPath(): string {
  return path.resolve(process.cwd(), "data", "plugin-overrides.json");
}

/** Package defaults stay immutable; only the user's last layer lives in data. */
export function readPluginOverrides(filename = pluginOverridesPath()): Overrides {
  let raw: string;
  try {
    raw = fs.readFileSync(filename, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, plugins: {} };
    throw error;
  }
  const data = JSON.parse(raw);
  if (
    data?.version !== 1 ||
    !data.plugins ||
    typeof data.plugins !== "object" ||
    Array.isArray(data.plugins)
  )
    throw new Error("Invalid plugin-overrides.json");
  for (const entry of Object.values(data.plugins)) validatePluginOverride(entry);
  return data;
}

export function validatePluginOverride(value: unknown): asserts value is PluginOverride {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid plugin override.");
  const entry = value as PluginOverride;
  if (entry.enabled !== undefined && typeof entry.enabled !== "boolean")
    throw new Error("Invalid plugin enablement.");
  if (
    entry.config !== undefined &&
    (!entry.config || typeof entry.config !== "object" || Array.isArray(entry.config))
  )
    throw new Error("Plugin config must be an object.");
  if (Object.keys(value).some((key) => !["enabled", "config"].includes(key)))
    throw new Error("Unknown plugin override field.");
}

export function applyPluginOverrides(
  plugins: DiscoveredPlugin[],
  filename = pluginOverridesPath()
): DiscoveredPlugin[] {
  const overrides = readPluginOverrides(filename).plugins;
  return plugins.map((plugin) => ({
    ...plugin,
    manifest: {
      ...plugin.manifest,
      ...(Object.prototype.hasOwnProperty.call(overrides, plugin.manifest.id)
        ? overrides[plugin.manifest.id]
        : {})
    }
  }));
}

/** Call inside the host's change queue; rename keeps readers off partial JSON. */
export function writePluginOverride(
  id: string,
  patch: PluginOverride,
  filename = pluginOverridesPath()
): void {
  validatePluginOverride(patch);
  if (!id || ["__proto__", "constructor", "prototype"].includes(id))
    throw new Error("Invalid plugin id.");
  const data = readPluginOverrides(filename);
  data.plugins[id] = {
    ...(Object.prototype.hasOwnProperty.call(data.plugins, id) ? data.plugins[id] : {}),
    ...patch
  };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Remove user-owned values when a plugin package is uninstalled. */
export function removePluginOverride(id: string, filename = pluginOverridesPath()): void {
  const data = readPluginOverrides(filename);
  if (!Object.prototype.hasOwnProperty.call(data.plugins, id)) return;
  delete data.plugins[id];
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
