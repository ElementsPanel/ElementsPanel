import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import type { ModSourcePreference } from "./mcim";

/**
 * The mod manager's persisted configuration: which upstream to prefer. One
 * entity under one uuid, so a fresh read always sees the last saved value.
 */
export class ModManagerSettings {
  sourcePreference: ModSourcePreference = "mirror";
}

const CATEGORY = "ModManagerSettings";
const UUID = "config";

export function isModSourcePreference(value: unknown): value is ModSourcePreference {
  return value === "mirror" || value === "official";
}

/** The stored preference, or the default when nothing valid was saved yet. */
export async function loadSourcePreference(ctx: PanelPluginContext): Promise<ModSourcePreference> {
  const stored = await ctx.storage.getStorage().load(CATEGORY, ModManagerSettings, UUID);
  return isModSourcePreference(stored?.sourcePreference) ? stored.sourcePreference : "mirror";
}

export async function saveSourcePreference(
  ctx: PanelPluginContext,
  preference: ModSourcePreference
) {
  await ctx.storage.getStorage().store(CATEGORY, UUID, { sourcePreference: preference });
}
