export class TerminalSettings {
  historyLimitKB = 512;
  scrollback = 1000;
  fontFamily = "courier-new, courier, monospace";
  fontSize = 14;
  ctrlCProtection = true;
  ctrlCIntervalMs = 500;
}

export const TERMINAL_SETTINGS_LIMITS = {
  historyLimitKB: { min: 0, max: 4096 },
  scrollback: { min: 0, max: 50000 },
  fontSize: { min: 8, max: 48 },
  ctrlCIntervalMs: { min: 100, max: 5000 }
};

/** Old installations and incomplete stored settings retain the existing defaults. */
export function normalizeTerminalSettings(value: unknown): TerminalSettings {
  const settings = new TerminalSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  const values = value as Partial<TerminalSettings>;
  for (const key of Object.keys(TERMINAL_SETTINGS_LIMITS) as Array<
    keyof typeof TERMINAL_SETTINGS_LIMITS
  >) {
    const number = values[key];
    const { min, max } = TERMINAL_SETTINGS_LIMITS[key];
    if (typeof number === "number" && Number.isInteger(number) && number >= min && number <= max)
      settings[key] = number;
  }
  if (
    typeof values.fontFamily === "string" &&
    values.fontFamily.trim() &&
    values.fontFamily.length <= 256
  )
    settings.fontFamily = values.fontFamily;
  if (typeof values.ctrlCProtection === "boolean") settings.ctrlCProtection = values.ctrlCProtection;
  return settings;
}
