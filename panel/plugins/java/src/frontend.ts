import { t } from "@/lang/i18n";
import type { PanelFrontendInstanceActionContext, PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_NUKKIT } from "@/hooks/useInstance";
import DesktopJavaManager from "./desktop/DesktopJavaManager.vue";
import { localeMessages } from "./i18n";
import JavaManager from "./normal/JavaManager.vue";
import JavaSetup from "./components/JavaSetup.vue";

const isJavaManagerAvailable = ({
  daemon,
  instanceInfo,
  isGlobalTerminal
}: PanelFrontendInstanceActionContext) => {
  if (isGlobalTerminal) return false;
  const config = (instanceInfo as any)?.config;
  if (
    (!config?.type?.includes(TYPE_MINECRAFT_JAVA) && config?.type !== TYPE_MINECRAFT_NUKKIT) ||
    config.processType !== "general"
  ) {
    return false;
  }
  if (!(daemon as any)?.features?.javaManager) return false;
  const { state, isAdmin } = useAppStateStore();
  return state.settings.allowJavaManager || isAdmin.value;
};

export const inject = ["console", "i18n", "actions", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.set("java", { setupComponent: JavaSetup });
  ctx.actions.instance({
    id: "java-manager",
    title: () => t("TXT_CODE_3fee13ed"),
    icon: "mdi-hammer-wrench",
    normalComponent: JavaManager,
    desktopComponent: DesktopJavaManager,
    condition: isJavaManagerAvailable,
    desktopInitialWidth: 800,
    desktopInitialHeight: 600
  });
}
