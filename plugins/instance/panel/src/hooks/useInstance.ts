import { GLOBAL_INSTANCE_NAME } from "@elementspanel/epanel-plugin-console/config/const";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  getConfigFile,
  getInstanceInfo,
  updateConfigFile
} from "@elementspanel/epanel-plugin-console/services/apis/instance";
import type { InstanceDetail, MapData } from "@elementspanel/epanel-plugin-console/types";
import {
  INSTANCE_STATUS,
  INSTANCE_STATUS_CODE
} from "@elementspanel/epanel-plugin-console/types/const";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { usePolling } from "@elementspanel/epanel-plugin-console/hooks/usePolling";
import { computed, h, ref, type Ref } from "vue";

import {
  TYPE_UNIVERSAL,
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUNGEECORD,
  TYPE_STEAM_SERVER_UNIVERSAL,
  TYPE_HYTALE,
  TYPE_TERRARIA
} from "@elements-panel/sdk";
export {
  TYPE_UNIVERSAL,
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUNGEECORD,
  TYPE_STEAM_SERVER_UNIVERSAL,
  TYPE_HYTALE,
  TYPE_TERRARIA
} from "@elements-panel/sdk";

export const INSTANCE_TYPE_TRANSLATION: MapData<string> = {
  [TYPE_UNIVERSAL]: t("TXT_CODE_COMMON_GENERAL_CONSOLE_APPLICATION"),
  [TYPE_MINECRAFT_JAVA]: t("TXT_CODE_COMMON_JAVA_EDITION_SERVER"),
  [TYPE_MINECRAFT_BEDROCK]: t("TXT_CODE_COMMON_BEDROCK_EDITION_SERVER"),
  [TYPE_MINECRAFT_BUNGEECORD]: t("TXT_CODE_COMMON_MC_BUNGEE_PROXY_SERVER"),
  [TYPE_STEAM_SERVER_UNIVERSAL]: t("TXT_CODE_INSTANCE_TYPE_STEAM_GAME_SERVER"),
  [TYPE_HYTALE]: t("TXT_CODE_COMMON_HYTALE_SERVER"),
  [TYPE_TERRARIA]: t("TXT_CODE_INSTANCE_TYPE_TERRARIA_SERVER")
};

interface Params {
  instanceId?: string;
  daemonId?: string;
  autoRefresh?: boolean;
  instanceInfo?: Ref<InstanceDetail | undefined>;
}

export interface InstanceMoreDetail extends InstanceDetail {
  moreInfo?: {
    isRunning: boolean;
    isStopped: boolean;
    instanceTypeText: string;
    statusText: string;
  };
}

export function useInstanceMoreDetail(info: InstanceMoreDetail): InstanceMoreDetail {
  const { statusText, isRunning, isStopped, instanceTypeText } = useInstanceInfo({
    instanceInfo: ref(info)
  });

  info.moreInfo = {
    statusText: statusText.value,
    isRunning: isRunning.value,
    isStopped: isStopped.value,
    instanceTypeText: instanceTypeText.value
  };

  return info;
}

export function useInstanceInfo(params: Params) {
  const { daemonId, instanceId, instanceInfo, autoRefresh } = params;

  const { execute, state, isLoading, isReady } = getInstanceInfo();

  let finalState = state;
  if (instanceInfo) finalState = instanceInfo;

  const isUnknown = computed(() => finalState?.value?.status === INSTANCE_STATUS_CODE.BUSY);
  const isStopped = computed(() => finalState?.value?.status === INSTANCE_STATUS_CODE.STOPPED);
  const isStopping = computed(() => finalState?.value?.status === INSTANCE_STATUS_CODE.STOPPING);
  const isStarting = computed(() => finalState?.value?.status === INSTANCE_STATUS_CODE.STARTING);
  const isRunning = computed(() => finalState?.value?.status === INSTANCE_STATUS_CODE.RUNNING);
  const isGlobalTerminal = computed(() => {
    return finalState.value?.config.nickname === GLOBAL_INSTANCE_NAME;
  });

  const instanceTypeText = computed(() => {
    return (
      INSTANCE_TYPE_TRANSLATION[String(finalState?.value?.config.type)] ||
      t("TXT_CODE_COMMON_UNKNOWN_TYPE")
    );
  });
  const statusText = computed(
    () => INSTANCE_STATUS[finalState.value?.status ?? -1] || t("TXT_CODE_COMMON_UNKNOWN_STATUS")
  );

  if (instanceId && daemonId) {
    usePolling(
      () => execute({ params: { uuid: instanceId, daemonId } }),
      autoRefresh ? 3000 : undefined
    );
  }

  return {
    isLoading,
    isReady,
    instanceInfo: finalState,
    execute,
    statusText,
    isUnknown,
    isStopped,
    isStopping,
    isStarting,
    isRunning,
    instanceTypeText,
    isGlobalTerminal
  };
}

export interface InstanceConfigs {
  fileName: string;
  path: string;
  redirect: string;
  type: string;
  info: string;
  category: string[];
  conflict?: boolean;
  check?: boolean;
}

export function getInstanceConfigByType(type: string) {
  let result: InstanceConfigs[] = [];
  INSTANCE_CONFIGS.forEach((v) => {
    if (v.category.includes(type)) result.push(v);
  });
  // Return a copy to protect shared instance data.
  return JSON.parse(JSON.stringify(result));
}

export const INSTANCE_CONFIGS: InstanceConfigs[] = [
  {
    fileName: t("TXT_CODE_COMMON_GENERAL_SERVER_PROPERTIES"),
    path: "server.properties",
    redirect: "common/server.properties",
    type: "properties",
    info: t("TXT_CODE_GAME_CONFIG_MINECRAFT_JAVA_SERVER_OVERVIEW"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: t("TXT_CODE_COMMON_GENERAL_EULA_TXT"),
    type: "properties",
    info: t("TXT_CODE_GAME_CONFIG_MINECRAFT_EULA_OVERVIEW"),
    path: "eula.txt",
    redirect: "common/eula.txt",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Spigot] spigot.yml",
    path: "spigot.yml",
    redirect: "bukkit/spigot.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_SPIGOT_OVERVIEW"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Bukkit] bukkit.yml",
    path: "bukkit.yml",
    redirect: "bukkit/bukkit.yml",
    type: "yml",
    info: t("TXT_CODE_COMMON_THE_ORIGINAL_BUKKIT_CONFIGURATION"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Bungeecord] config.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_BUNGEECORD_OVERVIEW"),
    path: "config.yml",
    redirect: "bungeecord/config.yml",
    category: [TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[Velocity] velocity.toml",
    type: "toml",
    info: t("TXT_CODE_GAME_CONFIG_VELOCITY_DESCRIPTION"),
    path: "velocity.toml",
    redirect: "velocity/velocity.toml",
    category: [TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[Bedrock] server.properties",
    path: "server.properties",
    redirect: "bds/server.properties",
    type: "properties",
    info: t("TXT_CODE_GAME_CONFIG_MINECRAFT_BEDROCK_SERVER_OVERVIEW"),
    category: [TYPE_MINECRAFT_BEDROCK]
  },
  {
    fileName: "[Mohist] mohist.yml",
    path: "mohist.yml",
    redirect: "mohist-config/mohist.yml",
    type: "yml",
    info: t("TXT_CODE_COMMON_MOHIST_YML_SERVER_CONFIGURATION_FILE"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Paper] paper.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_PAPER_OVERVIEW"),
    path: "paper.yml",
    redirect: "paper/paper.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Paper] paper-global.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_PAPER_WORLD_DEFAULTS_DESCRIPTION"),
    path: "config/paper-global.yml",
    redirect: "paper/paper-global.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Paper] paper-world-defaults.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_PAPER_WORLD_DEFAULTS_OVERVIEW"),
    path: "config/paper-world-defaults.yml",
    redirect: "paper/paper-world-defaults.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Purpur] pupur.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_PURPUR_OVERVIEW"),
    path: "purpur.yml",
    redirect: "purpur/purpur.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Pufferfish] pufferfish.yml",
    type: "yml",
    info: t(
      "TXT_CODE_COMMON_CONFIGURATION_FILE_FOR_PUFFERFISH_IT_ALLOWS_FOR_FURTHER_CONFIGURATION_OF_A_PAPER_SERVER"
    ),
    path: "pufferfish.yml",
    redirect: "pufferfish/pufferfish.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Geyser] config.yml",
    type: "yml",
    info: t("TXT_CODE_GAME_CONFIG_GEYSER_DESCRIPTION"),
    path: "config.yml",
    redirect: "geyser/config.yml",
    category: [TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[MCDR] config.yml",
    type: "yml",
    info: t("TXT_CODE_COMMON_MCD_REFORGED_SERVER_CONTROL_TOOL_CONFIGURATION_FILE"),
    path: "config.yml",
    redirect: "mcdr/config.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[MCDR] permission.yml",
    type: "yml",
    info: t("TXT_CODE_COMMON_MCD_REFORGED_SERVER_CONTROL_TOOL_PERMISSION_CONFIGURATION_FILE"),
    path: "permission.yml",
    redirect: "mcdr/permission.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Tshock] config.json",
    type: "json",
    info: t("TXT_CODE_COMMON_TSHOCK_CONFIGURATION_FILE"),
    path: "tshock/config.json",
    redirect: "tshock/config.json",
    category: [TYPE_TERRARIA]
  },
  {
    fileName: "[Forge] fml.toml",
    type: "toml",
    info: t("TXT_CODE_COMMON_CONFIGURATION_FILE_OF_A_FORGE_SERVER"),
    path: "config/fml.toml",
    redirect: "forge/fml.toml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[NeoForge] neoforge-server.toml",
    type: "toml",
    info: t("TXT_CODE_COMMON_SERVER_CONFIGURATION_FILE_OF_A_NEO_FORGE_SERVER"),
    path: "config/neoforge-server.toml",
    redirect: "neoforge/neoforge-server.toml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[NeoForge] neoforge-common.toml",
    type: "toml",
    info: t("TXT_CODE_COMMON_COMMON_CONFIGURATION_FILE_OF_A_NEO_FORGE_SERVER"),
    path: "config/neoforge-common.toml",
    redirect: "neoforge/neoforge-common.toml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Leaves] leaves.yml",
    type: "yml",
    info: t("TXT_CODE_LEAVES_CONFIG_INFO"),
    path: "leaves.yml",
    redirect: "leaves/leaves.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Terraria] serverconfig.txt",
    path: "serverconfig.txt",
    redirect: "terraria/serverconfig.txt",
    type: "properties_not_unicode",
    info: t("TXT_CODE_TERRARIA_CONFIG_INFO"),
    category: [TYPE_TERRARIA]
  },
  {
    fileName: "[Hytale] config.json",
    path: "config.json",
    redirect: "hytale/config.json",
    type: "json",
    info: t("TXT_CODE_HYTALE_CONFIG_INFO"),
    category: [TYPE_HYTALE]
  }
];

export async function verifyEULA(instanceId: string, daemonId: string) {
  const data: any = await getConfigFile()
    .execute({
      params: {
        uuid: instanceId,
        daemonId: daemonId,
        fileName: "eula.txt",
        type: "properties"
      }
    })
    .catch(() => {
      return null;
    });
  if (data?.value?.eula === false) {
    return new Promise((resolve) =>
      Modal.confirm({
        title: t("TXT_CODE_COMMON_WARN"),
        content: h("div", {
          innerHTML: t(
            "TXT_CODE_COMMON_YOU_HAVE_NOT_AGREED_TO_THE_YOU_NEED_TO_AGREE_TO_THIS_AGREEMENT_TO_START_THIS",
            ['<a href="https://www.minecraft.net/eula" target="_blank">Minecraft EULA</a>']
          )
        }),
        onOk: async () => {
          await updateConfigFile().execute({
            params: {
              uuid: instanceId,
              daemonId: daemonId,
              fileName: "eula.txt",
              type: "properties"
            },
            data: { eula: true }
          });
          message.success(
            t("TXT_CODE_COMMON_EULA_HAS_BEEN_ACCEPTED_SUCCESSFULLY_STARTING_INSTANCE")
          );
          resolve(true);
        },
        onCancel: () => resolve(false),
        okText: t("TXT_CODE_COMMON_ACCEPT"),
        maskClosable: false
      })
    );
  }
  return true;
}
