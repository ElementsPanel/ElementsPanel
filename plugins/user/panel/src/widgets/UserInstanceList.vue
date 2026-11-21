<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { verifyEULA } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance
} from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { formatMemoryUsage } from "@elementspanel/epanel-plugin-console/tools/memory";
import { parseTimestamp } from "@elementspanel/epanel-plugin-console/tools/time";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import type { InstanceRuntimeInfo } from "@elementspanel/epanel-plugin-console/types";
import {
  INSTANCE_STATUS,
  INSTANCE_STATUS_CODE
} from "@elementspanel/epanel-plugin-console/types/const";
import type { UserInstance } from "@elementspanel/epanel-plugin-console/types/user";
import { t } from "@elementspanel/epanel-plugin-i18n";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VCol,
  VProgressCircular,
  VRow,
  VSelect,
  VTextField,
  VTooltip
} from "vuetify/components";
import { userInfoApiAdvanced } from "../api";

withDefaults(
  defineProps<{
    title?: string;
  }>(),
  { title: "" }
);

interface MyAppInstance extends UserInstance {
  lastDatetime?: number;
  endTime?: number;
  info?: Partial<InstanceRuntimeInfo>;
}

const router = useRouter();
const { execute, state, isLoading } = userInfoApiAdvanced();
const searchText = ref("");
const statusFilter = ref("");
const operatingInstances = ref(new Set<string>());
const instanceKey = (item: MyAppInstance) => `${item.daemonId}:${item.instanceUuid}`;
const isOperating = (item: MyAppInstance) => operatingInstances.value.has(instanceKey(item));
const instanceName = (item: MyAppInstance) =>
  item.nickname || item.config?.nickname || item.instanceUuid;
const expiryText = (item: MyAppInstance) =>
  parseTimestamp(item.endTime ?? item.config?.endTime) || t("TXT_CODE_INSTANCE_EXPIRY_INDEFINITE");

const filteredInstances = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  return ((state.value?.instances || []) as MyAppInstance[]).filter(
    (item) =>
      (statusFilter.value === "" || String(item.status) === statusFilter.value) &&
      (!keyword ||
        instanceName(item).toLowerCase().includes(keyword) ||
        item.instanceUuid.toLowerCase().includes(keyword))
  );
});

const getInstanceList = async () => {
  try {
    await execute({ params: { advanced: true, uuid: "" } });
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};

const toTerminal = (item: MyAppInstance) => {
  if (item.status === INSTANCE_STATUS_CODE.BUSY) return;
  router.push({
    path: "/instances/terminal",
    query: { daemonId: item.daemonId, instanceId: item.instanceUuid }
  });
};

const operationApis = {
  start: openInstance,
  stop: stopInstance,
  restart: restartInstance,
  kill: killInstance
};

const runCardAction = async (item: MyAppInstance, action: keyof typeof operationApis) => {
  if (isOperating(item) || item.status === INSTANCE_STATUS_CODE.BUSY) return;
  const key = instanceKey(item);
  operatingInstances.value.add(key);
  try {
    if (action === "start" && !(await verifyEULA(item.instanceUuid, item.daemonId))) return;
    await operationApis[action]().execute({
      params: { uuid: item.instanceUuid, daemonId: item.daemonId }
    });
    await getInstanceList();
  } catch (error: any) {
    reportErrorMsg(error.message);
  } finally {
    operatingInstances.value.delete(key);
  }
};

const confirmCardAction = (item: MyAppInstance, action: "stop" | "restart" | "kill") =>
  Modal.confirm({
    title: t("TXT_CODE_INSTANCE_SECONDARY_CONFIRMATION"),
    content: {
      stop: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_SEND_A_SHUTDOWN_COMMAND_TO_THE_INSTANCE"),
      restart: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_RESTART_THE_INSTANCE"),
      kill: t("TXT_CODE_INSTANCE_FORCE_STOP_DATA_LOSS_WARNING")
    }[action],
    onOk: () => runCardAction(item, action)
  });

const statusColor = (item: MyAppInstance) => {
  if (item.status === INSTANCE_STATUS_CODE.RUNNING) return "success";
  if (item.status === INSTANCE_STATUS_CODE.STARTING) return "warning";
  if (item.status === INSTANCE_STATUS_CODE.BUSY) return "error";
  return "secondary";
};
const canTerminate = (item: MyAppInstance) =>
  item.status !== INSTANCE_STATUS_CODE.STOPPED && item.status !== INSTANCE_STATUS_CODE.BUSY;

onMounted(getInstanceList);
</script>

<template>
  <section class="user-instance-list">
    <PageToolbar :title="title || t('TXT_CODE_COMMON_INSTANCE_LIST')" icon="mdi-account-outline">
      <template #search>
        <div class="instance-search-row">
          <VSelect
            v-model="statusFilter"
            :items="[
              { title: t('TXT_CODE_COMMON_ALL'), value: '' },
              ...Object.entries(INSTANCE_STATUS).map(([value, title]) => ({ title, value }))
            ]"
            hide-details
            density="comfortable"
          >
            <template #no-data><Empty :icon="false" compact /></template>
          </VSelect>
          <VTextField
            v-model="searchText"
            :label="t('TXT_CODE_COMMON_SEARCH_BY_INSTANCE_NAME')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            density="comfortable"
            @update:model-value="searchText = $event ?? ''"
          />
        </div>
      </template>
      <template #actions>
        <VBtn
          variant="text"
          prepend-icon="mdi-refresh"
          :loading="isLoading"
          @click="getInstanceList"
        >
          {{ t("TXT_CODE_COMMON_REFRESH") }}
        </VBtn>
      </template>
    </PageToolbar>

    <div v-if="isLoading" class="state-container">
      <VProgressCircular indeterminate />
    </div>
    <VRow v-else-if="filteredInstances.length" class="instance-grid" density="comfortable">
      <VCol
        v-for="item in filteredInstances"
        :key="instanceKey(item)"
        cols="12"
        sm="6"
        lg="4"
        xl="3"
      >
        <VCard class="instance-card" rounded="xl" flat @click="toTerminal(item)">
          <VCardTitle class="instance-card-title">
            <div class="instance-card-heading">
              <span class="instance-name">{{ instanceName(item) }}</span>
            </div>
            <VChip
              size="small"
              :color="statusColor(item)"
              variant="tonal"
              :prepend-icon="
                item.status === INSTANCE_STATUS_CODE.RUNNING
                  ? 'mdi-check-circle-outline'
                  : 'mdi-alert-circle-outline'
              "
            >
              {{ INSTANCE_STATUS[item.status as INSTANCE_STATUS_CODE] || "--" }}
            </VChip>
          </VCardTitle>
          <VCardText class="instance-card-content">
            <div class="instance-detail">
              <span>{{ t("TXT_CODE_INSTANCE_LAST_START") }}</span>
              <strong>
                {{ parseTimestamp(item.lastDatetime ?? item.config?.lastDatetime) || "--" }}
              </strong>
            </div>
            <div class="instance-detail">
              <span>{{ t("TXT_CODE_COMMON_EXPIRE") }}</span>
              <strong>{{ expiryText(item) }}</strong>
            </div>
            <div v-if="item.info?.memoryUsage != null" class="instance-detail">
              <span>{{ t("TXT_CODE_COMMON_MEMORY") }}</span>
              <strong>{{ formatMemoryUsage(item.info.memoryUsage, item.info.memoryLimit) }}</strong>
            </div>
            <div v-if="item.info?.cpuUsage != null" class="instance-detail">
              <span>{{ t("TXT_CODE_COMMON_CPU_USAGE") }}</span>
              <strong>{{ Number(item.info.cpuUsage).toFixed(0) }}%</strong>
            </div>
            <div v-if="item.info?.storageUsage != null" class="instance-detail">
              <span>{{ t("TXT_CODE_DISK_USAGE") }}</span>
              <strong>{{
                prettyBytes(item.info.storageUsage, { binary: true, maximumFractionDigits: 1 })
              }}</strong>
            </div>
          </VCardText>
          <VCardActions class="instance-card-actions" @click.stop>
            <VTooltip v-if="item.status === INSTANCE_STATUS_CODE.STOPPED" location="top">
              <template #activator="{ props: tooltipProps }">
                <VBtn
                  v-bind="tooltipProps"
                  icon="mdi-play"
                  size="small"
                  color="success"
                  variant="text"
                  :loading="isOperating(item)"
                  :disabled="isOperating(item)"
                  :aria-label="t('TXT_CODE_COMMON_START')"
                  @click="runCardAction(item, 'start')"
                />
              </template>
              <span>{{ t("TXT_CODE_COMMON_START") }}</span>
            </VTooltip>
            <VTooltip v-if="item.status === INSTANCE_STATUS_CODE.RUNNING" location="top">
              <template #activator="{ props: tooltipProps }">
                <VBtn
                  v-bind="tooltipProps"
                  icon="mdi-stop"
                  size="small"
                  color="warning"
                  variant="text"
                  :disabled="isOperating(item)"
                  :aria-label="t('TXT_CODE_COMMON_STOP')"
                  @click="confirmCardAction(item, 'stop')"
                />
              </template>
              <span>{{ t("TXT_CODE_COMMON_STOP") }}</span>
            </VTooltip>
            <VTooltip v-if="item.status === INSTANCE_STATUS_CODE.RUNNING" location="top">
              <template #activator="{ props: tooltipProps }">
                <VBtn
                  v-bind="tooltipProps"
                  icon="mdi-restart"
                  size="small"
                  variant="text"
                  :disabled="isOperating(item)"
                  :aria-label="t('TXT_CODE_COMMON_RESTART')"
                  @click="confirmCardAction(item, 'restart')"
                />
              </template>
              <span>{{ t("TXT_CODE_COMMON_RESTART") }}</span>
            </VTooltip>
            <VTooltip v-if="canTerminate(item)" location="top">
              <template #activator="{ props: tooltipProps }">
                <VBtn
                  v-bind="tooltipProps"
                  icon="mdi-close-circle-outline"
                  size="small"
                  color="error"
                  variant="text"
                  :disabled="isOperating(item)"
                  :aria-label="t('TXT_CODE_COMMON_TERMINATE')"
                  @click="confirmCardAction(item, 'kill')"
                />
              </template>
              <span>{{ t("TXT_CODE_COMMON_TERMINATE") }}</span>
            </VTooltip>
          </VCardActions>
        </VCard>
      </VCol>
    </VRow>
    <Empty v-else icon="mdi-view-grid-outline" />
  </section>
</template>

<style lang="scss" scoped>
.instance-search-row {
  display: flex;
  width: 100%;
  gap: 8px;

  .v-select {
    max-width: 150px;
  }

  .v-text-field {
    min-width: 0;
    flex: 1;
  }
}

.state-container {
  display: flex;
  min-height: 360px;
  align-items: center;
  justify-content: center;
}

.instance-grid > .v-col {
  display: flex;
}

.instance-card {
  display: flex;
  width: 100%;
  flex: 1 1 auto;
  min-height: 220px;
  flex-direction: column;
}

.instance-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 22px 22px 12px;
}

.instance-card-heading {
  display: flex;
  min-width: 0;
  flex: 1 1 120px;
  align-items: center;
}

.instance-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instance-card-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 22px;
}

.instance-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-gray-7);
  font-size: 13px;
}

.instance-detail strong {
  overflow: hidden;
  color: var(--text-color);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instance-card-actions {
  min-height: 0;
  margin-top: -4px;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 16px 12px;

  :deep(.v-btn .v-icon) {
    font-size: 17px;
  }
}
</style>
