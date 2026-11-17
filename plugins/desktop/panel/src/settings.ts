export class DesktopSettings {
  wallpaperMode: "website" | "image" = "website";
  wallpaperImage = "";
}

export function normalizeDesktopSettings(value: unknown): DesktopSettings {
  const settings = new DesktopSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  const values = value as Partial<DesktopSettings>;
  if (values.wallpaperMode === "website" || values.wallpaperMode === "image")
    settings.wallpaperMode = values.wallpaperMode;
  if (typeof values.wallpaperImage === "string" && values.wallpaperImage.length <= 8192)
    settings.wallpaperImage = values.wallpaperImage;
  return settings;
}
