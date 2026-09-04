import Router from "@koa/router";
import * as fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import { configureLayout, LayoutService } from "./layout";
import type { PanelPluginContext } from "../../../../src/app/plugin";

const SAVE_DIR_PATH = "public/upload_files/";

const DEFAULT_PAGE_TITLE = "ElementsPanel";
const SETTINGS_PAGE = "__settings__";

type AppearanceValues = {
  sidebarPosition?: unknown;
  pageTitle?: unknown;
  logoImage?: unknown;
  backgroundImage?: unknown;
};

function readLayout(getLayout: () => string): IPageLayoutConfig[] {
  const layout = JSON.parse(getLayout()) as unknown;
  if (!Array.isArray(layout)) throw new Error("Invalid frontend layout configuration.");
  return layout as IPageLayoutConfig[];
}

function settingsPage(layout: IPageLayoutConfig[]) {
  let page = layout.find((item) => item.page === SETTINGS_PAGE);
  if (!page) {
    page = { page: SETTINGS_PAGE, items: [] };
    layout.unshift(page);
  }
  return page;
}

function readAppearance(getLayout: () => string) {
  const theme = settingsPage(readLayout(getLayout)).theme;
  return {
    sidebarPosition: theme?.sidebarPosition === "right" ? "right" : "left",
    pageTitle: theme?.pageTitle || DEFAULT_PAGE_TITLE,
    logoImage: theme?.logoImage || "",
    backgroundImage: theme?.backgroundImage || ""
  };
}

function writeAppearance(
  values: AppearanceValues,
  getLayout: () => string,
  setLayout: (config: IPageLayoutConfig[]) => void
) {
  const layout = readLayout(getLayout);
  const page = settingsPage(layout);
  const current = page.theme ?? {
    pageTitle: DEFAULT_PAGE_TITLE,
    logoImage: "",
    backgroundImage: ""
  };
  const sidebarPosition = String(values.sidebarPosition ?? current.sidebarPosition ?? "left");
  page.theme = {
    ...current,
    pageTitle: String(values.pageTitle ?? current.pageTitle ?? DEFAULT_PAGE_TITLE).trim() || DEFAULT_PAGE_TITLE,
    logoImage: String(values.logoImage ?? current.logoImage ?? ""),
    backgroundImage: String(values.backgroundImage ?? current.backgroundImage ?? ""),
    sidebarPosition: sidebarPosition === "right" ? "right" : "left"
  };
  setLayout(layout);
}

function isSafeFileName(fileName: string) {
  return !/[\\/:*?"<>|]/.test(fileName) && !fileName.includes("..") && fileName.length > 0;
}

/**
 * The console owns the browser shell's appearance and its layout asset routes.
 * The layout service itself remains shared with feature plugins because default
 * layouts include cards contributed by those plugins.
 */
export const inject = [
  "koa",
  "i18n",
  "middleware",
  "roles",
  "globals"
];

export function apply(ctx: PanelPluginContext) {
  configureLayout(ctx);
  ctx.plugin(LayoutService);
  const getLayout = () => {
    const layout = ctx.get("layout");
    if (!layout) throw new Error("Panel layout service is unavailable.");
    return layout;
  };
  const $t = ctx.i18n.$t;
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });

  ctx.inject(["settingsForm"], (settingsCtx) => settingsCtx.settingsForm.declare({
    fields: () => [
      {
        key: "sidebarPosition",
        type: "select",
        title: $t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_TITLE"),
        description: $t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_DESCRIPTION"),
        options: [
          {
            value: "left",
            label: $t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_LEFT")
          },
          {
            value: "right",
            label: $t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_RIGHT")
          }
        ]
      },
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
      },
      {
        type: "link",
        title: $t("TXT_CODE_bc46c15b"),
        route: "/console/design"
      }
    ],
    read: () => readAppearance(() => getLayout().get()),
    write: (values) =>
      writeAppearance(values, () => getLayout().get(), (config) => getLayout().set(config))
  }));

  const router = ctx.koa.router("/api/overview");

  // The frontend shell reads layout before authentication is restored.
  router.get("/layout", async (requestCtx) => {
    requestCtx.body = getLayout().get();
  });

  router.post("/layout", requireAdmin, async (requestCtx) => {
    getLayout().set(requestCtx.request.body as IPageLayoutConfig[]);
    requestCtx.body = true;
  });

  router.delete("/layout", requireAdmin, async (requestCtx) => {
    getLayout().reset();
    requestCtx.body = true;
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
