<script setup lang="ts">
import { useAppRouters } from "@/hooks/useAppRouters";
import { TYPE_STEAM_SERVER_UNIVERSAL, useInstanceInfo } from "@/hooks/useInstance";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { useServerConfig } from "@/hooks/useServerConfig";
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import type { PanelFrontendInstanceActionContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { computed, ref, watch } from "vue";
import { arrayFilter } from "@/tools/array";
import EventConfig from "@instance/widgets/instance/dialogs/EventConfig.vue";
import InstanceDetail from "@instance/widgets/instance/dialogs/InstanceDetail.vue";
import InstanceFundamentalDetail from "@instance/widgets/instance/dialogs/InstanceFundamentalDetail.vue";
import PingConfig from "@instance/widgets/instance/dialogs/PingConfig.vue";
import RconSettings from "@instance/widgets/instance/dialogs/RconSettings.vue";
import { VIcon } from "vuetify/components";

const ControlOutlined = "mdi-tune-variant";
const BuildOutlined = "mdi-hammer-wrench";
const FieldTimeOutlined = "mdi-clock-outline";
const DashboardOutlined = "mdi-view-dashboard-outline";
const AppstoreAddOutlined = "mdi-view-grid-plus-outline";

const instanceActionIconMap: Record<string, string> = {
  backup: "mdi-cloud-outline",
  "java-manager": "mdi-hammer-wrench",
  mcstats: "mdi-account-group-outline",
  "operation-log": "mdi-file-document-outline",
  "terminal-config": "mdi-code-tags",
  "file-manager": "mdi-folder-open-outline"
};

const props = defineProps<{
  instanceId: string;
  daemonId: string;
}>();

const emit = defineEmits<{
  (e: "open-server-config", type: string): void;
  (e: "open-schedule"): void;
  (e: "open-event-config"): void;
  (e: "open-instance-action", actionId: string): void;
}>();

const { isAdmin, state } = useAppStateStore();
const { toPage: toOtherPager } = useAppRouters();
const { state: overviewState } = useOverviewInfo();

const rconSettingsDialog = ref<InstanceType<typeof RconSettings>>();
const eventConfigDialog = ref<InstanceType<typeof EventConfig>>();
const pingConfigDialog = ref<InstanceType<typeof PingConfig>>();
const instanceDetailsDialog = ref<InstanceType<typeof InstanceDetail>>();
const instanceFundamentalDetailDialog = ref<InstanceType<typeof InstanceFundamentalDetail>>();

const { instanceInfo, execute, isGlobalTerminal } = useInstanceInfo({
  instanceId: props.instanceId,
  daemonId: props.daemonId,
  autoRefresh: true
});

const { serverConfigFiles, refresh: refreshServerConfig } = useServerConfig();

const desktopInstanceActions = computed(() =>
  ctx.actions.instances.filter((action) => action.desktopComponent)
);

const refreshInstanceInfo = async () => {
  await execute({
    params: {
      uuid: props.instanceId ?? "",
      daemonId: props.daemonId ?? ""
    },
    forceRequest: true
  });
};

const btns = computed(() => {
  if (!instanceInfo.value) return [];
  const daemon = overviewState.value?.remote?.find((item: any) => item.uuid === props.daemonId);
  const actionContext: PanelFrontendInstanceActionContext = {
    mode: "desktop",
    instanceId: props.instanceId,
    daemonId: props.daemonId,
    instanceInfo: instanceInfo.value,
    daemon,
    isGlobalTerminal: isGlobalTerminal.value
  };
  const pluginActions = desktopInstanceActions.value.map((action) => ({
    title: typeof action.title === "function" ? action.title() : action.title,
    icon: action.mdiIcon || instanceActionIconMap[action.id] || "mdi-cog-outline",
    condition: () => action.condition?.(actionContext) ?? true,
    click: () => emit("open-instance-action", action.id)
  }));
  return arrayFilter([
    {
      title: t("TXT_CODE_d07742fe"),
      icon: ControlOutlined,
      condition: () => {
        return (
          !isGlobalTerminal.value &&
          !!serverConfigFiles.value &&
          serverConfigFiles.value?.length > 0
        );
      },
      click: (): void => {
        emit("open-server-config", instanceInfo.value?.config.type ?? "");
      }
    },
    {
      title: t("TXT_CODE_656a85d8"),
      icon: BuildOutlined,
      click: () => {
        rconSettingsDialog.value?.openDialog();
      },
      condition: () =>
        instanceInfo.value?.config.type.includes(TYPE_STEAM_SERVER_UNIVERSAL) ?? false
    },
    {
      title: t("TXT_CODE_b7d026f8"),
      icon: FieldTimeOutlined,
      condition: () => !isGlobalTerminal.value,
      click: () => {
        emit("open-schedule");
      }
    },
    {
      title: t("TXT_CODE_d341127b"),
      icon: DashboardOutlined,
      click: () => {
        emit("open-event-config");
      }
    },
    {
      title: t("TXT_CODE_4f34fc28"),
      icon: AppstoreAddOutlined,
      condition: () => isAdmin.value,
      click: () => {
        instanceDetailsDialog.value?.openDialog();
      }
    },
    {
      title: t("TXT_CODE_4f34fc28"),
      icon: AppstoreAddOutlined,
      condition: () =>
        !isAdmin.value &&
        instanceInfo.value?.config.processType === "docker" &&
        state.settings.allowChangeCmd,
      click: () => {
        instanceFundamentalDetailDialog.value?.openDialog();
      }
    },
    ...pluginActions
  ]);
});

watch(instanceInfo, (cfg, oldCfg) => {
  if (
    cfg?.config?.type &&
    props.instanceId &&
    props.daemonId &&
    cfg.config.type !== oldCfg?.config?.type
  ) {
    refreshServerConfig(cfg.config.type, props.instanceId, props.daemonId);
  }
});
</script>

<template>
  <div class="dim-mgr-btns">
    <div class="dim-mgr-btns__title">{{ t("TXT_CODE_efd37c48") }}</div>
    <div class="dim-mgr-btns__row">
      <div
        v-for="btn in btns"
        :key="btn.title"
        class="dim-mgr-btn"
        :title="btn.title"
        @click="btn.click"
      >
        <VIcon :icon="btn.icon" size="small" />
      </div>
    </div>
  </div>

  <EventConfig
    ref="eventConfigDialog"
    :instance-info="instanceInfo"
    :instance-id="props.instanceId"
    :daemon-id="props.daemonId"
    @update="refreshInstanceInfo"
  />

  <PingConfig
    ref="pingConfigDialog"
    :instance-info="instanceInfo"
    :instance-id="props.instanceId"
    :daemon-id="props.daemonId"
    @update="refreshInstanceInfo"
  />

  <InstanceDetail
    ref="instanceDetailsDialog"
    :instance-info="instanceInfo"
    :instance-id="props.instanceId"
    :daemon-id="props.daemonId"
    @update="refreshInstanceInfo"
  />

  <InstanceFundamentalDetail
    ref="instanceFundamentalDetailDialog"
    :instance-info="instanceInfo"
    :instance-id="props.instanceId"
    :daemon-id="props.daemonId"
    @update="refreshInstanceInfo"
  />

  <RconSettings
    ref="rconSettingsDialog"
    :instance-info="instanceInfo"
    :instance-id="props.instanceId"
    :daemon-id="props.daemonId"
    @update="refreshInstanceInfo"
  />
</template>

<style lang="scss" scoped>
.dim-mgr-btns {
  padding: 8px;

  &__title {
    font-size: 10px;
    font-weight: 500;
    color: var(--desktop-window-text-muted);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
}

.dim-mgr-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 16px;
  color: var(--desktop-window-text-secondary);
  background: var(--desktop-window-titlebar-bg);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: var(--desktop-window-text);
    background: var(--desktop-window-control-hover);
    border-color: var(--desktop-window-border);
  }
}
</style>
