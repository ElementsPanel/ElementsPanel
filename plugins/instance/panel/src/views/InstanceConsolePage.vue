<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { GLOBAL_INSTANCE_NAME } from "@elementspanel/epanel-plugin-console/config/const";
import {
  INSTANCE_TYPE_TRANSLATION,
  TYPE_STEAM_SERVER_UNIVERSAL,
  verifyEULA
} from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import { useOverviewInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { useServerConfig } from "@elementspanel/epanel-plugin-console/hooks/useServerConfig";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  ctx,
  usePluginService,
  type FrontendTerminalService,
  type PanelFrontendInstanceActionContext
} from "@elements-panel/sdk";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { sleep } from "@elementspanel/epanel-plugin-console/tools/common";
import { toCopy } from "@elementspanel/epanel-plugin-console/tools/copy";
import { parseTimestamp } from "@elementspanel/epanel-plugin-console/tools/time";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { INSTANCE_CRASH_TIMEOUT, INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@elementspanel/epanel-plugin-console/types/const";
import { useElementSize } from "@vueuse/core";
import { computed, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VChip,
  VCol,
  VContainer,
  VIcon,
  VRow,
  VSpacer,
  VToolbar,
  VTooltip
} from "vuetify/components";
import DockerInfo from "../widgets/instance/dialogs/DockerInfo.vue";
import EventConfig from "../widgets/instance/dialogs/EventConfig.vue";
import InstanceDetail from "../widgets/instance/dialogs/InstanceDetail.vue";
import InstanceFundamentalDetail from "../widgets/instance/dialogs/InstanceFundamentalDetail.vue";
import RconSettings from "../widgets/instance/dialogs/RconSettings.vue";

const route = useRoute();
const router = useRouter();
const terminalService = usePluginService<FrontendTerminalService>("terminal");
if (!terminalService) throw new Error("The terminal plugin is required by the instance console.");
const TerminalCore = terminalService.TerminalCore;
const TerminalTopTags = terminalService.TerminalTopTags;
const { recentHistory, clickHistoryItem } = terminalService.useCommandHistory();
const terminalHook = terminalService.useTerminal();
const {
  state: instanceInfo,
  isStopped,
  isRunning,
  isBuys,
  isGlobalTerminal,
  isDockerMode,
  clearTerminal
} = terminalHook;

const queryValue = (value: unknown) =>
  Array.isArray(value) ? String(value[0] || "") : String(value || "");
const daemonId = computed(() => queryValue(route.query.daemonId));
const instanceId = computed(() => queryValue(route.query.instanceId));
const instanceStatusText = computed(
  () => INSTANCE_STATUS[Number(instanceInfo.value?.status ?? -1) as INSTANCE_STATUS_CODE] || "--"
);
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1] || "--"
);
const instanceName = computed(() =>
  instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME
    ? t("TXT_CODE_COMMON_DAEMON_TERMINAL")
    : instanceInfo.value?.config.nickname || "--"
);
const instanceGameServerInfo = computed(() => {
  if (!instanceInfo.value?.info?.mcPingOnline) return null;
  return {
    players: `${instanceInfo.value.info.currentPlayers} / ${instanceInfo.value.info.maxPlayers}`,
    version: instanceInfo.value.info.version
  };
});
const basicInfoCard = ref<InstanceType<typeof VCard>>();
const { height: basicInfoHeight } = useElementSize(basicInfoCard, undefined, {
  box: "border-box"
});
const crashTimer = ref<ReturnType<typeof setTimeout>>();
const terminalCoreRef = ref<{ focusCommandInput?: () => void }>();
const selectCommandHistory = (command: string) => {
  clickHistoryItem(command);
  terminalCoreRef.value?.focusCommandInput?.();
};
const { execute: requestOpenInstance, isLoading: openLoading } = openInstance();
const pluginActions = computed(() => {
  return ctx.actions.terminalButtons({
    mode: "normal",
    instanceId: instanceId.value,
    daemonId: daemonId.value,
    instanceInfo: instanceInfo.value,
    isStopped: isStopped.value,
    isRunning: isRunning.value,
    isGlobalTerminal: isGlobalTerminal.value,
    isDockerMode: isDockerMode.value,
    clearTerminal
  });
});

const { isAdmin, state: appState } = useAppStateStore();
const { state: overviewState } = useOverviewInfo();
const nodeInfo = computed(() =>
  overviewState.value?.remote?.find((node: any) => node.uuid === daemonId.value)
);
const displayInfo = computed(() => {
  if (instanceInfo.value?.config?.processType === "docker") return instanceInfo.value.info;
  const system = nodeInfo.value?.system;
  if (!system) return instanceInfo.value?.info;
  const memoryUsage = system.totalmem - system.freemem;
  return {
    ...instanceInfo.value?.info,
    cpuUsage: system.cpuUsage * 100,
    memoryUsage,
    memoryLimit: system.totalmem,
    memoryUsagePercent: system.totalmem ? (memoryUsage / system.totalmem) * 100 : 0
  };
});
const isDisplayStopped = computed(
  () => instanceInfo.value?.config?.processType === "docker" && isStopped.value
);
const { serverConfigFiles, refresh: refreshServerConfig } = useServerConfig();
const normalInstanceActions = computed(() =>
  ctx.actions.instances.filter((action) => action.normalComponent)
);
type InstanceActionHandle = ComponentPublicInstance & { open?: () => void };
const instanceActionRefs = new Map<string, InstanceActionHandle>();
const eventConfigOpen = ref(false);
const instanceDetailsDialog = ref<InstanceType<typeof InstanceDetail>>();
const instanceFundamentalDetailDialog = ref<InstanceType<typeof InstanceFundamentalDetail>>();
const rconSettingsDialog = ref<InstanceType<typeof RconSettings>>();
const dockerInfoDialog = ref<InstanceType<typeof DockerInfo>>();

const setInstanceActionRef = (id: string, component: unknown) => {
  if (component) instanceActionRefs.set(id, component as InstanceActionHandle);
  else instanceActionRefs.delete(id);
};
const openInstanceAction = (id: string) => instanceActionRefs.get(id)?.open?.();

watch(
  () => [instanceInfo.value?.config?.type, instanceId.value, daemonId.value],
  ([type, id, node]) => {
    if (typeof type === "string" && id && node) void refreshServerConfig(type, id, node);
  },
  { immediate: true }
);

const instanceFunctionItems = computed(() => {
  if (!instanceInfo.value) return [];
  const daemon = overviewState.value?.remote?.find((item: any) => item.uuid === daemonId.value);
  const actionContext: PanelFrontendInstanceActionContext = {
    mode: "normal",
    instanceId: instanceId.value,
    daemonId: daemonId.value,
    instanceInfo: instanceInfo.value,
    daemon,
    isGlobalTerminal: isGlobalTerminal.value
  };
  const pluginItems = normalInstanceActions.value.map((action) => ({
    title: typeof action.title === "function" ? action.title() : action.title,
    icon: action.mdiIcon,
    condition: () => action.condition?.(actionContext) ?? true,
    click: () => openInstanceAction(action.id)
  }));
  const items = [
    {
      title: t("TXT_CODE_COMMON_CONFIGURATION_FILES"),
      icon: "mdi-cog-outline",
      condition: () => !isGlobalTerminal.value && serverConfigFiles.value.length > 0,
      click: goConfig
    },
    {
      title: t("TXT_CODE_COMMON_STEAM_RCON_PROTOCOL"),
      icon: "mdi-hammer-wrench",
      condition: () => String(instanceInfo.value?.config.type || "").includes(TYPE_STEAM_SERVER_UNIVERSAL),
      click: () => rconSettingsDialog.value?.openDialog()
    },
    {
      title: t("TXT_CODE_COMMON_SCHEDULED_TASKS"),
      icon: "mdi-calendar-clock-outline",
      condition: () => !isGlobalTerminal.value,
      click: goSchedule
    },
    {
      title: t("TXT_CODE_COMMON_EVENT_TASKS"),
      icon: "mdi-view-dashboard-outline",
      condition: () => true,
      click: () => {
        eventConfigOpen.value = true;
      }
    },
    {
      title: t("TXT_CODE_DESKTOP_INSTANCE_SETTINGS_TITLE"),
      icon: "mdi-application-cog-outline",
      condition: () =>
        isAdmin.value ||
        (instanceInfo.value?.config.processType === "docker" && appState.settings.allowChangeCmd),
      click: () =>
        (isAdmin.value
          ? instanceDetailsDialog.value
          : instanceFundamentalDetailDialog.value
        )?.openDialog()
    },
    ...pluginItems
  ];
  return items.filter((item) => item.condition());
});

const refreshInstanceInfo = async () => {
  if (!instanceId.value || !daemonId.value) return;
  await terminalHook.execute({
    params: { uuid: instanceId.value, daemonId: daemonId.value },
    forceRequest: true
  });
};

const open = async () => {
  if (crashTimer.value) clearTimeout(crashTimer.value);
  clearTerminal();
  try {
    if (instanceInfo.value?.config.type?.startsWith("minecraft/java")) {
      if (!(await verifyEULA(instanceId.value, daemonId.value))) return;
      await sleep(1000);
    }
    await requestOpenInstance({ params: { uuid: instanceId.value, daemonId: daemonId.value } });
    crashTimer.value = setTimeout(() => {
      if (terminalHook.isStopped.value) {
        Modal.error({ title: t("TXT_CODE_COMMON_ERROR"), content: t("TXT_CODE_COMMON_PROCESS_STARTUP_FAILED_PLEASE_CHECK_THE_INSTANCE_LOG_FOR_MORE_INFORMATION") });
      }
    }, INSTANCE_CRASH_TIMEOUT);
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};
const withInstance = (fn: ReturnType<typeof stopInstance>["execute"], data?: any) =>
  fn({ params: { uuid: instanceId.value, daemonId: daemonId.value }, ...(data || {}) });
const stop = () =>
  Modal.confirm({
    title: t("TXT_CODE_INSTANCE_SECONDARY_CONFIRMATION"),
    content: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_SEND_A_SHUTDOWN_COMMAND_TO_THE_INSTANCE"),
    onOk: () => withInstance(stopInstance().execute)
  });
const restart = () =>
  Modal.confirm({
    title: t("TXT_CODE_INSTANCE_SECONDARY_CONFIRMATION"),
    content: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_RESTART_THE_INSTANCE"),
    onOk: () => withInstance(restartInstance().execute)
  });
const kill = () =>
  Modal.confirm({
    title: t("TXT_CODE_INSTANCE_SECONDARY_CONFIRMATION"),
    content: t("TXT_CODE_INSTANCE_FORCE_STOP_DATA_LOSS_WARNING"),
    onOk: () => withInstance(killInstance().execute)
  });
const update = async () => {
  try {
    clearTerminal();
    await updateInstance().execute({
      params: { uuid: instanceId.value, daemonId: daemonId.value, task_name: "update" },
      data: { time: Date.now() }
    });
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};
const goConfig = () =>
  router.push({
    path: "/instances/terminal/serverConfig",
    query: {
      daemonId: daemonId.value,
      instanceId: instanceId.value,
      type: instanceInfo.value?.config.type
    }
  });
const goSchedule = () =>
  router.push({
    path: "/instances/schedule",
    query: { daemonId: daemonId.value, instanceId: instanceId.value }
  });
const canUpdate = computed(
  () => Boolean(instanceInfo.value?.config.updateCommand) && isStopped.value
);

onUnmounted(() => {
  if (crashTimer.value) clearTimeout(crashTimer.value);
});
</script>

<template>
  <main class="instance-console-page">
    <VContainer fluid class="instance-console-container">
      <VToolbar class="console-toolbar" color="transparent" flat>
        <div class="console-title">
          <strong>{{ instanceName }}</strong
          ><span>{{ instanceTypeText }}</span>
        </div>
        <VChip
          class="console-status"
          size="small"
          :color="isRunning ? 'success' : isBuys ? 'warning' : 'secondary'"
          variant="tonal"
          :prepend-icon="isRunning ? 'mdi-check-circle-outline' : 'mdi-information-outline'"
          >{{ instanceStatusText }}</VChip
        >
        <VTooltip
          v-if="instanceInfo?.watcher && instanceInfo.watcher > 1"
          :text="t('TXT_CODE_TERMINAL_CONNECTED_PAGES_HINT')"
          location="bottom"
        >
          <template #activator="{ props: tooltipProps }">
            <span v-bind="tooltipProps" class="console-watchers">
              <VIcon icon="mdi-laptop" size="18" />
              {{ instanceInfo?.watcher }}
            </span>
          </template>
        </VTooltip>
        <VSpacer />
        <div class="console-actions">
          <VBtn
            v-if="isStopped"
            color="success"
            prepend-icon="mdi-play"
            :loading="openLoading"
            @click="open"
            >{{ t("TXT_CODE_COMMON_START") }}</VBtn
          >
          <VBtn v-if="isRunning" color="warning" prepend-icon="mdi-stop" @click="stop">{{
            t("TXT_CODE_COMMON_STOP")
          }}</VBtn>
          <VBtn v-if="isRunning" prepend-icon="mdi-restart" @click="restart">{{
            t("TXT_CODE_COMMON_RESTART")
          }}</VBtn>
          <VBtn
            v-if="!isStopped"
            color="error"
            prepend-icon="mdi-close-circle-outline"
            @click="kill"
            >{{ t("TXT_CODE_COMMON_TERMINATE") }}</VBtn
          >
          <VBtn v-if="canUpdate" prepend-icon="mdi-cloud-download-outline" @click="update">{{
            t("TXT_CODE_COMMON_UPDATE")
          }}</VBtn>
          <VBtn
            v-for="action in pluginActions"
            :key="action.id"
            :prepend-icon="action.mdiIcon"
            @click="action.click()"
            >{{ action.title }}</VBtn
          >
        </div>
      </VToolbar>

      <VCard v-if="instanceId && daemonId" rounded="xl" flat>
        <VCardText class="console-card-content"
          ><component
            :is="TerminalCore"
            ref="terminalCoreRef"
            :instance-id="instanceId"
            :daemon-id="daemonId"
            height="min(70vh, 640px)"
            :use-terminal-hook="terminalHook"
            :ignore-design-mode="true"
        /></VCardText>
      </VCard>
      <VAlert v-else type="warning" variant="tonal" class="mt-1">{{
        t("TXT_CODE_COMMON_UNABLE_TO_RETRIEVE_REMOTE_DAEMON_INFORMATION")
      }}</VAlert>

      <VRow v-if="instanceInfo" class="console-state-row" density="comfortable">
        <VCol cols="12" lg="7">
          <VCard class="console-state-card" rounded="xl" flat>
            <VCardTitle class="console-state-title">
              <VIcon icon="mdi-chart-line" color="info" class="mr-1" />
              {{ t("TXT_CODE_COMMON_STATE") }}
            </VCardTitle>
            <VCardText class="console-state-content">
              <div v-if="displayInfo && !isDisplayStopped" class="console-state-metrics">
                <component
                  :is="TerminalTopTags"
                  :info="displayInfo"
                  :is-stopped="isDisplayStopped"
                />
              </div>
              <Empty v-else :icon="false" compact class="console-state-empty" />
            </VCardText>
          </VCard>
        </VCol>
        <VCol cols="12" lg="5">
          <VCard class="command-history-card" rounded="xl" flat>
            <VCardTitle class="command-history-title">
              <VIcon icon="mdi-history" color="info" class="mr-1" />
              {{ t("TXT_CODE_INSTANCE_COMMAND_HISTORY") }}
            </VCardTitle>
            <VCardText class="command-history-content">
              <div v-if="recentHistory.length" class="command-history-list">
                <VChip
                  v-for="command in recentHistory"
                  :key="command"
                  :title="command"
                  prepend-icon="mdi-console-line"
                  size="small"
                  variant="tonal"
                  class="command-history-item"
                  @click="selectCommandHistory(command)"
                >
                  {{ command }}
                </VChip>
              </div>
              <Empty v-else :icon="false" compact class="console-state-empty" />
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow v-if="instanceInfo" class="console-summary" density="comfortable">
        <VCol cols="12" lg="7" class="console-function-column">
          <VCard
            v-if="instanceFunctionItems.length"
            class="console-function-card"
            :style="{ height: basicInfoHeight ? `${basicInfoHeight}px` : undefined }"
            rounded="xl"
            flat
          >
            <VCardTitle class="console-function-title">
              <VIcon icon="mdi-view-grid-outline" color="info" class="mr-1" />
              {{ t("TXT_CODE_COMMON_MANAGE_INSTANCE") }}
            </VCardTitle>
            <VCardText class="console-function-content">
              <VRow class="console-function-grid" density="comfortable">
                <VCol
                  v-for="(item, index) in instanceFunctionItems"
                  :key="`${item.title}-${index}`"
                  cols="12"
                  sm="6"
                  md="4"
                  lg="3"
                >
                  <VCard class="console-function-item" data-app-surface="control" rounded="xl" flat @click="item.click()">
                    <VCardText>
                      <VIcon :icon="item.icon" size="28" color="info" />
                      <span>{{ item.title }}</span>
                      <VIcon icon="mdi-arrow-right" size="18" class="console-function-arrow" />
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>
        <VCol cols="12" lg="5" class="console-basic-column">
          <VCard ref="basicInfoCard" class="summary-card" rounded="xl" flat>
            <VCardTitle
              ><VIcon icon="mdi-information-outline" color="info" class="mr-1" />{{
                t("TXT_CODE_COMMON_BASIC_INFORMATION")
              }}</VCardTitle
            >
            <VCardText class="info-list">
              <div>
                <span>{{ t("TXT_CODE_COMMON_INSTANCE") }}</span>
                <strong class="info-list-value">
                  <span>{{ instanceName }}</span>
                  <VChip
                    size="x-small"
                    :color="isRunning ? 'success' : isBuys ? 'warning' : 'secondary'"
                    variant="tonal"
                    >{{ instanceStatusText }}</VChip
                  >
                </strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_INSTANCE_TYPE_LABEL") }}</span>
                <strong>{{ instanceTypeText }}</strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_COMMON_NUMBER_OF_STARTS") }}</span>
                <strong>{{ instanceInfo.started }}</strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_COMMON_NUMBER_OF_AUTO_RESTARTS") }}</span>
                <strong>{{ instanceInfo.autoRestarted }}</strong>
              </div>
              <div v-if="instanceGameServerInfo">
                <span>{{ t("TXT_CODE_COMMON_PLAYERS") }}</span>
                <strong>{{ instanceGameServerInfo.players }}</strong>
              </div>
              <div v-if="instanceGameServerInfo">
                <span>{{ t("TXT_CODE_INSTANCE_GAME_VERSION_LABEL") }}</span>
                <strong>{{ instanceGameServerInfo.version }}</strong>
              </div>
              <div v-if="instanceInfo.config.processType === 'docker'">
                <span>{{ t("TXT_CODE_COMMON_RESOURCE_LIMITS") }}</span>
                <VBtn
                  variant="text"
                  size="small"
                  class="info-list-link"
                  @click="dockerInfoDialog?.openDialog()"
                  >{{ t("TXT_CODE_COMMON_CHECK") }}</VBtn
                >
              </div>
              <div v-if="Number(instanceInfo.info?.allocatedPorts?.length) > 0" class="info-list-block">
                <span>{{ t("TXT_CODE_INSTANCE_AVAILABLE_PORTS_LABEL") }}</span>
                <div class="port-list">
                  <div v-for="(item, index) in instanceInfo.info.allocatedPorts" :key="index" class="port-item">
                    <VChip size="x-small" color="success" variant="tonal">
                      {{ item.protocol.toUpperCase() }}
                    </VChip>
                    <VChip size="x-small" variant="tonal">
                      {{ t("TXT_CODE_COMMON_HOST") }}: {{ item.host }}
                      {{ t("TXT_CODE_COMMON_CONTAINER") }}: {{ item.container }}
                    </VChip>
                  </div>
                </div>
              </div>
              <div>
                <span>{{ t("TXT_CODE_COMMON_EXPIRATION_TIME") }}</span>
                <strong>{{ parseTimestamp(instanceInfo.config.endTime) || t("TXT_CODE_COMMON_UNLIMITED") }}</strong>
              </div>
              <div v-if="!instanceGameServerInfo">
                <span>{{ t("TXT_CODE_COMMON_CREATION_TIME") }}</span>
                <strong>{{ parseTimestamp(instanceInfo.config.createDatetime) }}</strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_INSTANCE_LAST_START_LABEL") }}</span>
                <strong>{{ parseTimestamp(instanceInfo.config.lastDatetime) }}</strong>
              </div>
              <div v-if="!instanceGameServerInfo" class="info-list-block">
                <div class="encoding-list">
                  <div>
                    <span>{{ t("TXT_CODE_COMMON_OUTPUT_ENCODING") }}</span>
                    <strong>{{ instanceInfo.config.oe?.toUpperCase() || "--" }}</strong>
                  </div>
                  <div>
                    <span>{{ t("TXT_CODE_COMMON_INPUT_ENCODING") }}</span>
                    <strong>{{ instanceInfo.config.ie?.toUpperCase() || "--" }}</strong>
                  </div>
                </div>
              </div>
              <div class="info-list-identifiers">
                <span>{{ t("TXT_CODE_COMMON_INSTANCE_ID") }}</span>
                <VBtn
                  class="identifier-copy"
                  variant="text"
                  size="small"
                  @click="toCopy(instanceInfo.instanceUuid)"
                >
                  <span class="mono">{{ instanceInfo.instanceUuid }}</span>
                  <VIcon icon="mdi-content-copy" size="14" />
                </VBtn>
                <span>{{ t("TXT_CODE_COMMON_NODE_ID") }}</span>
                <VBtn
                  class="identifier-copy"
                  variant="text"
                  size="small"
                  @click="toCopy(daemonId)"
                >
                  <span class="mono">{{ daemonId }}</span>
                  <VIcon icon="mdi-content-copy" size="14" />
                </VBtn>
              </div>
              <div v-if="instanceInfo.config.tag?.length" class="info-list-block">
                <span>{{ t("TXT_CODE_COMMON_TAG") }}</span>
                <div class="tag-list">
                <VChip
                  v-for="tag in instanceInfo.config.tag || []"
                  :key="tag"
                  size="small"
                  variant="tonal"
                  >{{ tag }}</VChip
                >
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VContainer>

    <template v-if="instanceId && daemonId">
      <component
        v-for="action in normalInstanceActions"
        :is="action.normalComponent"
        :key="action.id"
        :ref="(component: unknown) => setInstanceActionRef(action.id, component)"
        :instance-uuid="instanceId"
        :instance-info="instanceInfo"
        :daemon-id="daemonId"
        @close="refreshInstanceInfo"
        @update="refreshInstanceInfo"
      />
    </template>

    <EventConfig
      v-model="eventConfigOpen"
      :instance-info="instanceInfo"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      @update="refreshInstanceInfo"
    />
    <InstanceDetail
      ref="instanceDetailsDialog"
      :instance-info="instanceInfo"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      @update="refreshInstanceInfo"
    />
    <InstanceFundamentalDetail
      ref="instanceFundamentalDetailDialog"
      :instance-info="instanceInfo"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      @update="refreshInstanceInfo"
    />
    <RconSettings
      ref="rconSettingsDialog"
      :instance-info="instanceInfo"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      @update="refreshInstanceInfo"
    />
    <DockerInfo ref="dockerInfoDialog" :docker-info="instanceInfo?.config.docker" />
  </main>
</template>

<style lang="scss" scoped>
.instance-console-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}
.instance-console-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 12px 24px 32px;
}
.console-toolbar {
  min-height: 64px;
  padding: 0;
}
.console-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.console-title strong {
  overflow: hidden;
  color: var(--text-color);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.console-title span {
  color: var(--color-gray-7);
  font-size: 12px;
}
.console-status {
  margin-inline-start: 12px;
}
.console-watchers {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  margin-inline-start: 12px;
  color: var(--color-gray-7);
  font-size: 12px;
}
.console-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.console-card-content {
  --console-card-padding: 12px;
  padding: var(--console-card-padding);
}
.console-card-content :deep(.command-input .v-field) {
  // Keep the inset corners concentric with the outer card.
  border-radius: calc(var(--app-dialog-radius) - var(--console-card-padding));
}
.console-function-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 0;
}
.console-function-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}
.console-state-card {
  margin-top: 16px;
  margin-bottom: 20px;
}
.console-state-row {
  --console-state-card-height: 132px;
  margin-top: 16px;
  margin-bottom: 20px;
}
.console-state-row > .v-col {
  display: flex;
  min-height: 0;
}
.console-state-row .console-state-card,
.command-history-card {
  display: flex;
  min-height: 0;
  height: var(--console-state-card-height);
  max-height: var(--console-state-card-height);
  width: 100%;
  margin: 0;
  flex-direction: column;
}
.console-state-title,
.command-history-title,
.console-function-title,
.summary-card :deep(.v-card-title) {
  display: flex;
  align-items: center;
  padding: 18px 20px 8px;
  color: var(--text-color);
  font-size: 16px;
}
.console-state-content {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  align-items: center;
  overflow: hidden;
  padding: 10px 20px 20px;
}
.console-state-metrics {
  min-width: 0;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
}
.console-state-metrics :deep(.perf-cards) {
  flex-wrap: nowrap;
}
.console-state-metrics :deep(.perf-card) {
  width: 150px;
  flex: 0 0 150px;
}
.console-state-empty {
  padding: 0;
}
.command-history-content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 10px 20px 20px;
}
.command-history-list {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
}
.command-history-item {
  max-width: 100%;
  cursor: pointer;
}
.command-history-item :deep(.v-chip__content) {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.console-function-column {
  order: 2;
}
.console-basic-column {
  order: 1;
}
.console-function-title {
  flex-shrink: 0;
}
.console-function-item {
  height: 100%;
  background: var(--color-gray-2);
}
.console-function-item :deep(.v-card-text) {
  display: flex;
  min-height: 88px;
  align-items: center;
  gap: 12px;
  padding: 16px;
}
.console-function-item span {
  min-width: 0;
  flex: 1;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.console-function-arrow {
  color: var(--color-gray-7);
}
.summary-card :deep(.v-card-text) {
  padding: 10px 20px 20px;
}
.info-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-gray-7);
  font-size: 13px;
}
.info-list .info-list-block {
  display: block;
}
.info-list .info-list-identifiers {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 12px;
}
.encoding-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.encoding-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.identifier-copy {
  display: flex;
  width: 100%;
  min-width: 0;
  justify-content: flex-start;
  gap: 6px;
  padding-inline: 4px;
  color: var(--text-color);
  text-transform: none;
}
.identifier-copy :deep(.v-btn__content) {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  overflow: hidden;
}
.identifier-copy .mono {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}
.info-list-link {
  min-width: 0;
  padding-inline: 4px;
}
.port-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-left: 12px;
}
.port-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.info-list strong {
  overflow: hidden;
  color: var(--text-color);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-list-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.info-list-value > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mono {
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
@media (max-width: 992px) {
  .instance-console-container {
    padding: 8px 12px 24px;
  }
  .console-toolbar :deep(.v-toolbar__content) {
    height: auto !important;
    flex-wrap: wrap;
    row-gap: 12px;
    padding-block: 8px 12px;
  }
  .console-toolbar :deep(.v-spacer) {
    display: none;
  }
  .console-title {
    flex: 1 1 0;
  }
  .console-status {
    flex-shrink: 0;
  }
  .console-actions {
    flex: 0 0 100%;
    flex-wrap: wrap;
    min-width: 0;
  }
  .console-actions > .v-btn {
    flex-shrink: 0;
  }
  .console-function-card {
    height: auto !important;
  }
  .info-list .info-list-identifiers {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
