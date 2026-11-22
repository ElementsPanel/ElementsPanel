import { usePluginService } from "@elements-panel/sdk";
import { GLOBAL_INSTANCE_UUID } from "@elementspanel/epanel-plugin-console/config/const";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import type { ComputedNodeInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import {
  SocketStatus,
  useSocketIoClient
} from "@elementspanel/epanel-plugin-console/hooks/useSocketIo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { arrayFilter } from "@elementspanel/epanel-plugin-console/tools/array";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { computed, onMounted, ref, type Ref } from "vue";
import { useNodeOperations } from "../services/nodeOperations";

interface Options {
  remoteNode: Ref<ComputedNodeInfo | undefined>;
  openDetails: (node: ComputedNodeInfo, uuid: string) => void;
}

export function useNodeCard(options: Options) {
  const { remoteNode, openDetails } = options;

  const operations = useNodeOperations();
  const { testFrontendSocket, socketStatus } = useSocketIoClient();

  const compatMenuOpen = ref(false);

  const compatPanelVersionText = computed(() => {
    const version = remoteNode.value?.compatibility?.version;
    if (!version?.panelVersion) return "--";
    return `${version.panelVersion}（${t("TXT_CODE_NODE_COMPAT_REQUIRED_NODE")} ${
      version.requiredDaemonVersion
    }）`;
  });

  const tryConnectNode = async (uuid: string, showMsg = true) => {
    try {
      await operations.connect(uuid);
      if (showMsg) message.success(t("TXT_CODE_COMMON_OPERATION_SUCCESSFUL"));
    } catch (error: any) {
      reportErrorMsg(t("TXT_CODE_COMMON_OPERATION_FAILED"));
    }
  };

  const { toPage } = useAppRouters();

  const detailList = (node: ComputedNodeInfo) => [
    {
      title: t("TXT_CODE_COMMON_CONNECTION_ADDRESS"),
      value: `${node.ip}:${node.port}`,
      fullWidth: true
    },
    {
      title: t("TXT_CODE_COMMON_NODE_STATUS"),
      value: node.available ? t("TXT_CODE_COMMON_ONLINE") : t("TXT_CODE_COMMON_OFFLINE"),
      warn: node.available === false,
      success: node.available === true,
      danger: node.available === false,
      warnText: t("TXT_CODE_NODE_CONNECTION_TROUBLESHOOTING_HINT")
    },
    {
      title: t("TXT_CODE_COMMON_FRONTEND_CONNECTION"),
      value:
        socketStatus.value === SocketStatus.Connected
          ? t("TXT_CODE_COMMON_NORMAL")
          : t("TXT_CODE_COMMON_ABNORMAL"),
      warn: socketStatus.value === SocketStatus.Error,
      success: socketStatus.value === SocketStatus.Connected,
      loading: socketStatus.value === SocketStatus.Connecting,
      danger: socketStatus.value === SocketStatus.Error,
      warnText: t(
        "TXT_CODE_COMMON_THE_WEB_FRONT_END_CANNOT_ESTABLISH_A_WEB_SOCKET_CONNECTION_WITH_THE_NODE_PLEASE_CHECK_THE"
      )
    },
    {
      title: t("TXT_CODE_COMMON_INSTANCES_STATUS"),
      value: node.instanceStatus
    },

    {
      title: t("TXT_CODE_COMMON_PLATFORM"),
      value: node.platformText
    },
    {
      title: t("TXT_CODE_NODE_COMPAT"),
      value:
        node.brand !== "ElementsPanel"
          ? t("TXT_CODE_NODE_COMPAT_MCSM")
          : !node.available || !node.compatibility
          ? "--"
          : node.compatibility.ok
          ? t("TXT_CODE_NODE_COMPAT_OK")
          : t("TXT_CODE_NODE_COMPAT_BAD"),
      success: node.available === true && node.compatibility?.ok === true,
      warn:
        node.brand === "ElementsPanel" &&
        node.available === true &&
        node.compatibility != null &&
        node.compatibility.ok === false,
      warnText: t(
        "TXT_CODE_COMMON_THE_NODE_S_PLUGINS_OR_VERSION_DO_NOT_MATCH_THE_PANEL_WHICH_MAY_CAUSE_FUNCTIONAL_ISSUES"
      ),
      danger: node.brand !== "ElementsPanel",
      compatibility: true
    },
    {
      title: "Daemon ID",
      value: node.uuid,
      onlyCopy: true
    }
  ];

  const nodeOperations = computed(() =>
    arrayFilter([
      {
        title: t("TXT_CODE_COMMON_FILE_MANAGEMENT"),
        icon: "mdi-folder-open-outline",
        click: (item: ComputedNodeInfo) => {
          const daemonId = item.uuid;
          const instanceId = GLOBAL_INSTANCE_UUID;
          toPage({
            path: "/instances/terminal/files",
            query: {
              daemonId,
              instanceId
            }
          });
        },
        condition: () => remoteNode.value!.available && !!usePluginService("instance")
      },
      {
        title: t("TXT_CODE_COMMON_TERMINAL"),
        icon: "mdi-console-line",
        click: (item: ComputedNodeInfo) => {
          const daemonId = item.uuid;
          const instanceId = GLOBAL_INSTANCE_UUID;
          toPage({
            path: "/instances/terminal",
            query: {
              daemonId,
              instanceId
            }
          });
        },
        condition: () => remoteNode.value!.available && !!usePluginService("instance")
      },
      {
        title: t("TXT_CODE_COMMON_MANAGE_IMAGES"),
        icon: "mdi-image-outline",
        click: (item: ComputedNodeInfo) => {
          const daemonId = item.uuid;
          toPage({
            path: "/node/image",
            query: {
              daemonId
            }
          });
        },
        condition: () => remoteNode.value!.available
      },
      {
        title: t("TXT_CODE_COMMON_RECONNECT"),
        icon: "mdi-refresh",
        click: async (node: ComputedNodeInfo) => {
          await tryConnectNode(node.uuid);
        },
        condition: () => !remoteNode.value!.available
      },
      {
        title: t("TXT_CODE_COMMON_SETTINGS"),
        icon: "mdi-cog-outline",
        click: (node: ComputedNodeInfo) => {
          openDetails(node, node.uuid);
        }
      }
    ])
  );

  const copyValue = async (value: unknown) => {
    if (value == null) return;
    await navigator.clipboard?.writeText(String(value));
    message.success(t("TXT_CODE_COMMON_OPERATION_SUCCESSFUL"));
  };

  onMounted(() => {
    testFrontendSocket(remoteNode.value);
  });

  return {
    operations,
    compatMenuOpen,
    compatPanelVersionText,
    tryConnectNode,
    detailList,
    nodeOperations,
    copyValue
  };
}
