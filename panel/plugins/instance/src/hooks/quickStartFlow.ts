import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { remoteNodeList } from "@/services/apis";
import { arrayFilter } from "@/tools/array";
import { computed, reactive, ref } from "vue";

export enum QUICKSTART_ACTION_TYPE {
  Minecraft = "minecraft",
  Bedrock = "bedrock",
  Hytale = "hytale",
  Terraria = "terraria",
  SteamGameServer = "steam",
  Docker = "docker",
  AnyApp = "universal"
}

export enum QUICKSTART_METHOD {
  FAST = "FAST",
  FILE = "FILE",
  IMPORT = "IMPORT",
  SELECT = "SELECT",
  EXIST = "EXIST",
  DOCKER = "DOCKER"
}

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
      title: t("TXT_CODE_9e3f25e0"),
      key: QUICKSTART_ACTION_TYPE.Minecraft,
      icon: "mdi-apps"
    },
    {
      title: t("TXT_CODE_c8261c85"),
      key: QUICKSTART_ACTION_TYPE.Bedrock,
      icon: "mdi-apps"
    },
    {
      title: t("TXT_CODE_2025658e"),
      key: QUICKSTART_ACTION_TYPE.Hytale,
      icon: "mdi-apps"
    },
    {
      title: t("TXT_CODE_dbefcc6c"),
      key: QUICKSTART_ACTION_TYPE.Terraria,
      icon: "mdi-apps"
    },

    {
      title: t("TXT_CODE_dd8d27ce"),
      key: QUICKSTART_ACTION_TYPE.SteamGameServer,
      icon: "mdi-cart-outline"
    },
    {
      title: t("TXT_CODE_e08e63b5"),
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
    title: t("TXT_CODE_724ce74d"),
    step: 1,
    actions: step1
  });

  const toStep2 = async (appType: QUICKSTART_ACTION_TYPE) => {
    formData.appType = appType;

    formData.step = 2;
    formData.emptyActionsText = t("TXT_CODE_9337bed1");
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

    formData.title = t("TXT_CODE_d182c422");
  };

  const toStep3 = (daemonId: string) => {
    formData.step = 3;
    formData.title = t("TXT_CODE_49981cb9");
    formData.daemonId = daemonId;
    currentIcon.value = "mdi-calculator-variant";
    formData.actions = arrayFilter<ActionButtons>([
      {
        title: t("TXT_CODE_266b7246"),
        key: QUICKSTART_METHOD.FAST,
        icon: "mdi-apps",
        condition: () =>
          formData.appType === QUICKSTART_ACTION_TYPE.Minecraft ||
          formData.appType === QUICKSTART_ACTION_TYPE.Bedrock,
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
        title: t("TXT_CODE_acd4abda"),
        key: QUICKSTART_METHOD.DOCKER,
        icon: "mdi-code-tags"
      },
      {
        title: t("TXT_CODE_444db70f"),
        key: QUICKSTART_METHOD.FILE,
        icon: "mdi-cloud-upload-outline"
      },
      {
        title: t("TXT_CODE_f2a58270"),
        key: QUICKSTART_METHOD.IMPORT,
        icon: "mdi-folder-zip-outline"
      },
      {
        title: t("TXT_CODE_1baf656e"),
        key: QUICKSTART_METHOD.SELECT,
        icon: "mdi-folder-open-outline"
      },
      {
        title: t("TXT_CODE_c14caab"),
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
    formData.title = t("TXT_CODE_2958a0f8");
    currentIcon.value = "mdi-emoticon-outline";

    formData.actions = arrayFilter<ActionButtons>([
      {
        title: t("TXT_CODE_36417656"),
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
        title: t("TXT_CODE_2864bfbc"),
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
        title: t("TXT_CODE_d4146944"),
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
