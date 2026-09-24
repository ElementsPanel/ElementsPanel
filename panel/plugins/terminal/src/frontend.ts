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
import DesktopTerminalSelector from "./desktop/DesktopTerminalSelector.vue";
import { defineComponent, h } from "vue";
import { useAppStateStore } from "@/stores/useAppStateStore";

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

  ctx.inject(["node", "desktop"], (scope) => {
    const selector = defineComponent(() => () => h(DesktopTerminalSelector, {
      onOpenConsole: (instance: unknown, daemonId: string) => scope.instance.openConsole(instance, daemonId)
    }));
    const condition = () => useAppStateStore().isAdmin.value;
    scope.desktop.view({ id: "terminal", component: selector, title: () => t("TXT_CODE_524e3036"),
      icon: "mdi-code-tags", initialWidth: 980, initialHeight: 580, condition });
    scope.desktop.app({ id: "terminal", view: "terminal", component: selector,
      label: () => t("TXT_CODE_524e3036"), icon: "mdi-code-tags", color: "#434343", condition });
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
