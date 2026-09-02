import type { PanelFrontendPluginContext } from "@/plugin";
import type { LayoutCardPoolItemFactory } from "@/config";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import { t } from "@/lang/i18n";
import { getRandomId } from "@/tools/randId";
import { NEW_CARD_TYPE } from "@/types";
import * as terminalApi from "./api";
import TerminalCore from "./components/TerminalCore.vue";
import TerminalTags from "./components/TerminalTags.vue";
import TerminalTopTags from "./components/TerminalTopTags.vue";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { encodeConsoleColor, useTerminal } from "./hooks/useTerminal";
import CommandHistory from "./widgets/instance/CommandHistory.vue";
import Terminal from "./widgets/instance/Terminal.vue";
import TermConfig from "./widgets/instance/dialogs/TermConfig.vue";
import DesktopTermConfig from "./desktop/DesktopTermConfig.vue";
import { CodeOutlined } from "@ant-design/icons-vue";
import { localeMessages } from "./i18n";

const instanceParams: ILayoutCardParams[] = [
  { field: "instanceId", label: t("TXT_CODE_e6a5c12b"), type: "string" },
  { field: "daemonId", label: t("TXT_CODE_72cfab69"), type: "string" },
  { field: "instance", label: t("TXT_CODE_cb043d10"), type: "instance" }
];

const terminalCard: LayoutCardPoolItemFactory = () => ({
  id: getRandomId(),
  permission: 1,
  meta: { viewType: "card" },
  type: "Terminal",
  title: t("TXT_CODE_71a51d19"),
  width: 6,
  description: t("TXT_CODE_10a6d36f"),
  height: LayoutCardHeight.BIG,
  category: NEW_CARD_TYPE.INSTANCE,
  params: instanceParams
});

const commandHistoryCard: LayoutCardPoolItemFactory = () => ({
  id: getRandomId(),
  permission: 1,
  meta: {},
  type: "InstanceCommandHistory",
  title: t("TXT_CODE_cmd_history"),
  width: 4,
  description: t("TXT_CODE_cmd_history"),
  height: LayoutCardHeight.MINI,
  category: NEW_CARD_TYPE.INSTANCE,
  params: instanceParams
});

export const inject = ["ui", "actions", "i18n"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.set("terminal", {
    api: terminalApi,
    Terminal,
    TerminalCore,
    TerminalTags,
    TerminalTopTags,
    useTerminal,
    useCommandHistory,
    encodeConsoleColor
  });

  ctx.ui.layoutCard("Terminal", Terminal);
  ctx.ui.layoutCard("InstanceCommandHistory", CommandHistory);
  ctx.ui.layoutCardPoolItem(terminalCard);
  ctx.ui.layoutCardPoolItem(commandHistoryCard);

  ctx.actions.instance({
    id: "terminal-config",
    title: () => t("TXT_CODE_d23631cb"),
    icon: CodeOutlined,
    normalComponent: TermConfig,
    desktopComponent: DesktopTermConfig,
    desktopInitialWidth: 700,
    desktopInitialHeight: 500
  });
}
