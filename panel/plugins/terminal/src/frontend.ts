import type { PanelFrontendPluginContext } from "@/plugin";
import { t } from "@/lang/i18n";
import * as terminalApi from "./api";
import TerminalCore from "./components/TerminalCore.vue";
import TerminalTags from "./components/TerminalTags.vue";
import TerminalTopTags from "./components/TerminalTopTags.vue";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { encodeConsoleColor, useTerminal } from "./hooks/useTerminal";
import TermConfig from "./widgets/instance/dialogs/TermConfig.vue";
import DesktopTermConfig from "./desktop/DesktopTermConfig.vue";
import { localeMessages } from "./i18n";

export const inject = ["console", "ui", "actions", "i18n", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.set("terminal", {
    api: terminalApi,
    TerminalCore,
    TerminalTags,
    TerminalTopTags,
    useTerminal,
    useCommandHistory,
    encodeConsoleColor
  });

  ctx.actions.instance({
    id: "terminal-config",
    title: () => t("TXT_CODE_d23631cb"),
    icon: "mdi-console-line",
    normalComponent: TermConfig,
    desktopComponent: DesktopTermConfig,
    desktopInitialWidth: 700,
    desktopInitialHeight: 500
  });
}
