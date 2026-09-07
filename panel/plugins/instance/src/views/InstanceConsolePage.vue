<script setup lang="ts">
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import {
  INSTANCE_TYPE_TRANSLATION,
  TYPE_STEAM_SERVER_UNIVERSAL,
  verifyEULA
} from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import {
  ctx,
  usePluginService,
  type FrontendTerminalService,
  type PanelFrontendInstanceActionContext
} from "@/plugin/context";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { useServerConfig } from "@/hooks/useServerConfig";
import { modListApi } from "@/services/apis/modManager";
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_CRASH_TIMEOUT, INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@/types/const";
import { Modal } from "ant-design-vue";
import prettyBytes from "pretty-bytes";
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
  VDivider,
  VIcon,
  VProgressLinear,
  VRow,
  VSpacer,
  VToolbar
} from "vuetify/lib/components/index.mjs";
import EventConfig from "../widgets/instance/dialogs/EventConfig.vue";
import InstanceDetail from "../widgets/instance/dialogs/InstanceDetail.vue";
import InstanceFundamentalDetail from "../widgets/instance/dialogs/InstanceFundamentalDetail.vue";
import RconSettings from "../widgets/instance/dialogs/RconSettings.vue";

const route = useRoute();
const router = useRouter();
const terminalService = usePluginService<FrontendTerminalService>("terminal");
if (!terminalService) throw new Error("The terminal plugin is required by the instance console.");
const TerminalCore = terminalService.TerminalCore;
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
    ? t("TXT_CODE_5bdaf23d")
    : instanceInfo.value?.config.nickname || "--"
);
const crashTimer = ref<ReturnType<typeof setTimeout>>();
const { execute: requestOpenInstance, isLoading: openLoading } = openInstance();
const formatBytes = (value?: number) =>
  prettyBytes(value || 0, { binary: true, maximumFractionDigits: 1 });
const cpuPercent = computed(() =>
  Math.max(0, Math.min(100, Number(instanceInfo.value?.info?.cpuUsage || 0)))
);
const memoryPercent = computed(() =>
  Math.max(0, Math.min(100, Number(instanceInfo.value?.info?.memoryUsagePercent || 0)))
);
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

const mdiIconMap: Record<string, string> = {
  AppstoreAddOutlined: "mdi-view-grid-plus",
  BuildOutlined: "mdi-hammer-wrench",
  CloudDownloadOutlined: "mdi-cloud-download-outline",
  CodeOutlined: "mdi-code-tags",
  FileTextOutlined: "mdi-file-document-outline",
  FolderOpenOutlined: "mdi-folder-open-outline",
  InteractionOutlined: "mdi-gesture-tap-button",
  UsergroupDeleteOutlined: "mdi-account-multiple-minus-outline"
};
const instanceActionMdiIcons: Record<string, string> = {
  "file-manager": "mdi-folder-open-outline",
  "java-manager": "mdi-language-java",
  mcstats: "mdi-chart-line",
  backup: "mdi-backup-restore",
  "terminal-config": "mdi-code-tags",
  "operation-log": "mdi-file-document-outline"
};
const terminalActionMdiIcons: Record<string, string> = {
  "market-reinstall": "mdi-storefront-outline"
};
const getMdiIcon = (icon: unknown, fallback = "mdi-application-cog-outline") => {
  if (typeof icon === "string" && icon.startsWith("mdi-")) return icon;
  const component = icon as
    | {
        name?: string;
        displayName?: string;
        __name?: string;
        type?: { name?: string; __name?: string };
      }
    | undefined;
  const name =
    component?.name ??
    component?.displayName ??
    component?.__name ??
    component?.type?.name ??
    component?.type?.__name;
  return (name && mdiIconMap[name]) || fallback;
};

const { isAdmin, state: appState } = useAppStateStore();
const { state: overviewState } = useOverviewInfo();
const { serverConfigFiles, refresh: refreshServerConfig } = useServerConfig();
const normalInstanceActions = computed(() =>
  ctx.actions.instances.filter((action) => action.normalComponent)
);
type InstanceActionHandle = ComponentPublicInstance & { open?: () => void };
const instanceActionRefs = new Map<string, InstanceActionHandle>();
const eventConfigDialog = ref<InstanceType<typeof EventConfig>>();
const instanceDetailsDialog = ref<InstanceType<typeof InstanceDetail>>();
const instanceFundamentalDetailDialog = ref<InstanceType<typeof InstanceFundamentalDetail>>();
const rconSettingsDialog = ref<InstanceType<typeof RconSettings>>();

const setInstanceActionRef = (id: string, component: unknown) => {
  if (component) instanceActionRefs.set(id, component as InstanceActionHandle);
  else instanceActionRefs.delete(id);
};
const openInstanceAction = (id: string) => instanceActionRefs.get(id)?.open?.();

const folders = ref<string[]>([]);
const foldersLoaded = ref(false);
const loadFolders = async () => {
  if (!instanceId.value || !daemonId.value) return;
  try {
    const { execute } = modListApi();
    const result = await execute({
      params: { uuid: instanceId.value, daemonId: daemonId.value }
    });
    folders.value = result.value?.folders || [];
  } catch (error) {
    console.error("Failed to load instance folders:", error);
  } finally {
    foldersLoaded.value = true;
  }
};

watch([instanceId, daemonId], () => void loadFolders(), { immediate: true });
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
    icon: instanceActionMdiIcons[action.id] || getMdiIcon(action.icon),
    condition: () => action.condition?.(actionContext) ?? true,
    click: () => openInstanceAction(action.id)
  }));
  const terminalItems = pluginActions.value
    .filter((action) => action.condition())
    .map((action) => ({
      title: action.title,
      icon:
        terminalActionMdiIcons[action.id] ||
        getMdiIcon(action.icon, "mdi-lightning-bolt-outline"),
      condition: () => true,
      click: action.click
    }));
  const items = [
    {
      title: t("TXT_CODE_d07742fe"),
      icon: "mdi-cog-outline",
      condition: () => !isGlobalTerminal.value && serverConfigFiles.value.length > 0,
      click: goConfig
    },
    {
      title: t("TXT_CODE_MOD_MANAGER"),
      icon: "mdi-package-variant-closed",
      condition: () => {
        const type = String(instanceInfo.value?.config.type || "");
        const isMinecraft = type.startsWith("minecraft/java") || type.startsWith("minecraft/bedrock");
        const hasPermission = appState.settings.canFileManager || isAdmin.value;
        return isMinecraft && hasPermission && foldersLoaded.value && folders.value.length > 0;
      },
      click: goMods
    },
    {
      title: t("TXT_CODE_656a85d8"),
      icon: "mdi-hammer-wrench",
      condition: () => String(instanceInfo.value?.config.type || "").includes(TYPE_STEAM_SERVER_UNIVERSAL),
      click: () => rconSettingsDialog.value?.openDialog()
    },
    {
      title: t("TXT_CODE_b7d026f8"),
      icon: "mdi-calendar-clock-outline",
      condition: () => !isGlobalTerminal.value,
      click: goSchedule
    },
    {
      title: t("TXT_CODE_d341127b"),
      icon: "mdi-view-dashboard-outline",
      condition: () => true,
      click: () => eventConfigDialog.value?.openDialog()
    },
    {
      title: t("TXT_CODE_4f34fc28"),
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
    ...pluginItems,
    ...terminalItems
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
        Modal.error({ title: t("TXT_CODE_ac405b50"), content: t("TXT_CODE_3409258a") });
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
    title: t("TXT_CODE_893567ac"),
    content: t("TXT_CODE_6da85509"),
    onOk: () => withInstance(stopInstance().execute)
  });
const restart = () =>
  Modal.confirm({
    title: t("TXT_CODE_893567ac"),
    content: t("TXT_CODE_f6bd907d"),
    onOk: () => withInstance(restartInstance().execute)
  });
const kill = () =>
  Modal.confirm({
    title: t("TXT_CODE_893567ac"),
    content: t("TXT_CODE_ec08484"),
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
const goMods = () =>
  router.push({
    path: "/instances/terminal/mods",
    query: { daemonId: daemonId.value, instanceId: instanceId.value }
  });
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
        <VIcon icon="mdi-console-line" color="info" class="mr-3" />
        <div class="console-title">
          <strong>{{ instanceName }}</strong
          ><span>{{ instanceTypeText }}</span>
        </div>
        <VChip
          class="ml-3"
          size="small"
          :color="isRunning ? 'success' : isBuys ? 'warning' : 'secondary'"
          variant="tonal"
          :prepend-icon="isRunning ? 'mdi-check-circle-outline' : 'mdi-information-outline'"
          >{{ instanceStatusText }}</VChip
        >
        <VSpacer />
        <div class="console-actions desktop-actions">
          <VBtn
            v-if="isStopped"
            color="success"
            prepend-icon="mdi-play"
            :loading="openLoading"
            @click="open"
            >{{ t("TXT_CODE_57245e94") }}</VBtn
          >
          <VBtn v-if="isRunning" color="warning" prepend-icon="mdi-stop" @click="stop">{{
            t("TXT_CODE_b1dedda3")
          }}</VBtn>
          <VBtn v-if="isRunning" prepend-icon="mdi-restart" @click="restart">{{
            t("TXT_CODE_47dcfa5")
          }}</VBtn>
          <VBtn
            v-if="!isStopped"
            color="error"
            prepend-icon="mdi-close-circle-outline"
            @click="kill"
            >{{ t("TXT_CODE_7b67813a") }}</VBtn
          >
          <VBtn v-if="canUpdate" prepend-icon="mdi-cloud-download-outline" @click="update">{{
            t("TXT_CODE_40ca4f2")
          }}</VBtn>
        </div>
      </VToolbar>

      <VCard v-if="instanceId && daemonId" class="console-card" rounded="xl" flat>
        <VCardText class="console-card-content"
          ><component
            :is="TerminalCore"
            :instance-id="instanceId"
            :daemon-id="daemonId"
            height="min(70vh, 640px)"
            :use-terminal-hook="terminalHook"
            :ignore-design-mode="true"
        /></VCardText>
      </VCard>
      <VAlert v-else type="warning" variant="tonal" class="mt-4">{{
        t("TXT_CODE_181f2f08")
      }}</VAlert>

      <VCard v-if="instanceInfo" class="summary-card console-state-card" rounded="xl" flat>
        <VCardTitle
          ><VIcon icon="mdi-chart-line" color="info" class="mr-2" />{{
            t("TXT_CODE_5476e012")
          }}</VCardTitle
        >
        <VCardText>
          <div class="metric-row">
            <span>{{ t("TXT_CODE_b862a158") }}</span
            ><strong>{{ Number(instanceInfo.info?.cpuUsage || 0).toFixed(0) }}%</strong>
          </div>
          <VProgressLinear
            :model-value="cpuPercent"
            color="primary"
            height="6"
            rounded="xl"
            class="metric-bar"
          />
          <div class="metric-row">
            <span>{{ t("TXT_CODE_593ee330") }}</span
            ><strong
              >{{ formatBytes(instanceInfo.info?.memoryUsage)
              }}{{
                instanceInfo.info?.memoryLimit
                  ? ` / ${formatBytes(instanceInfo.info.memoryLimit)}`
                  : ""
              }}</strong
            >
          </div>
          <VProgressLinear
            :model-value="memoryPercent"
            color="secondary"
            height="6"
            rounded="xl"
            class="metric-bar"
          />
          <div class="metric-grid">
            <div>
              <span>{{ t("TXT_CODE_network_bandwidth") }}</span
              ><strong
                >rx {{ formatBytes(instanceInfo.info?.rxRate) }}/s, tx
                {{ formatBytes(instanceInfo.info?.txRate) }}/s</strong
              >
            </div>
            <div>
              <span>{{ t("TXT_CODE_DISK_USAGE") }}</span
              ><strong>{{ formatBytes(instanceInfo.info?.storageUsage) }}</strong>
            </div>
            <div v-if="instanceInfo.info?.mcPingOnline">
              <span>{{ t("TXT_CODE_e4dce83f") }}</span
              ><strong
                >{{ instanceInfo.info.currentPlayers }} /
                {{ instanceInfo.info.maxPlayers }}</strong
              >
            </div>
          </div>
        </VCardText>
      </VCard>

      <VRow v-if="instanceInfo" class="console-summary">
        <VCol cols="12" lg="7" class="console-function-column">
          <VCard v-if="instanceFunctionItems.length" class="console-function-card" rounded="xl" flat>
            <VCardTitle class="console-function-title">
              <VIcon icon="mdi-view-grid-outline" color="info" class="mr-2" />
              {{ t("TXT_CODE_efd37c48") }}
            </VCardTitle>
            <VCardText>
              <VRow class="console-function-grid">
                <VCol
                  v-for="(item, index) in instanceFunctionItems"
                  :key="`${item.title}-${index}`"
                  cols="12"
                  sm="6"
                  md="4"
                  lg="3"
                >
                  <VCard class="console-function-item" rounded="xl" flat @click="item.click">
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
          <VCard class="summary-card" rounded="xl" flat>
            <VCardTitle
              ><VIcon icon="mdi-information-outline" color="info" class="mr-2" />{{
                t("TXT_CODE_eadb4f60")
              }}</VCardTitle
            >
            <VCardText class="info-list">
              <div>
                <span>{{ t("TXT_CODE_2f291d8b") }}</span
                ><strong>{{ instanceTypeText }}</strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_34611898") }}</span
                ><strong>{{ instanceInfo.config.lastDatetime || "--" }}</strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_30051f9b") }}</span
                ><strong class="mono">{{ instanceInfo.instanceUuid }}</strong>
              </div>
              <div>
                <span>{{ t("TXT_CODE_5f2d2e30") }}</span
                ><strong class="mono">{{ daemonId }}</strong>
              </div>
              <VDivider class="my-2" />
              <div class="tag-list">
                <VChip
                  v-for="tag in instanceInfo.config.tag || []"
                  :key="tag"
                  size="small"
                  variant="tonal"
                  >{{ tag }}</VChip
                >
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
      ref="eventConfigDialog"
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
.console-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.console-card {
  background: var(--background-color-white);
}
.console-card-content {
  padding: 12px;
}
.console-function-card {
  height: 100%;
  margin-top: 0;
  background: var(--background-color-white);
}
.console-state-card {
  margin-top: 16px;
  margin-bottom: 8px;
}
.console-function-column {
  order: 2;
}
.console-basic-column {
  order: 1;
}
.console-function-title {
  display: flex;
  align-items: center;
  padding: 18px 20px 8px;
  color: var(--text-color);
  font-size: 16px;
}
.console-function-grid {
  margin: 0 -8px;
}
.console-function-grid > .v-col {
  padding: 8px;
}
.console-function-item {
  height: 100%;
  cursor: pointer;
  background: var(--color-gray-2);
  transition: background-color 0.2s ease;
}
.console-function-item:hover {
  background: rgba(var(--v-theme-primary), 0.07);
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
.console-summary {
  margin: 0 -8px;
}
.console-summary > .v-col {
  padding: 8px;
}
.summary-card {
  height: 100%;
  background: var(--background-color-white);
}
.summary-card :deep(.v-card-title) {
  display: flex;
  align-items: center;
  padding: 18px 20px 8px;
  color: var(--text-color);
  font-size: 16px;
}
.summary-card :deep(.v-card-text) {
  padding: 10px 20px 20px;
}
.metric-row,
.info-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-gray-7);
  font-size: 13px;
}
.metric-row strong,
.info-list strong {
  overflow: hidden;
  color: var(--text-color);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-bar {
  margin: 6px 0 14px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.metric-grid div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--color-gray-7);
  font-size: 12px;
}
.metric-grid strong {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
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
}
@media (max-width: 992px) {
  .instance-console-container {
    padding: 8px 12px 24px;
  }
  .desktop-actions > .v-btn:not(:first-child) {
    display: none;
  }
}
</style>
