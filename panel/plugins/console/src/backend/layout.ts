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
      page: "/instances",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "InstanceList",
          title: translate("TXT_CODE_e21473bc"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/instances/terminal",
      items: [
        {
          id: getRandomId(),
          meta: {
            viewType: "inner"
          },
          type: "Terminal",
          title: translate("TXT_CODE_4ccdd3a0"),
          width: 12,
          height: LayoutCardHeight.BIG,
          disableDelete: true
        },
        {
          id: "InstancePerformance",
          type: "InstancePerformance",
          title: translate("TXT_CODE_5476e012"),
          width: 8,
          height: LayoutCardHeight.MINI,
          meta: {}
        },
        {
          id: "InstanceCommandHistory",
          type: "InstanceCommandHistory",
          title: translate("TXT_CODE_cmd_history"),
          width: 4,
          height: LayoutCardHeight.MINI,
          meta: {}
        },
        {
          id: "InstanceBaseInfo",
          type: "InstanceBaseInfo",
          title: translate("TXT_CODE_eadb4f60"),
          width: 4,
          height: LayoutCardHeight.SMALL,
          meta: {}
        },
        {
          id: getRandomId(),
          meta: {},
          type: "InstanceManagerBtns",
          title: translate("TXT_CODE_efd37c48"),
          width: 8,
          height: LayoutCardHeight.SMALL,
          disableDelete: true
        }
      ]
    },
    {
      page: "/instances/terminal/files",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "InstanceFileManager",
          title: translate("TXT_CODE_ae533703"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/instances/terminal/serverConfig",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "InstanceServerConfigOverview",
          title: translate("TXT_CODE_d07742fe"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/instances/terminal/serverConfig/fileEdit",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "InstanceServerConfigFile",
          title: translate("TXT_CODE_1c45f7fe"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/instances/schedule",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "Schedule",
          title: translate("TXT_CODE_b7d026f8"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/users/resources",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "UserAccessSettings",
          title: translate("TXT_CODE_eb579d63"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/node",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "NodeList",
          title: translate("TXT_CODE_20509fa0"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/node/image",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "ImageManager",
          title: translate("TXT_CODE_e6c30866"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
      page: "/node/image/new",
      items: [
        {
          id: getRandomId(),
          meta: {},
          type: "NewImage",
          title: translate("TXT_CODE_3d09f0ac"),
          width: 12,
          height: LayoutCardHeight.AUTO,
          disableDelete: true
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
