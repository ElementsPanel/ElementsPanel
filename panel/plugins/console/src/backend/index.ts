import * as fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import type { PanelPluginContext } from "../../../../src/app/plugin";

const SAVE_DIR_PATH = "public/upload_files/";

const DEFAULT_PAGE_TITLE = "ElementsPanel";

/** Where older panels kept the site appearance, before it moved to SystemConfig. */
const LEGACY_LAYOUT_FILE = path.join(process.cwd(), "data", "layout.json");
const LEGACY_SETTINGS_PAGE = "__settings__";

type AppearanceValues = {
  pageTitle?: unknown;
  logoImage?: unknown;
  backgroundImage?: unknown;
};

type AppearanceConfig = {
  pageTitle?: string;
  logoImage?: string;
  backgroundImage?: string;
};

function readAppearance(config: AppearanceConfig) {
  return {
    pageTitle: config.pageTitle || DEFAULT_PAGE_TITLE,
    logoImage: config.logoImage || "",
    backgroundImage: config.backgroundImage || ""
  };
}

function writeAppearance(values: AppearanceValues, config: AppearanceConfig, save: () => void) {
  // `null` is sent by the clearable Vuetify input when an image is removed.
  // Only an omitted field should fall back to the persisted value; treating
  // null as missing writes the old image straight back.
  const valueOrCurrent = (value: unknown, currentValue: unknown) =>
    value === undefined ? currentValue : value;
  config.pageTitle =
    String(valueOrCurrent(values.pageTitle, config.pageTitle ?? DEFAULT_PAGE_TITLE)).trim() ||
    DEFAULT_PAGE_TITLE;
  config.logoImage = String(valueOrCurrent(values.logoImage, config.logoImage) ?? "");
  config.backgroundImage = String(
    valueOrCurrent(values.backgroundImage, config.backgroundImage) ?? ""
  );
  save();
}

/**
 * Site appearance used to live inside `data/layout.json` under the
 * `__settings__` pseudo page. It now belongs to SystemConfig; copy any saved
 * values over once so the title, logo and background survive the change.
 */
function migrateLegacyAppearance(config: AppearanceConfig, save: () => void) {
  const customized =
    (config.pageTitle && config.pageTitle !== DEFAULT_PAGE_TITLE) ||
    config.logoImage ||
    config.backgroundImage;
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
    save();
  } catch (error) {
    console.error("Failed to migrate legacy appearance settings:", error);
  }
}

function isSafeFileName(fileName: string) {
  return !/[\\/:*?"<>|]/.test(fileName) && !fileName.includes("..") && fileName.length > 0;
}

/**
 * The console owns the browser shell's appearance and its shared asset route.
 */
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

  migrateLegacyAppearance(settings.config, () => settings.save());

  ctx.inject(["settingsForm"], (settingsCtx) => settingsCtx.settingsForm.declare({
    fields: () => [
      {
        key: "pageTitle",
        type: "string",
        title: $t("TXT_CODE_395f147d"),
        description: $t("TXT_CODE_b305236a")
      },
      {
        key: "logoImage",
        type: "string",
        title: $t("TXT_CODE_47b5a2f7"),
        description: $t("TXT_CODE_cf95364f"),
        fileUpload: true
      },
      {
        key: "backgroundImage",
        type: "string",
        title: $t("TXT_CODE_8ae0dc90"),
        description: `${$t("TXT_CODE_434786c9")} ${$t("TXT_CODE_cf95364f")}`,
        fileUpload: true
      }
    ],
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
      if (!tmpFile) throw new Error($t("TXT_CODE_e4d6cc20"));
      if (!tmpFile.filepath || !fs.existsSync(tmpFile.filepath)) {
        throw new Error($t("TXT_CODE_1a499109"));
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
}
