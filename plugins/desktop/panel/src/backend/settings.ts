import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { DesktopSettings, normalizeDesktopSettings } from "../settings";

const CATEGORY = "DesktopSettings";
const UUID = "config";

export async function registerDesktopSettings(ctx: PanelPluginContext) {
  const storage = ctx.storage.getStorage();
  let settings = normalizeDesktopSettings(await storage.load(CATEGORY, DesktopSettings, UUID));
  const readSettings = () => ({
    ...settings,
    wallpaperImageLight: settings.wallpaperImageLight ?? settings.wallpaperImage,
    wallpaperImageDark: settings.wallpaperImageDark ?? settings.wallpaperImage,
    startButtonIconLight: settings.startButtonIconLight ?? settings.startButtonIcon,
    startButtonIconDark: settings.startButtonIconDark ?? settings.startButtonIcon
  });

  ctx.inject(["settingsForm"], (scope) => {
    const $t = scope.i18n.$t;
    scope.settingsForm.declare({
      fields: () => [
        {
          key: "startButtonIconPerTheme",
          type: "boolean",
          title: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON_PER_THEME")
        },
        {
          key: "startButtonIcon",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON"),
          description: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON_HINT"),
          fileUpload: true,
          visibleWhen: "startButtonIconPerTheme=false"
        },
        {
          key: "startButtonIconLight",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON_LIGHT"),
          description: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON_HINT"),
          fileUpload: true,
          visibleWhen: "startButtonIconPerTheme"
        },
        {
          key: "startButtonIconDark",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON_DARK"),
          description: $t("TXT_CODE_DESKTOP_START_BUTTON_ICON_HINT"),
          fileUpload: true,
          visibleWhen: "startButtonIconPerTheme"
        },
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
          key: "wallpaperImagePerTheme",
          type: "boolean",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_PER_THEME"),
          visibleWhen: "wallpaperMode=image"
        },
        {
          key: "wallpaperImage",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE"),
          description: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_DESC"),
          fileUpload: true,
          visibleWhen: ["wallpaperMode=image", "wallpaperImagePerTheme=false"]
        },
        {
          key: "wallpaperImageLight",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_LIGHT"),
          description: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_DESC"),
          fileUpload: true,
          visibleWhen: ["wallpaperMode=image", "wallpaperImagePerTheme"]
        },
        {
          key: "wallpaperImageDark",
          type: "string",
          title: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_DARK"),
          description: $t("TXT_CODE_DESKTOP_WALLPAPER_IMAGE_DESC"),
          fileUpload: true,
          visibleWhen: ["wallpaperMode=image", "wallpaperImagePerTheme"]
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
      read: readSettings,
      write: async (values) => {
        const candidate = { ...settings, ...values };
        for (const key of [
          "wallpaperImage", "wallpaperImageLight", "wallpaperImageDark",
          "startButtonIcon", "startButtonIconLight", "startButtonIconDark"
        ] as const) {
          if (candidate[key] === null) candidate[key] = "";
        }
        const next = normalizeDesktopSettings(candidate);
        if (
          (Object.keys(next) as Array<keyof DesktopSettings>).some(
            (key) => next[key] !== candidate[key]
          )
        )
          throw new Error($t("TXT_CODE_DESKTOP_SETTINGS_INVALID"));
        await storage.store(CATEGORY, UUID, next);
        settings = next;
      }
    });
  });
  return readSettings;
}
