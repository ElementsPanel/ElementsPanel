import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { t } from "@/lang/i18n";
import { getConfigFile, getInstanceInfo, updateConfigFile } from "@/services/apis/instance";
import type { InstanceDetail, MapData } from "@/types";
import { INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@/types/const";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import { usePolling } from "@/hooks/usePolling";
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
  [TYPE_UNIVERSAL]: t("TXT_CODE_a92a4aa1"),
  [TYPE_MINECRAFT_JAVA]: t("TXT_CODE_97f779b3"),
  [TYPE_MINECRAFT_BEDROCK]: t("TXT_CODE_7f1aef9f"),
  [TYPE_MINECRAFT_BUNGEECORD]: t("TXT_CODE_ba86f4a"),
  [TYPE_STEAM_SERVER_UNIVERSAL]: t("TXT_CODE_3d7fbe30"),
  [TYPE_HYTALE]: t("TXT_CODE_2025658e"),
  [TYPE_TERRARIA]: t("TXT_CODE_f25df30a")
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
      INSTANCE_TYPE_TRANSLATION[String(finalState?.value?.config.type)] || t("TXT_CODE_da7a0328")
    );
  });
  const statusText = computed(
    () => INSTANCE_STATUS[finalState.value?.status ?? -1] || t("TXT_CODE_c8333afa")
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
  // Return a copy to avoid interfering with the original data
  return JSON.parse(JSON.stringify(result));
}

export const INSTANCE_CONFIGS: InstanceConfigs[] = [
  {
    fileName: t("TXT_CODE_9b36d5a2"),
    path: "server.properties",
    redirect: "common/server.properties",
    type: "properties",
    info: t("TXT_CODE_12e3afa9"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: t("TXT_CODE_90f684dc"),
    type: "properties",
    info: t("TXT_CODE_ab4cc2dc"),
    path: "eula.txt",
    redirect: "common/eula.txt",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Spigot] spigot.yml",
    path: "spigot.yml",
    redirect: "bukkit/spigot.yml",
    type: "yml",
    info: t("TXT_CODE_509d7d9a"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Bukkit] bukkit.yml",
    path: "bukkit.yml",
    redirect: "bukkit/bukkit.yml",
    type: "yml",
    info: t("TXT_CODE_d03c3e0e"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Bungeecord] config.yml",
    type: "yml",
    info: t("TXT_CODE_e9dcbfe4"),
    path: "config.yml",
    redirect: "bungeecord/config.yml",
    category: [TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[Velocity] velocity.toml",
    type: "toml",
    info: t("TXT_CODE_751f9bc1"),
    path: "velocity.toml",
    redirect: "velocity/velocity.toml",
    category: [TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[Bedrock] server.properties",
    path: "server.properties",
    redirect: "bds/server.properties",
    type: "properties",
    info: t("TXT_CODE_3a3f9a57"),
    category: [TYPE_MINECRAFT_BEDROCK]
  },
  {
    fileName: "[Mohist] mohist.yml",
    path: "mohist.yml",
    redirect: "mohist-config/mohist.yml",
    type: "yml",
    info: t("TXT_CODE_6eead111"),
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Paper] paper.yml",
    type: "yml",
    info: t("TXT_CODE_f3fc17f3"),
    path: "paper.yml",
    redirect: "paper/paper.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Paper] paper-global.yml",
    type: "yml",
    info: t("TXT_CODE_2931127f"),
    path: "config/paper-global.yml",
    redirect: "paper/paper-global.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Paper] paper-world-defaults.yml",
    type: "yml",
    info: t("TXT_CODE_4880ef77"),
    path: "config/paper-world-defaults.yml",
    redirect: "paper/paper-world-defaults.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Purpur] pupur.yml",
    type: "yml",
    info: t("TXT_CODE_98e50717"),
    path: "purpur.yml",
    redirect: "purpur/purpur.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Pufferfish] pufferfish.yml",
    type: "yml",
    info: t("TXT_CODE_9213f8e3"),
    path: "pufferfish.yml",
    redirect: "pufferfish/pufferfish.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Geyser] config.yml",
    type: "yml",
    info: t("TXT_CODE_1d39feca"),
    path: "config.yml",
    redirect: "geyser/config.yml",
    category: [TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[MCDR] config.yml",
    type: "yml",
    info: t("TXT_CODE_25699fea"),
    path: "config.yml",
    redirect: "mcdr/config.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[MCDR] permission.yml",
    type: "yml",
    info: t("TXT_CODE_5207688f"),
    path: "permission.yml",
    redirect: "mcdr/permission.yml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[Tshock] config.json",
    type: "json",
    info: t("TXT_CODE_1cd8f9d2"),
    path: "tshock/config.json",
    redirect: "tshock/config.json",
    category: [TYPE_TERRARIA]
  },
  {
    fileName: "[Forge] fml.toml",
    type: "toml",
    info: t("TXT_CODE_7e6a82d8"),
    path: "config/fml.toml",
    redirect: "forge/fml.toml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[NeoForge] neoforge-server.toml",
    type: "toml",
    info: t("TXT_CODE_5b6f3691"),
    path: "config/neoforge-server.toml",
    redirect: "neoforge/neoforge-server.toml",
    category: [TYPE_MINECRAFT_JAVA]
  },
  {
    fileName: "[NeoForge] neoforge-common.toml",
    type: "toml",
    info: t("TXT_CODE_1efc7c5f"),
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
        title: t("TXT_CODE_617ce69c"),
        content: h("div", {
          innerHTML: t("TXT_CODE_e0a944a1", [
            '<a href="https://www.minecraft.net/eula" target="_blank">Minecraft EULA</a>'
          ])
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
          message.success(t("TXT_CODE_525e6e18"));
          resolve(true);
        },
        onCancel: () => resolve(false),
        okText: t("TXT_CODE_e456aed"),
        maskClosable: false
      })
    );
  }
  return true;
}
