import fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import { Service, type Context } from "cordis";
import type { PanelLayoutService, PanelPluginContext } from "../../../../src/app/plugin";

const SAVE_DIR_PATH = "public/upload_files/";
const DATA_DIR = path.join(process.cwd(), "data");
const LAYOUT_FILE = path.join(DATA_DIR, "layout.json");
let translate: (key: string) => string = (key) => key;
let globals: PanelPluginContext["globals"] | undefined;

export function configureLayout(ctx: PanelPluginContext) {
  translate = (key) => String(ctx.i18n.$t(key));
  globals = ctx.globals;
}

export class LayoutService extends Service implements PanelLayoutService {
  private readonly pages = new Set<() => IPageLayoutConfig>();

  constructor(ctx: Context) {
    super(ctx, "layout", true);
  }
  get() {
    return getFrontendLayoutConfig([...this.pages].map((page) => page()));
  }
  set(config: IPageLayoutConfig[]) { setFrontendLayoutConfig(config); }
  reset() { resetFrontendLayoutConfig(); }

  provide(page: () => IPageLayoutConfig) {
    return this.ctx.effect(() => {
      this.pages.add(page);
      return () => this.pages.delete(page);
    });
  }
}

function getRandomId() {
  return v4();
}

export function getFrontendLayoutConfig(pluginPages: IPageLayoutConfig[] = []): string {
  let layoutConfig: string = "";
  if (fs.existsSync(LAYOUT_FILE)) {
    layoutConfig = fs.readFileSync(LAYOUT_FILE, "utf8");
  }
  if (layoutConfig) {
    if (globals?.get("versionChange")) {
      const latestLayoutConfig = [...getDefaultFrontendLayoutConfig(), ...pluginPages];
      const currentLayoutConfig = JSON.parse(layoutConfig) as IPageLayoutConfig[];
      for (const page of latestLayoutConfig) {
        if (!currentLayoutConfig.find((item) => item.page === page.page)) {
          currentLayoutConfig.push(page);
        }
      }
      globals?.set("versionChange", null);
      setFrontendLayoutConfig(currentLayoutConfig);
      return JSON.stringify(currentLayoutConfig);
    }
    // A newly enabled plugin gets its defaults immediately, without replacing
    // any saved customization or waiting for a panel version change.
    const currentLayoutConfig = JSON.parse(layoutConfig) as IPageLayoutConfig[];
    for (const page of pluginPages) {
      if (!currentLayoutConfig.some((item) => item.page === page.page)) {
        currentLayoutConfig.push(page);
      }
    }
    return JSON.stringify(currentLayoutConfig);
  } else {
    return JSON.stringify([...getDefaultFrontendLayoutConfig(), ...pluginPages]);
  }
}

export function setFrontendLayoutConfig(config: IPageLayoutConfig[]) {
  fs.ensureDirSync(DATA_DIR);
  fs.writeFileSync(LAYOUT_FILE, JSON.stringify(config, null, 2), "utf8");
}

export function resetFrontendLayoutConfig() {
  if (fs.existsSync(LAYOUT_FILE)) fs.removeSync(LAYOUT_FILE);
  const filesDir = path.join(process.cwd(), SAVE_DIR_PATH);
  if (fs.existsSync(filesDir)) {
    for (const fileName of fs.readdirSync(filesDir)) {
      fs.remove(path.join(filesDir, fileName), () => { });
    }
  }
}

export enum LayoutCardHeight {
  MINI = "100px",
  SMALL = "200px",
  MEDIUM = "400px",
  BIG = "600px",
  LARGE = "800px",
  AUTO = "unset"
}

function getDefaultFrontendLayoutConfig(): IPageLayoutConfig[] {
  return [
    {
      page: "__settings__",
      items: [],
      theme: {
        pageTitle: "ElementsPanel",
        logoImage: "",
        backgroundImage: ""
      }
    },
    {
      page: "/quickstart",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "QuickStartFlow",
          title: translate("TXT_CODE_9b99b72e"),
          width: 8,
          height: LayoutCardHeight.AUTO
        }
      ]
    },
    {
      page: "/quickstart/minecraft",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "McPreset",
          title: "",
          width: 12,
          height: LayoutCardHeight.AUTO
        },
        {
          id: getRandomId(),
          meta: {},
          type: "EmptyCard",
          title: "",
          width: 12,
          height: LayoutCardHeight.MINI
        }
      ]
    },
    {
      page: "/customer",
      items: [
        {
          id: getRandomId(),
          type: "UserStatusBlock",
          title: translate("TXT_CODE_7411336e"),
          meta: {
            type: "instance_all"
          },
          width: 3,
          height: LayoutCardHeight.SMALL,
          disableDelete: true
        },
        {
          id: getRandomId(),
          type: "UserStatusBlock",
          title: translate("TXT_CODE_f912fadc"),
          meta: {
            type: "instance_running"
          },
          width: 3,
          height: LayoutCardHeight.SMALL,
          disableDelete: true
        },
        {
          id: getRandomId(),
          type: "UserStatusBlock",
          title: translate("TXT_CODE_15f2e564"),
          meta: {
            type: "instance_stop"
          },
          width: 3,
          height: LayoutCardHeight.SMALL,
          disableDelete: true
        },
        {
          id: getRandomId(),
          type: "UserStatusBlock",
          title: translate("TXT_CODE_342a04a9"),
          meta: {
            type: "instance_error"
          },
          width: 3,
          height: LayoutCardHeight.SMALL,
          disableDelete: true
        },
        {
          id: getRandomId(),
          type: "UserInstanceList",
          title: translate("TXT_CODE_d655beec"),
          meta: {
            type: "instance_error"
          },
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
        }
      ]
    },
    {
      page: "/404",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "Page404",
          title: translate("TXT_CODE_6aa286df"),
          width: 6,
          height: LayoutCardHeight.MINI,
          disableDelete: true
        }
      ]
    }
  ];
}
