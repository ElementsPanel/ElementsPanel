<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { openInstanceTagsEditor, useDeleteInstanceDialog } from "@/components/fc/index";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useInstanceInfo, verifyEULA } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { arrayFilter } from "@/tools/array";
import { formatMemoryUsage } from "@/tools/memory";
import { parseTimestamp } from "@/tools/time";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail, LayoutCard } from "@/types/index";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import _ from "lodash";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import { computed, ref } from "vue";
import { VBtn, VChip, VIcon, VTooltip } from "vuetify/components";

const props = defineProps<{
  card: LayoutCard;
  targetInstanceInfo?: InstanceDetail;
  targetDaemonId?: string;
}>();

const emits = defineEmits(["refreshList"]);

const { containerState } = useLayoutContainerStore();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const { toPage } = useAppRouters();
const instanceId = props.targetInstanceInfo?.instanceUuid || getMetaOrRouteValue("instanceId");
const daemonId = props.targetDaemonId || getMetaOrRouteValue("daemonId");

const { statusText, isRunning, isStopped, instanceTypeText, instanceInfo, isStarting } =
  useInstanceInfo({
    instanceId: props.targetInstanceInfo ? undefined : instanceId,
    daemonId: props.targetInstanceInfo ? undefined : daemonId,
    autoRefresh: props.targetInstanceInfo ? false : true,
    instanceInfo: props.targetInstanceInfo ? ref(props.targetInstanceInfo) : undefined
  });

const operationConfig = {
  params: {
    uuid: instanceId || "",
    daemonId: daemonId || ""
  }
};

const { isLoading: openLoading, execute: executeOpen } = openInstance();
const { isLoading: stopLoading, execute: executeStop } = stopInstance();
const { isLoading: restartLoading, execute: executeRestart } = restartInstance();
const { isLoading: killLoading, execute: executeKill } = killInstance();
const { isLoading: updateLoading, execute: executeUpdate } = updateInstance();

const prettyBytesConfig: PrettyOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  binary: true
};

const formatStorageUsage = (usage?: number, limit?: number) => {
  const fUsage = prettyBytes(usage ?? 0, prettyBytesConfig);
  const fLimit = prettyBytes(limit ?? 0, prettyBytesConfig);
  return limit ? `${fUsage} / ${fLimit}` : fUsage;
};

const formatNetworkSpeed = (bytes?: number) =>
  prettyBytes(bytes ?? 0, {
    ...prettyBytesConfig,
    binary: false
  }) + "/s";

const formatTrafficUsage = (bytes?: number) =>
  prettyBytes(bytes ?? 0, {
    ...prettyBytesConfig,
    binary: false
  });

const refreshList = () => {
  setTimeout(() => {
    emits("refreshList");
  }, 500);
};

const actions = {
  start: async () => {
    const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
    if (!flag) return;
    await executeOpen(operationConfig);
    message.success(t("TXT_CODE_e13abbb1"));
  },
  stop: async () => {
    await executeStop(operationConfig);
    message.success(t("TXT_CODE_efb6d377"));
  },
  restart: async () => {
    await executeRestart(operationConfig);
    message.success(t("TXT_CODE_efb6d377"));
  },
  kill: async () => {
    await executeKill(operationConfig);
    message.success(t("TXT_CODE_efb6d377"));
  },
  update: async () => {
    await executeUpdate({
      params: {
        uuid: instanceId || "",
        daemonId: daemonId || "",
        task_name: "update"
      },
      data: {
        time: new Date().getTime()
      }
    });
    message.success(t("TXT_CODE_b1600db0"));
  }
};

const execInstanceAction = async (
  event: MouseEvent,
  actName: "start" | "stop" | "restart" | "kill" | "update"
) => {
  const action = actions[actName];
  try {
    if (action) {
      await action();
      refreshList();
    }
  } catch (error) {
    reportErrorMsg(error);
  }
};

const instanceOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_57245e94"),
      icon: "mdi-play-circle-outline",
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        await execInstanceAction(event, "start");
      },
      loading: openLoading.value,
      disabled: containerState.isDesignMode,
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: "mdi-pause-circle-outline",
      click: (event: MouseEvent) => {
        event.stopPropagation();
        Modal.confirm({
          title: t("TXT_CODE_893567ac"),
          content: t("TXT_CODE_6da85509"),
          onOk: async () => {
            execInstanceAction(event, "stop");
          }
        });
        return false;
      },
      loading: stopLoading.value,
      disabled: containerState.isDesignMode,
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_47dcfa5"),
      icon: "mdi-restart",
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        Modal.confirm({
          title: t("TXT_CODE_893567ac"),
          content: t("TXT_CODE_f6bd907d"),
          onOk: async () => {
            execInstanceAction(event, "restart");
          }
        });
      },
      loading: restartLoading.value,
      disabled: containerState.isDesignMode,
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      icon: "mdi-cloud-download-outline",
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        execInstanceAction(event, "update");
      },
      loading: updateLoading.value,
      disabled: containerState.isDesignMode,
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: "mdi-close-circle-outline",
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        Modal.confirm({
          title: t("TXT_CODE_893567ac"),
          content: t("TXT_CODE_ec08484"),
          onOk: async () => {
            execInstanceAction(event, "kill");
          }
        });
      },
      loading: killLoading.value,
      disabled: containerState.isDesignMode,
      danger: true,
      condition: () => !isStopped.value
    },
    {
      area: true
    },
    {
      title: t("TXT_CODE_78e88c3f"),
      icon: "mdi-tag-outline",
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        if (instanceId && daemonId) {
          const tags = instanceInfo.value?.config.tag || [];
          const newTags = await openInstanceTagsEditor(instanceId, daemonId, tags);
          if (!_.isEqual(newTags, tags)) refreshList();
        }
      },
      disabled: containerState.isDesignMode
    },
    {
      title: t("TXT_CODE_524e3036"),
      icon: "mdi-console-line",
      click: (event: MouseEvent) => {
        event.stopPropagation();
        toPage({
          path: "/instances/terminal",
          query: {
            daemonId,
            instanceId
          }
        });
      },
      disabled: containerState.isDesignMode
    },
    {
      title: t("TXT_CODE_a0e19f38"),
      icon: "mdi-delete-outline",
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        const deleteInstanceResult = await useDeleteInstanceDialog(
          instanceId || "",
          daemonId || ""
        );
        if (!deleteInstanceResult) return;
        message.success(t("TXT_CODE_f486dbb4"));
        refreshList();
      },
      danger: true,
      disabled: containerState.isDesignMode
    }
  ])
);
</script>

<template>
  <CardPanel style="width: 100%; height: 100%; position: relative">
    <template #title>
      {{ instanceInfo?.config.nickname }}
    </template>
    <template #operator> </template>
    <template #body>
      <div class="instance-card-body">
        <div>
          <div class="mb-8 flex" style="flex-wrap: wrap; gap: 8px">
            <VChip
              class="m-0"
              :color="isRunning ? 'success' : isStarting ? 'pink' : undefined"
              size="small"
              variant="tonal"
              :style="{
                opacity: isRunning || isStarting ? '1' : '0.5'
              }"
            >
              <span v-if="isRunning">
                <VIcon start icon="mdi-check-circle-outline" />
                {{ statusText }}
              </span>
              <span v-else-if="isStopped">
                <VIcon start icon="mdi-alert-circle-outline" />
                {{ statusText }}
              </span>
              <span v-else>
                <VIcon start icon="mdi-alert-circle-outline" />
                {{ statusText }}
              </span>
            </VChip>

            <div v-if="instanceInfo?.config.tag && instanceInfo?.config.tag.length > 0">|</div>
            <VChip v-for="item in instanceInfo?.config.tag" :key="item" class="m-0" size="small" variant="tonal">
              {{ item }}
            </VChip>
          </div>
          <div class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_2f291d8b") }}:</span>
            <span class="value"> {{ instanceTypeText }}</span>
          </div>
          <div class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_34611898") }}:</span>
            <span class="value"> {{ parseTimestamp(instanceInfo?.config.lastDatetime) }}</span>
          </div>
          <div v-if="instanceInfo?.config.endTime" class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_fa920c0") }}:</span>
            <span> {{ parseTimestamp(instanceInfo?.config.endTime) }}</span>
          </div>
          <div
            v-if="instanceInfo?.info.memoryUsage && instanceInfo?.config?.processType !== 'docker'"
            class="instance-info-line"
          >
            <span class="title">{{ t("TXT_CODE_593ee330") }}:</span>
            <span class="value">
              {{
                formatMemoryUsage(instanceInfo?.info.memoryUsage, instanceInfo?.info.memoryLimit)
              }}
            </span>
          </div>
          <template v-if="instanceInfo?.config?.processType === 'docker'">
            <div v-if="instanceInfo?.info.cpuUsage != null" class="instance-info-line">
              <span class="title">{{ t("TXT_CODE_b862a158") }}:</span>
              <span class="value">{{ parseInt(String(instanceInfo?.info.cpuUsage)) }}%</span>
            </div>
            <div v-if="instanceInfo?.info.memoryUsage != null" class="instance-info-line">
              <span class="title">{{ t("TXT_CODE_593ee330") }}:</span>
              <span class="value">
                {{
                  formatMemoryUsage(instanceInfo?.info.memoryUsage, instanceInfo?.info.memoryLimit)
                }}
              </span>
            </div>
            <div v-if="instanceInfo?.info.storageUsage != null" class="instance-info-line">
              <span class="title">{{ t("TXT_CODE_DISK_USAGE") }}:</span>
              <span class="value">
                {{
                  formatStorageUsage(
                    instanceInfo?.info.storageUsage,
                    instanceInfo?.info.storageLimit
                  )
                }}
              </span>
            </div>
            <div
              v-if="instanceInfo?.info.rxRate != null || instanceInfo?.info.txRate != null"
              class="instance-info-line"
            >
              <span class="title"> {{ t("TXT_CODE_network_bandwidth") }}: </span>
              <span class="value">
                ↓{{ formatNetworkSpeed(instanceInfo?.info.rxRate) }} ↑{{
                  formatNetworkSpeed(instanceInfo?.info.txRate)
                }}
              </span>
            </div>
          </template>
          <div v-if="instanceInfo?.info.mcPingOnline" class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_e4dce83f") }}:</span>
            <span class="value" style="vertical-align: middle">
              <VIcon start icon="mdi-account-outline" />
              {{ instanceInfo?.info.currentPlayers }} / {{ instanceInfo?.info.maxPlayers }}
            </span>
          </div>
        </div>

        <div class="d-flex flex-wrap ga-1 mb-4">
          <div v-for="item in instanceOperations" :key="item.title">
            <span v-if="item.area" class="mx-1">|</span>
            <VTooltip v-else :text="item.title">
              <template #activator="{ props: tooltipProps }"><VBtn v-bind="tooltipProps" icon variant="text" size="small" :loading="item.loading" :disabled="item.disabled" :color="item.danger ? 'error' : undefined" @click="item.click"><VIcon :icon="item.icon" size="16" /></VBtn></template>
            </VTooltip>
          </div>
        </div>
      </div>
    </template>
  </CardPanel>
</template>

<style clang="scss" scoped>
.instance-card {
  cursor: pointer;
  min-height: 170px;
  transition: all 0.3s ease;
}
.instance-card:hover {
  background-color: var(--color-gray-2);
}
.instance-tag-container {
  margin-left: -4px;
  margin-right: -4px;
}
.group-name-tag {
  margin: 4px;
}

.instance-card-body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.instance-info-line {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;

  .title {
    margin-right: 10px;
  }

  .value {
    opacity: 0.8;
  }
}
</style>
