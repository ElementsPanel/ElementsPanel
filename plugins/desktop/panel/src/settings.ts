export class DesktopSettings {
  wallpaperMode: "website" | "image" | "color" = "website";
  wallpaperImage = "";
  wallpaperColor = "#232429";
}

export function normalizeDesktopSettings(value: unknown): DesktopSettings {
  const settings = new DesktopSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  const values = value as Partial<DesktopSettings>;
  if (
    values.wallpaperMode === "website" ||
    values.wallpaperMode === "image" ||
    values.wallpaperMode === "color"
  )
    settings.wallpaperMode = values.wallpaperMode;
  if (typeof values.wallpaperImage === "string" && values.wallpaperImage.length <= 8192)
    settings.wallpaperImage = values.wallpaperImage;
  if (
    typeof values.wallpaperColor === "string" &&
    /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(values.wallpaperColor)
  )
    settings.wallpaperColor = values.wallpaperColor;
  return settings;
}
