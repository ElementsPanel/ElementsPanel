import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { hasInstanceContext } from "@elementspanel/epanel-plugin-console/hooks/useInstanceActionAvailability";
import { t } from "@elementspanel/epanel-plugin-i18n";
import * as terminalApi from "./api";
import TerminalCore from "./components/TerminalCore.vue";
import TerminalTags from "./components/TerminalTags.vue";
import TerminalTopTags from "./components/TerminalTopTags.vue";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { encodeConsoleColor, useTerminal } from "./hooks/useTerminal";
import TermConfig from "./widgets/instance/dialogs/TermConfig.vue";
import DesktopTermConfig from "./desktop/DesktopTermConfig.vue";
import DesktopTerminalSelector from "./desktop/DesktopTerminalSelector.vue";
import { defineComponent, h } from "vue";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";

export function apply(ctx: PanelFrontendPluginContext) {
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
    const selector = defineComponent(
      () => () =>
        h(DesktopTerminalSelector, {
          onOpenConsole: (instance: unknown, daemonId: string) =>
            ctx.get("instance")!.openConsole(instance, daemonId)
        })
    );
    const condition = () => useAppStateStore().isAdmin.value;
    scope.desktop.view({
      id: "terminal",
      component: selector,
      title: () => t("TXT_CODE_COMMON_TERMINAL"),
      icon: "mdi-code-tags",
      initialWidth: 980,
      initialHeight: 580,
      condition
    });
    scope.desktop.app({
      id: "terminal",
      view: "terminal",
      component: selector,
      label: () => t("TXT_CODE_COMMON_TERMINAL"),
      icon: "mdi-code-tags",
      color: "#434343",
      condition
    });
  });

  ctx.actions.instance({
    id: "terminal-config",
    title: () => t("TXT_CODE_COMMON_TERMINAL_SETTINGS"),
    icon: "mdi-code-tags",
    mdiIcon: "mdi-code-tags",
    normalComponent: TermConfig,
    desktopComponent: DesktopTermConfig,
    condition: hasInstanceContext,
    desktopInitialWidth: 700,
    desktopInitialHeight: 500
  });
}
