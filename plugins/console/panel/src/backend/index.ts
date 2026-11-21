import * as fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";

const SAVE_DIR_PATH = "public/upload_files/";

const DEFAULT_PAGE_TITLE = "ElementsPanel";

/** Where older panels kept the site appearance, before it moved to SystemConfig. */
const LEGACY_LAYOUT_FILE = path.join(process.cwd(), "data", "layout.json");
const LEGACY_SETTINGS_PAGE = "__settings__";

type AppearanceValues = {
  pageTitle?: unknown;
  logoImage?: unknown;
  logoImagePerTheme?: unknown;
  logoImageLight?: unknown;
  logoImageDark?: unknown;
  backgroundImage?: unknown;
  backgroundImagePerTheme?: unknown;
  backgroundImageLight?: unknown;
  backgroundImageDark?: unknown;
  backgroundImageBlur?: unknown;
};

type AppearanceConfig = {
  pageTitle?: string;
  logoImage?: string;
  logoImagePerTheme?: boolean;
  logoImageLight?: string;
  logoImageDark?: string;
  backgroundImage?: string;
  backgroundImagePerTheme?: boolean;
  backgroundImageLight?: string;
  backgroundImageDark?: string;
  backgroundImageBlur?: number;
};

function readAppearance(config: AppearanceConfig) {
  return {
    pageTitle: config.pageTitle || DEFAULT_PAGE_TITLE,
    logoImage: config.logoImage || "",
    logoImagePerTheme:
      config.logoImagePerTheme ??
      (config.logoImageLight !== undefined || config.logoImageDark !== undefined),
    logoImageLight: config.logoImageLight ?? config.logoImage ?? "",
    logoImageDark: config.logoImageDark ?? config.logoImage ?? "",
    backgroundImage: config.backgroundImage || "",
    backgroundImagePerTheme: config.backgroundImagePerTheme ?? false,
    backgroundImageLight: config.backgroundImageLight ?? config.backgroundImage ?? "",
    backgroundImageDark: config.backgroundImageDark ?? config.backgroundImage ?? "",
    backgroundImageBlur: config.backgroundImageBlur ?? 5
  };
}

function writeAppearance(values: AppearanceValues, config: AppearanceConfig, save: () => Promise<void>) {
  // Treat a clearable input's null as removal; only omitted fields retain the saved image.
  const valueOrCurrent = (value: unknown, currentValue: unknown) =>
    value === undefined ? currentValue : value;
  config.pageTitle =
    String(valueOrCurrent(values.pageTitle, config.pageTitle ?? DEFAULT_PAGE_TITLE)).trim() ||
    DEFAULT_PAGE_TITLE;
  config.logoImage = String(valueOrCurrent(values.logoImage, config.logoImage) ?? "");
  if (values.logoImagePerTheme !== undefined) {
    config.logoImagePerTheme = values.logoImagePerTheme === true;
  }
  if (values.logoImageLight !== undefined) {
    config.logoImageLight = String(values.logoImageLight ?? "");
  }
  if (values.logoImageDark !== undefined) {
    config.logoImageDark = String(values.logoImageDark ?? "");
  }
  config.backgroundImage = String(
    valueOrCurrent(values.backgroundImage, config.backgroundImage) ?? ""
  );
  if (values.backgroundImagePerTheme !== undefined) {
    config.backgroundImagePerTheme = values.backgroundImagePerTheme === true;
  }
  if (values.backgroundImageLight !== undefined) {
    config.backgroundImageLight = String(values.backgroundImageLight ?? "");
  }
  if (values.backgroundImageDark !== undefined) {
    config.backgroundImageDark = String(values.backgroundImageDark ?? "");
  }
  config.backgroundImageBlur = Number(
    valueOrCurrent(values.backgroundImageBlur, config.backgroundImageBlur) ?? 5
  );
  return save();
}

/** Migrate saved appearance from layout.json to SystemConfig once. */
async function migrateLegacyAppearance(config: AppearanceConfig, save: () => Promise<void>) {
  const customized =
    (config.pageTitle && config.pageTitle !== DEFAULT_PAGE_TITLE) ||
    config.logoImage ||
    config.logoImagePerTheme !== undefined ||
    config.logoImageLight !== undefined ||
    config.logoImageDark !== undefined ||
    config.backgroundImage ||
    config.backgroundImagePerTheme ||
    config.backgroundImageLight !== undefined ||
    config.backgroundImageDark !== undefined;
  if (customized) return;
  try {
    if (!fs.existsSync(LEGACY_LAYOUT_FILE)) return;
    const layout = JSON.parse(fs.readFileSync(LEGACY_LAYOUT_FILE, "utf8")) as unknown;
    if (!Array.isArray(layout)) return;
    const page = layout.find((item: any) => item?.page === LEGACY_SETTINGS_PAGE);
    const theme = page?.theme as AppearanceValues | undefined;
    if (!theme) return;
    if (theme.pageTitle) config.pageTitle = String(theme.pageTitle);
    if (theme.logoImage) config.logoImage = String(theme.logoImage);
    if (theme.backgroundImage) config.backgroundImage = String(theme.backgroundImage);
    await save();
  } catch (error) {
    console.error("Failed to migrate legacy appearance settings:", error);
  }
}

function isSafeFileName(fileName: string) {
  return !/[\\/:*?"<>|]/.test(fileName) && !fileName.includes("..") && fileName.length > 0;
}

export const inject = [
  "koa",
  "i18n",
  "middleware",
  "roles",
  "globals",
  "settings"
];

export function apply(ctx: PanelPluginContext) {
  const $t = ctx.i18n.$t;
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });
  const settings = ctx.settings;

  const migration = migrateLegacyAppearance(settings.config, () => settings.save());

  ctx.inject(["settingsForm"], (settingsCtx) => settingsCtx.settingsForm.declare({
    defaults: () => readAppearance({}),
    fields: () => {
      const brandingPage = { id: "branding", title: $t("TXT_CODE_SETTINGS_PAGE_BRANDING") };
      const backgroundPage = { id: "background", title: $t("TXT_CODE_SETTINGS_PAGE_BACKGROUND") };
      return [
        {
          key: "pageTitle",
          page: brandingPage,
          type: "string",
          title: $t("TXT_CODE_COMMON_PAGE_TITLE"),
          description: $t("TXT_CODE_COMMON_THIS_CHANGES_THE_PAGE_TITLE_OF_THE_BROWSER_TAB_LEAVE_BLANK_TO_RESET_TO_DEFAULT")
        },
        {
          key: "logoImagePerTheme",
          page: brandingPage,
          type: "boolean",
          title: $t("TXT_CODE_CONSOLE_LOGO_PER_THEME")
        },
        {
          key: "logoImage",
          page: brandingPage,
          type: "string",
          title: $t("TXT_CODE_CONSOLE_LOGO"),
          description: $t("TXT_CODE_CONSOLE_LOGO_HINT"),
          fileUpload: true,
          visibleWhen: "logoImagePerTheme=false"
        },
        {
          key: "logoImageLight",
          page: brandingPage,
          type: "string",
          title: $t("TXT_CODE_CONSOLE_LOGO_LIGHT"),
          description: $t("TXT_CODE_CONSOLE_LOGO_HINT"),
          fileUpload: true,
          visibleWhen: "logoImagePerTheme"
        },
        {
          key: "logoImageDark",
          page: brandingPage,
          type: "string",
          title: $t("TXT_CODE_CONSOLE_LOGO_DARK"),
          description: $t("TXT_CODE_CONSOLE_LOGO_HINT"),
          fileUpload: true,
          visibleWhen: "logoImagePerTheme"
        },
        {
          key: "backgroundImagePerTheme",
          page: backgroundPage,
          type: "boolean",
          title: $t("TXT_CODE_CONSOLE_BACKGROUND_IMAGE_PER_THEME")
        },
        {
          key: "backgroundImage",
          page: backgroundPage,
          type: "string",
          title: $t("TXT_CODE_COMMON_UI_BACKGROUND_IMAGE"),
          description: $t("TXT_CODE_COMMON_THIS_FEATURE_MAY_BE_UNSTABLE_CANNOT_GUARANTEE_BEST_USER_EXPERIENCE"),
          fileUpload: true,
          visibleWhen: "backgroundImagePerTheme=false"
        },
        {
          key: "backgroundImageLight",
          page: backgroundPage,
          type: "string",
          title: $t("TXT_CODE_CONSOLE_BACKGROUND_IMAGE_LIGHT"),
          description: $t("TXT_CODE_COMMON_THIS_FEATURE_MAY_BE_UNSTABLE_CANNOT_GUARANTEE_BEST_USER_EXPERIENCE"),
          fileUpload: true,
          visibleWhen: "backgroundImagePerTheme"
        },
        {
          key: "backgroundImageDark",
          page: backgroundPage,
          type: "string",
          title: $t("TXT_CODE_CONSOLE_BACKGROUND_IMAGE_DARK"),
          description: $t("TXT_CODE_COMMON_THIS_FEATURE_MAY_BE_UNSTABLE_CANNOT_GUARANTEE_BEST_USER_EXPERIENCE"),
          fileUpload: true,
          visibleWhen: "backgroundImagePerTheme"
        },
        {
          key: "backgroundImageBlur",
          page: backgroundPage,
          type: "number",
          control: "slider",
          title: $t("TXT_CODE_CONSOLE_BACKGROUND_IMAGE_BLUR"),
          min: 0,
          max: 50,
          unit: "px"
        }
      ];
    },
    read: () => readAppearance(settings.config),
    write: (values) => writeAppearance(values, settings.config, () => settings.save())
  }));

  const router = ctx.koa.router("/api/overview");

  // The frontend shell reads the appearance before authentication is restored.
  router.get("/appearance", async (requestCtx) => {
    requestCtx.body = readAppearance(settings.config);
  });

  router.post("/upload_assets", requireAdmin, async (requestCtx) => {
    const files = requestCtx.request.files?.file;
    const tmpFile = Array.isArray(files) ? files[0] : files;
    try {
      if (!tmpFile) throw new Error($t("TXT_CODE_COMMON_REQUEST_BODY_ERROR"));
      if (!tmpFile.filepath || !fs.existsSync(tmpFile.filepath)) {
        throw new Error($t("TXT_CODE_COMMON_FILE_DOES_NOT_EXIST"));
      }
      const newFileName = v4() + path.extname(tmpFile.originalFilename || "");
      if (!isSafeFileName(newFileName)) throw new Error("Access denied: Malformed file name");
      const saveDirPath = path.join(process.cwd(), SAVE_DIR_PATH);
      if (!fs.existsSync(saveDirPath)) fs.mkdirsSync(saveDirPath);
      await fs.move(tmpFile.filepath, path.join(saveDirPath, newFileName));
      requestCtx.body = newFileName;
    } finally {
      if (Array.isArray(files)) {
        files.forEach((file) => {
          if (file?.filepath) fs.remove(file.filepath, () => { });
        });
      } else if (tmpFile?.filepath) {
        fs.remove(tmpFile.filepath, () => { });
      }
    }
  });
  return migration;
}
