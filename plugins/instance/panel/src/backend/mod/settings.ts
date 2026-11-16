import type { PanelPluginContext } from "../../../../../../core/panel/src/app/plugin";
import type { ModSourcePreference } from "./mcim";

export class ModManagerSettings {
  sourcePreference: ModSourcePreference = "mirror";
  requestTimeoutMs = 5000;
  requestRetries = 2;
}

export const MOD_REQUEST_LIMITS = {
  requestTimeoutMs: { min: 1000, max: 120000 },
  requestRetries: { min: 0, max: 5 }
} as const;

const CATEGORY = "ModManagerSettings";
const UUID = "config";

export function isModSourcePreference(value: unknown): value is ModSourcePreference {
  return value === "mirror" || value === "official";
}

export function normalizeModManagerSettings(value: Partial<ModManagerSettings> | null | undefined) {
  const settings = new ModManagerSettings();
  if (isModSourcePreference(value?.sourcePreference))
    settings.sourcePreference = value.sourcePreference;
  for (const [key, range] of Object.entries(MOD_REQUEST_LIMITS)) {
    const name = key as keyof typeof MOD_REQUEST_LIMITS;
    const input = value?.[name];
    if (
      typeof input === "number" &&
      Number.isInteger(input) &&
      input >= range.min &&
      input <= range.max
    )
      settings[name] = input;
  }
  return settings;
}

export async function loadModManagerSettings(ctx: PanelPluginContext): Promise<ModManagerSettings> {
  const stored = await ctx.storage.getStorage().load(CATEGORY, ModManagerSettings, UUID);
  return normalizeModManagerSettings(stored);
}

export async function saveModManagerSettings(
  ctx: PanelPluginContext,
  settings: ModManagerSettings
) {
  await ctx.storage.getStorage().store(CATEGORY, UUID, settings);
}
