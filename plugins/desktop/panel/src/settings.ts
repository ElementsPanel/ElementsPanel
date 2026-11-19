export class DesktopSettings {
  wallpaperMode: "website" | "image" = "website";
  wallpaperImage = "";
  wallpaperImagePerTheme = false;
  // Missing theme values inherit the shared wallpaper; empty strings use the theme background.
  wallpaperImageLight: string | undefined = undefined;
  wallpaperImageDark: string | undefined = undefined;
  wallpaperBlurFollowConsole = true;
  wallpaperBlur = 5;
}

export function normalizeDesktopSettings(value: unknown): DesktopSettings {
  const settings = new DesktopSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  const values = value as Partial<DesktopSettings>;
  if (values.wallpaperMode === "website" || values.wallpaperMode === "image")
    settings.wallpaperMode = values.wallpaperMode;
  if (typeof values.wallpaperImage === "string" && values.wallpaperImage.length <= 8192)
    settings.wallpaperImage = values.wallpaperImage;
  if (typeof values.wallpaperImagePerTheme === "boolean")
    settings.wallpaperImagePerTheme = values.wallpaperImagePerTheme;
  for (const key of ["wallpaperImageLight", "wallpaperImageDark"] as const) {
    const image = values[key];
    if (typeof image === "string" && image.length <= 8192) settings[key] = image;
  }
  if (typeof values.wallpaperBlurFollowConsole === "boolean")
    settings.wallpaperBlurFollowConsole = values.wallpaperBlurFollowConsole;
  if (
    typeof values.wallpaperBlur === "number" &&
    Number.isFinite(values.wallpaperBlur) &&
    values.wallpaperBlur >= 0 &&
    values.wallpaperBlur <= 50
  )
    settings.wallpaperBlur = values.wallpaperBlur;
  return settings;
}
