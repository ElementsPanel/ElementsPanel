<script setup lang="ts">
import { useAppRouters } from "@/hooks/useAppRouters";
import {
    TYPE_MINECRAFT_JAVA,
    TYPE_STEAM_SERVER_UNIVERSAL,
    useInstanceInfo
} from "@/hooks/useInstance";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { useServerConfig } from "@/hooks/useServerConfig";
import { t } from "@/lang/i18n";
import { modListApi } from "@/services/apis/modManager";
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
    AppstoreAddOutlined,
    BuildOutlined,
    CloudDownloadOutlined,
    CodeOutlined,
    ControlOutlined,
    DashboardOutlined,
    FieldTimeOutlined,
    FileTextOutlined,
    FolderOpenOutlined,
    UsbOutlined,
    UsergroupDeleteOutlined
} from "@ant-design/icons-vue";
import { computed, ref, watch } from "vue";
import { arrayFilter } from "../../tools/array";
import EventConfig from "../instance/dialogs/EventConfig.vue";
import InstanceDetail from "../instance/dialogs/InstanceDetail.vue";
import InstanceFundamentalDetail from "../instance/dialogs/InstanceFundamentalDetail.vue";
import McPingSettings from "../instance/dialogs/McPingSettings.vue";
import PingConfig from "../instance/dialogs/PingConfig.vue";
import RconSettings from "../instance/dialogs/RconSettings.vue";
import DesktopInstanceLog from "./DesktopInstanceLog.vue";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "open-server-config", type: string): void;
    (e: "open-file-manager"): void;
    (e: "open-mod-manager"): void;
    (e: "open-schedule"): void;
    (e: "open-event-config"): void;
    (e: "open-term-config"): void;
    (e: "open-mc-ping"): void;
    (e: "open-java-manager"): void;
    (e: "open-backup"): void;
}>();

const { isAdmin, state } = useAppStateStore();
const { toPage: toOtherPager } = useAppRouters();
const { state: overviewState } = useOverviewInfo();

const rconSettingsDialog = ref<InstanceType<typeof RconSettings>>();
const mcSettingsDialog = ref<InstanceType<typeof McPingSettings>>();
const eventConfigDialog = ref<InstanceType<typeof EventConfig>>();
const pingConfigDialog = ref<InstanceType<typeof PingConfig>>();
const instanceDetailsDialog = ref<InstanceType<typeof InstanceDetail>>();
const instanceFundamentalDetailDialog = ref<InstanceType<typeof InstanceFundamentalDetail>>();
const instanceLogDialog = ref<InstanceType<typeof DesktopInstanceLog>>();

const { instanceInfo, execute, isGlobalTerminal } = useInstanceInfo({
    instanceId: props.instanceId,
    daemonId: props.daemonId,
    autoRefresh: true
});

const { serverConfigFiles, refresh: refreshServerConfig } = useServerConfig();

const folders = ref<string[]>([]);
const foldersLoaded = ref(false);

const loadFolders = async () => {
    if (!props.instanceId || !props.daemonId) return;
    try {
        const { execute } = modListApi();
        const res = await execute({
            params: {
                uuid: props.instanceId,
                daemonId: props.daemonId
            }
        });
        folders.value = res.value?.folders || [];
    } catch (err) {
        console.error("Failed to load folders:", err);
    } finally {
        foldersLoaded.value = true;
    }
};

watch(
    () => [props.instanceId, props.daemonId],
    () => {
        loadFolders();
    },
    { immediate: true }
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
            title: t("TXT_CODE_ae533703"),
            icon: FolderOpenOutlined,
            click: () => {
                emit("open-file-manager");
            },
            condition: () => state.settings.canFileManager || isAdmin.value
        },
        {
            title: t("TXT_CODE_MOD_MANAGER"),
            icon: UsbOutlined,
            click: () => {
                emit("open-mod-manager");
            },
            condition: () => {
                const type = instanceInfo.value?.config.type || "";
                const isMC = type.startsWith("minecraft/java") || type.startsWith("minecraft/bedrock");
                if (!isMC) return false;
                const hasPermission = state.settings.canFileManager || isAdmin.value;
                if (!hasPermission) return false;
                if (!foldersLoaded.value) return false;
                return folders.value && folders.value.length > 0;
            }
        },
        {
            title: t("TXT_CODE_3fee13ed"),
            icon: BuildOutlined,
            click: () => {
                emit("open-java-manager");
            },
            condition: () =>
                (instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) &&
                    instanceInfo.value?.config.processType === "general" &&
                    (state.settings.allowJavaManager || isAdmin.value)) ??
                false
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
            title: t("TXT_CODE_d23631cb"),
            icon: CodeOutlined,
            click: () => {
                emit("open-term-config");
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
            title: t("TXT_CODE_40241d8e"),
            icon: UsergroupDeleteOutlined,
            click: () => {
                emit("open-mc-ping");
            },
            condition: () => instanceInfo.value?.config.type.includes(TYPE_MINECRAFT_JAVA) ?? false
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
        {
            title: t("TXT_CODE_INSTANCE_BACKUP"),
            icon: CloudDownloadOutlined,
            condition: () => {
                const daemon = overviewState.value?.remote?.find((v: any) => v.uuid === props.daemonId) as any;
                return !isGlobalTerminal.value && daemon?.features?.instanceBackup;
            },
            click: () => {
                emit("open-backup");
            }
        }
    ]);
});

watch(instanceInfo, (cfg, oldCfg) => {
    if (cfg?.config?.type && props.instanceId && props.daemonId && cfg.config.type !== oldCfg?.config?.type) {
        refreshServerConfig(cfg.config.type, props.instanceId, props.daemonId);
    }
});
</script>

<template>
    <div class="dim-mgr-btns">
        <div class="dim-mgr-btns__title">{{ t("TXT_CODE_efd37c48") }}</div>
        <div class="dim-mgr-btns__row">
            <div v-for="btn in btns" :key="btn.title" class="dim-mgr-btn" :title="btn.title" @click="btn.click">
                <component :is="btn.icon" />
            </div>
            <div class="dim-mgr-btn dim-mgr-btn--log" :title="t('TXT_CODE_f6a33629')"
                @click="instanceLogDialog?.openDialog()" style="margin-left: auto;">
                <FileTextOutlined />
            </div>
        </div>
    </div>

    <EventConfig ref="eventConfigDialog" :instance-info="instanceInfo" :instance-id="props.instanceId"
        :daemon-id="props.daemonId" @update="refreshInstanceInfo" />

    <PingConfig ref="pingConfigDialog" :instance-info="instanceInfo" :instance-id="props.instanceId"
        :daemon-id="props.daemonId" @update="refreshInstanceInfo" />

    <InstanceDetail ref="instanceDetailsDialog" :instance-info="instanceInfo" :instance-id="props.instanceId"
        :daemon-id="props.daemonId" @update="refreshInstanceInfo" />

    <InstanceFundamentalDetail ref="instanceFundamentalDetailDialog" :instance-info="instanceInfo"
        :instance-id="props.instanceId" :daemon-id="props.daemonId" @update="refreshInstanceInfo" />

    <RconSettings ref="rconSettingsDialog" :instance-info="instanceInfo" :instance-id="props.instanceId"
        :daemon-id="props.daemonId" @update="refreshInstanceInfo" />

    <McPingSettings ref="mcSettingsDialog" :instance-info="instanceInfo" :instance-id="props.instanceId"
        :daemon-id="props.daemonId" @update="refreshInstanceInfo" />

    <DesktopInstanceLog ref="instanceLogDialog" :instance-id="props.instanceId" :daemon-id="props.daemonId"
        :instance-name="instanceInfo?.config?.nickname" />

</template>

<style lang="scss" scoped>
.dim-mgr-btns {
    padding: 8px;
    border-top: 1px solid var(--desktop-window-border);

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
    border: 1px solid var(--desktop-window-border);
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
