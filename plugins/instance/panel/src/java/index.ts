import { t } from "@/lang/i18n";
import type { PanelFrontendInstanceActionContext, PanelFrontendPluginContext } from "@/plugin";
import { hasNodeFeature, isScopedInstance } from "@/hooks/useInstanceActionAvailability";
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUNGEECORD
} from "@/hooks/useInstance";
import { isJavaCommand } from "../../../../../core/common/src/java";
import DesktopJavaManager from "./desktop/DesktopJavaManager.vue";
import JavaManager from "./normal/JavaManager.vue";
import JavaSetup from "./components/JavaSetup.vue";

const isJavaManagerAvailable = (context: PanelFrontendInstanceActionContext) => {
  if (!isScopedInstance(context)) return false;
  const config = (context.instanceInfo as any)?.config;
  const type = config?.type;
  const needsJava =
    type === TYPE_MINECRAFT_JAVA ||
    type === TYPE_MINECRAFT_BUNGEECORD ||
    (type === TYPE_MINECRAFT_BEDROCK &&
      (config?.java?.id || isJavaCommand(config?.startCommand || "")));
  if (!needsJava || config?.processType !== "general") {
    return false;
  }
  if (!hasNodeFeature(context, "javaManager")) return false;
  const { state, isAdmin } = useAppStateStore();
  return state.settings.allowJavaManager || isAdmin.value;
};

export function registerJavaManager(ctx: PanelFrontendPluginContext) {
  ctx.set("java", { setupComponent: JavaSetup });
  ctx.actions.instance({
    id: "java-manager",
    title: () => t("TXT_CODE_3fee13ed"),
    icon: "mdi-language-java",
    mdiIcon: "mdi-language-java",
    normalComponent: JavaManager,
    desktopComponent: DesktopJavaManager,
    condition: isJavaManagerAvailable,
    desktopInitialWidth: 800,
    desktopInitialHeight: 600
  });
}
