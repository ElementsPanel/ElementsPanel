import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { DesktopSettings, normalizeDesktopSettings } from "../settings";

const CATEGORY = "DesktopSettings";
const UUID = "config";

export async function registerDesktopSettings(ctx: PanelPluginContext) {
  const storage = ctx.storage.getStorage();
  let settings = normalizeDesktopSettings(await storage.load(CATEGORY, DesktopSettings, UUID));

  ctx.inject(["settingsForm"], (scope) => {
    const $t = scope.i18n.$t;
    scope.settingsForm.declare({
      fields: () => [
        {
          key: "wallpaperMode",
          type: "select",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_MODE"),
          options: [
            { value: "website", label: $t("TXT_CODE_DESKTOP_WALLPAPER_WEBSITE") },
            { value: "image", label: $t("TXT_CODE_DESKTOP_WALLPAPER_CUSTOM") }
          ]
        },
        {
          key: "wallpaperImage",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE"),
          description: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_DESC"),
          fileUpload: true,
          visibleWhen: "wallpaperMode=image"
        },
        {
          key: "wallpaperBlurFollowConsole",
          type: "boolean",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_BLUR_FOLLOW_CONSOLE")
        },
        {
          key: "wallpaperBlur",
          type: "number",
          control: "slider",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_BLUR"),
          min: 0,
          max: 50,
          unit: "px",
          visibleWhen: "wallpaperBlurFollowConsole=false"
        }
      ],
      read: () => ({ ...settings }),
      write: async (values) => {
        const candidate = { ...settings, ...values };
        if (candidate.wallpaperImage === null) candidate.wallpaperImage = "";
        const next = normalizeDesktopSettings(candidate);
        if (
          (Object.keys(next) as Array<keyof DesktopSettings>).some(
            (key) => next[key] !== candidate[key]
          )
        )
          throw new Error($t("TXT_CODE_DESKTOP_WALLPAPER_INVALID"));
        await storage.store(CATEGORY, UUID, next);
        settings = next;
      }
    });
  });
  return () => ({ ...settings });
}
