import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { remoteNodeList } from "@elementspanel/epanel-plugin-console/services/apis";
import { arrayFilter } from "@elementspanel/epanel-plugin-console/tools/array";
import { computed, reactive, ref } from "vue";

import { QUICKSTART_ACTION_TYPE, QUICKSTART_METHOD } from "@elements-panel/sdk";
export { QUICKSTART_ACTION_TYPE, QUICKSTART_METHOD } from "@elements-panel/sdk";

export function useQuickStartFlow() {
  const { state: remoteNodes, execute, isReady, isLoading } = remoteNodeList();

  const currentIcon = ref("mdi-apps");

  interface ActionButtons {
    title: string;
    key: string;
    icon: string;
    click?: () => void;
  }

  const step1: ActionButtons[] = [
    {
      title: t("TXT_CODE_QUICK_START_MINECRAFT_JAVA"),
      key: QUICKSTART_ACTION_TYPE.Minecraft,
      icon: "mdi-apps"
    },
    {
      title: t("TXT_CODE_QUICK_START_MINECRAFT_BEDROCK"),
      key: QUICKSTART_ACTION_TYPE.Bedrock,
      icon: "mdi-apps"
    },
    {
      title: t("TXT_CODE_COMMON_HYTALE_SERVER"),
      key: QUICKSTART_ACTION_TYPE.Hytale,
      icon: "mdi-apps"
    },
    {
      title: t("TXT_CODE_QUICK_START_TERRARIA_SERVER"),
      key: QUICKSTART_ACTION_TYPE.Terraria,
      icon: "mdi-apps"
    },

    {
      title: t("TXT_CODE_COMMAND_ASSISTANT_STEAM_GAME_SERVER"),
      key: QUICKSTART_ACTION_TYPE.SteamGameServer,
      icon: "mdi-cart-outline"
    },
    {
      title: t("TXT_CODE_COMMON_CONSOLE_PROGRAM"),
      key: QUICKSTART_ACTION_TYPE.AnyApp,
      icon: "mdi-swap-horizontal"
    }
  ];

  const formData = reactive<{
    title: string;
    step: number;
    actions?: ActionButtons[];
    appType?: QUICKSTART_ACTION_TYPE;
    createMethod?: QUICKSTART_METHOD;
    daemonId?: string;
    emptyActionsText?: string;
    emptyActionsLink?: string;
  }>({
    title: t("TXT_CODE_COMMON_WHICH_TYPE_OF_INSTANCE_WOULD_YOU_LIKE_TO_DEPLOY"),
    step: 1,
    actions: step1
  });

  const toStep2 = async (appType: QUICKSTART_ACTION_TYPE) => {
    formData.appType = appType;

    formData.step = 2;
    formData.emptyActionsText = t("TXT_CODE_COMMON_NO_AVAILABLE_NODES_HINT");
    currentIcon.value = "mdi-database-outline";
    await execute();
    formData.actions = remoteNodes.value
      ?.filter((v) => v.available)
      ?.map((v) => {
        return {
          title: `${v.ip}:${v.port} (${v.remarks})`,
          key: v.uuid,
          icon: "mdi-source-branch"
        };
      });

    formData.title = t("TXT_CODE_COMMON_ON_WHICH_MACHINE_IS_THE_NEW_INSTANCE_DEPLOYED");
  };

  const toStep3 = (daemonId: string) => {
    formData.step = 3;
    formData.title = t("TXT_CODE_COMMON_HOW_WOULD_YOU_LIKE_TO_DEPLOY_THIS_INSTANCE");
    formData.daemonId = daemonId;
    currentIcon.value = "mdi-calculator-variant";
    formData.actions = arrayFilter<ActionButtons>([
      {
        title: t("TXT_CODE_COMMON_QUICK_DEPLOYMENT_FOR_MINECRAFT"),
        key: QUICKSTART_METHOD.FAST,
        icon: "mdi-apps",
        condition: () =>
          router.getRoutes().some((route) => route.path === "/quickstart/minecraft") &&
          (formData.appType === QUICKSTART_ACTION_TYPE.Minecraft ||
            formData.appType === QUICKSTART_ACTION_TYPE.Bedrock),
        click: () => {
          router.push({
            path: "/quickstart/minecraft",
            query: {
              daemonId
            }
          });
        }
      },
      {
        title: t("TXT_CODE_COMMON_QUICK_DEPLOYMENT_USING_DOCKER_IMAGE"),
        key: QUICKSTART_METHOD.DOCKER,
        icon: "mdi-code-tags"
      },
      {
        title: t("TXT_CODE_COMMON_UPLOAD_A_SERVER_CORE"),
        key: QUICKSTART_METHOD.FILE,
        icon: "mdi-cloud-upload-outline"
      },
      {
        title: t("TXT_CODE_COMMON_UPLOAD_A_COMPRESSED_SERVER_PACKAGE"),
        key: QUICKSTART_METHOD.IMPORT,
        icon: "mdi-folder-zip-outline"
      },
      {
        title: t("TXT_CODE_COMMON_SELECT_AN_EXISTING_SERVER_DIRECTORY"),
        key: QUICKSTART_METHOD.SELECT,
        icon: "mdi-folder-open-outline"
      },
      {
        title: t("TXT_CODE_COMMON_NO_ADDITIONAL_FILES_REQUIRED"),
        key: QUICKSTART_METHOD.EXIST,
        icon: "mdi-file-document-outline"
      }
    ]);
  };

  const toStep4 = (key: QUICKSTART_METHOD) => {
    formData.step = 4;
    formData.createMethod = key;
    currentIcon.value = "mdi-card-account-details-outline";
  };

  const toStep5 = (instanceId?: string) => {
    formData.step = 5;
    formData.title = t(
      "TXT_CODE_COMMON_CONGRATULATIONS_THE_INSTANCE_HAS_BEEN_CREATED_SUCCESSFULLY"
    );
    currentIcon.value = "mdi-emoticon-outline";

    formData.actions = arrayFilter<ActionButtons>([
      {
        title: t("TXT_CODE_COMMON_TO_TERMINAL_PAGE"),
        key: "console",
        icon: "mdi-code-tags",
        click: () => {
          const daemonId = formData.daemonId;
          router.push({
            path: "/instances/terminal",
            query: {
              daemonId,
              instanceId
            }
          });
        }
      },
      {
        title: t("TXT_CODE_COMMON_INSTANCE_FILE_MANAGEMENT"),
        key: "files",
        icon: "mdi-folder-open-outline",
        click: () => {
          const daemonId = formData.daemonId;
          router.push({
            path: "/instances/terminal/files",
            query: {
              daemonId,
              instanceId
            }
          });
        }
      },
      {
        title: t("TXT_CODE_COMMON_RETURN_TO_DASHBOARD"),
        key: "main",
        icon: "mdi-home-outline",
        click: () => {
          router.push({
            path: "/"
          });
        }
      }
    ]);
  };

  const isFormStep = computed(() => {
    return formData.step === 4;
  });

  const isNormalStep = computed(() => {
    return formData.step !== 4;
  });

  return {
    formData,
    toStep2,
    toStep3,
    toStep4,
    toStep5,
    isReady,
    isLoading,
    isFormStep,
    isNormalStep,
    currentIcon
  };
}
