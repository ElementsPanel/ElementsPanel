import type {
  PanelFrontendInstanceActionContext,
  PanelFrontendPluginContext
} from "@/plugin";
import { TYPE_MINECRAFT_BEDROCK, TYPE_MINECRAFT_JAVA } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { UsergroupDeleteOutlined } from "@ant-design/icons-vue";
import DesktopMcPing from "./desktop/DesktopMcPing.vue";
import McPingSettings from "./normal/McPingSettings.vue";

const isMinecraftStatusAvailable = ({
  daemon,
  instanceInfo,
  isGlobalTerminal
}: PanelFrontendInstanceActionContext) => {
  if (isGlobalTerminal) return false;
  if (!(daemon as any)?.features?.mcstats) return false;
  const type = String((instanceInfo as any)?.config?.type ?? "");
  return type.startsWith(TYPE_MINECRAFT_JAVA) || type.startsWith(TYPE_MINECRAFT_BEDROCK);
};

export const inject = ["actions"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.actions.instance({
    id: "mcstats",
    title: () => t("TXT_CODE_40241d8e"),
    icon: UsergroupDeleteOutlined,
    normalComponent: McPingSettings,
    desktopComponent: DesktopMcPing,
    condition: isMinecraftStatusAvailable,
    desktopInitialWidth: 500,
    desktopInitialHeight: 400
  });
}
