<script setup lang="ts">
import DesktopDialog from "@/components/DesktopDialog.vue";
import { t } from "@/lang/i18n";
import { addJava, deleteJava, downloadJava, usingJava } from "../api";
import { parseTimestamp } from "@/tools/time";
import type { AddJavaConfigItem, DownloadJavaConfigItem, JavaInfo } from "../types";
import { notifyDesktop } from "@/tools/desktopNotice";
import { computed, onUnmounted, ref } from "vue";
import { VAlert, VBtn, VDataTable, VIcon, VTextField } from "vuetify/components";

import { useJavaList } from "../hooks/useJavaList";
import JavaVersionSelect from "../components/JavaVersionSelect.vue";
import JavaRuntimeStatus from "../components/JavaRuntimeStatus.vue";

const BuildOutlined = "mdi-hammer-wrench";
const DownloadOutlined = "mdi-cloud-download-outline";

const props = defineProps<{
    instanceUuid?: string;
    instanceId?: string;
    daemonId: string;
}>();

const resolvedInstanceId = computed(() => props.instanceUuid ?? props.instanceId ?? "");

const emit = defineEmits<{
    (e: "close"): void;
}>();

const headers = [
    { title: t("TXT_CODE_151d2bb7"), key: "fullname", align: "center" as const },
    { title: t("TXT_CODE_a2e79565"), key: "installTime", align: "center" as const },
    { title: t("TXT_CODE_759fb403"), key: "status", align: "center" as const },
    { title: t("TXT_CODE_fe731dfc"), key: "actions", align: "center" as const, sortable: false }
] as const;

const { javaList, loading: listLoading, error: listError, refresh } = useJavaList({
    daemonId: () => props.daemonId,
    instanceId: () => resolvedInstanceId.value,
    active: () => true
});
const refreshJavaList = async (out: boolean = false) => {
    try {
        await refresh(true);
        if (out) notifyDesktop(t("TXT_CODE_fbde647e"), "success");
    } catch (err: any) {
        notifyDesktop(err.message, "error");
    }
};

const addJavaDialog = ref({
    show: false,
    data: { name: "", path: "" } as AddJavaConfigItem,
    resolve: null as ((value: AddJavaConfigItem | undefined) => void) | null
});

const handleAddJava = async () => {
    addJavaDialog.value.data = { name: "", path: "" };

    return new Promise<AddJavaConfigItem | undefined>((resolve) => {
        addJavaDialog.value.show = true;
        addJavaDialog.value.resolve = resolve;
    }).then(async (data) => {
        if (!data) return;
        try {
            await addJava().execute({
                params: {
                    daemonId: props.daemonId ?? ""
                },
                data: {
                    name: data.name,
                    path: data.path
                }
            });
        } catch (err: any) {
            notifyDesktop(err.message, "error");
        }
        notifyDesktop(t("TXT_CODE_10f0f8d"), "success");
        await refreshJavaList();
    });
};

const confirmAddJava = () => {
    const { data, resolve } = addJavaDialog.value;
    if (!data.name || !data.path) {
        notifyDesktop(t("TXT_CODE_b5095a15"), "warning");
        return;
    }
    addJavaDialog.value.show = false;
    if (resolve) resolve({ name: data.name, path: data.path });
    addJavaDialog.value.resolve = null;
};

const cancelAddJava = () => {
    const { resolve } = addJavaDialog.value;
    addJavaDialog.value.show = false;
    if (resolve) resolve(undefined);
    addJavaDialog.value.resolve = null;
};

const downloadJavaDialog = ref({
    show: false,
    installedList: [] as string[],
    version: "",
    resolve: null as ((value: DownloadJavaConfigItem | undefined) => void) | null
});

const handleDownloadJava = async () => {
    const installedList = javaList.value.filter((item) => !item.info.error).map((item) => item.info.fullname);
    downloadJavaDialog.value.installedList = installedList;
    downloadJavaDialog.value.version = "";

    return new Promise<DownloadJavaConfigItem | undefined>((resolve) => {
        downloadJavaDialog.value.show = true;
        downloadJavaDialog.value.resolve = resolve;
    }).then(async (data) => {
        if (!data) return;
        await startDownload(data.version);
    });
};

const startDownload = async (version: string) => {
    try {
        await downloadJava().execute({
            params: { daemonId: props.daemonId, instanceId: resolvedInstanceId.value },
            data: { name: "msl", version }
        });
        notifyDesktop(t("TXT_CODE_5e7a4c02"), "success");
        await refreshJavaList();
    } catch (err: any) {
        notifyDesktop(err.message, "error");
    }
};

const confirmDownloadJava = () => {
    const { resolve } = downloadJavaDialog.value;
    const version = downloadJavaDialog.value.version;
    if (!version) {
        notifyDesktop(t("TXT_CODE_javaMsl.selectJava"), "warning");
        return;
    }
    downloadJavaDialog.value.show = false;
    if (resolve) resolve({ name: "msl", version });
    downloadJavaDialog.value.resolve = null;
};

const cancelDownloadJava = () => {
    const { resolve } = downloadJavaDialog.value;
    downloadJavaDialog.value.show = false;
    if (resolve) resolve(undefined);
    downloadJavaDialog.value.resolve = null;
};

const handleDeleteJava = async (info: JavaInfo) => {
    try {
        await deleteJava().execute({
            params: {
                daemonId: props.daemonId ?? "",
                instanceId: resolvedInstanceId.value
            },
            data: {
                id: info.fullname
            }
        });
    } catch (err: any) {
        notifyDesktop(err.message, "error");
    }
    await refreshJavaList();
};

const handleUsingJava = async (info: JavaInfo) => {
    try {
        await usingJava().execute({
            params: {
                daemonId: props.daemonId ?? "",
                instanceId: resolvedInstanceId.value
            },
            data: {
                id: info.fullname
            }
        });
        notifyDesktop(t("TXT_CODE_d3de39b4"), "success");
    } catch (err: any) {
        notifyDesktop(err.message, "error");
    }
    await refreshJavaList();
};

onUnmounted(() => {

    cancelAddJava();
    cancelDownloadJava();
});
</script>

<template>
    <div class="djava-config">
        <div class="djava-config__body">
            <p class="djava-config__hint">
                {{ t("TXT_CODE_ebf01bcc") }}<br />
                {{ t("TXT_CODE_e1c637bb").replace("<mcsm_java>", "{mcsm_java}") }}
            </p>

            <div class="djava-config__toolbar">
                <VBtn variant="text" @click="handleAddJava()">
                    <VIcon icon="mdi-plus" />
                    {{ t("TXT_CODE_8900e7ee") }}
                </VBtn>
                <VBtn variant="text" @click="handleDownloadJava()">
                    <VIcon :icon="DownloadOutlined" />
                    {{ t("TXT_CODE_9c48100e") }}
                </VBtn>
                <VBtn variant="text" @click="refreshJavaList(true)">
                    <VIcon icon="mdi-refresh" />
                    {{ t("TXT_CODE_b76d94e0") }}
                </VBtn>
            </div>

            <VAlert v-if="listError" type="error" variant="tonal" class="mt-3">{{ listError }}</VAlert>
            <VDataTable :loading="listLoading" class="djava-table mt-3" :headers="headers" :items="javaList || []" :items-per-page="15">
                <template #item.fullname="{ item }">{{ item.info.fullname || "-" }}</template>
                <template #item.installTime="{ item }">{{ item.info.installTime ? t(parseTimestamp(item.info.installTime)) : "-" }}</template>
                <template #item.status="{ item }">
                    <JavaRuntimeStatus :runtime="item" />
                </template>
                <template #item.actions="{ item }">
                    <div class="djava-config__actions">
                        <VBtn v-if="item.info.error && /^msl_[0-9]+$/.test(item.info.fullname)"
                            variant="text" size="small" @click="startDownload(item.info.fullname.slice(4))">{{ t("TXT_CODE_9277af78") }}</VBtn>
                        <VBtn v-if="item.info.fullname == ''" variant="text" size="small" disabled>
                            {{ t("TXT_CODE_979520ef") }}
                        </VBtn>
                        <VBtn v-else variant="text" size="small" :disabled="item.info.downloading || !!item.info.error"
                            @click="handleUsingJava(item.info as JavaInfo)">
                            <VIcon icon="mdi-check-circle-outline" />
                            {{ t("TXT_CODE_f0dcc8bf") }}
                        </VBtn>
                        <VBtn color="error" variant="text" size="small" :disabled="item.info.downloading"
                            @click="handleDeleteJava(item.info as JavaInfo)">
                            <VIcon icon="mdi-delete-outline" />
                            {{ t("TXT_CODE_ecbd7449") }}
                        </VBtn>
                    </div>
                </template>
            </VDataTable>
        </div>
        <div class="djava-config__footer">
            <VBtn class="djava-btn djava-btn--primary" variant="text" @click="emit('close')">
                <VIcon icon="mdi-close" />
                {{ t("TXT_CODE_31e92ef3") }}
            </VBtn>
        </div>

        <DesktopDialog
          id="java-manager-add-dialog"
          :title="t('TXT_CODE_8900e7ee')"
          :icon="BuildOutlined"
          :model-value="addJavaDialog.show"
          :width="420"
          :height="315"
          :z-index="10002"
          @close="cancelAddJava"
        >
          <VTextField v-model="addJavaDialog.data.name" :label="t('TXT_CODE_3f36206f')"
              :placeholder="t('TXT_CODE_4ea93630')" variant="solo" density="compact" hide-details class="mb-4" />
          <VTextField v-model="addJavaDialog.data.path" :label="t('TXT_CODE_43422ed3')"
              :placeholder="t('TXT_CODE_4ea93630')" variant="solo" density="compact" hide-details />
          <template #footer>
            <VBtn class="djava-btn djava-btn--default" variant="text" @click="cancelAddJava">
                {{ t("TXT_CODE_a0451c97") }}
            </VBtn>
            <VBtn class="djava-btn djava-btn--primary" variant="text" @click="confirmAddJava">
                <VIcon icon="mdi-check" />
                {{ t("TXT_CODE_d507abff") }}
            </VBtn>
          </template>
        </DesktopDialog>

        <DesktopDialog
          id="java-manager-download-dialog"
          :title="t('TXT_CODE_84588601')"
          :icon="DownloadOutlined"
          :model-value="downloadJavaDialog.show"
          :width="700"
          :height="460"
          :z-index="10002"
          @close="cancelDownloadJava"
        >
          <JavaVersionSelect v-model="downloadJavaDialog.version" :daemon-id="daemonId"
              :installed-java-list="downloadJavaDialog.installedList" />
          <template #footer>
            <VBtn class="djava-btn djava-btn--default" variant="text" @click="cancelDownloadJava">
                {{ t("TXT_CODE_a0451c97") }}
            </VBtn>
            <VBtn class="djava-btn djava-btn--primary" variant="text"
                :disabled="!downloadJavaDialog.version" @click="confirmDownloadJava">
                <VIcon icon="mdi-check" />
                {{ t("TXT_CODE_d507abff") }}
            </VBtn>
          </template>
        </DesktopDialog>
    </div>
</template>

<style lang="scss" scoped>
.djava-config {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
    overflow: hidden;

    &__body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
    }

    &__hint {
        margin: 0 0 12px;
        color: var(--desktop-window-text-secondary);
        line-height: 1.5;
    }

    &__toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 12px;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
    }

    &__footer {
        display: flex;
        justify-content: flex-end;
        padding: 12px 16px;
        flex-shrink: 0;
    }
}

.djava-btn {
    background: var(--desktop-window-titlebar-bg);
    color: var(--desktop-window-text);

    &:hover:not(:disabled) {
        background: var(--desktop-window-control-hover);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--primary {
        color: #1677ff;
        background: rgba(22, 119, 255, 0.1);

        &:hover:not(:disabled) {
            background: rgba(22, 119, 255, 0.2);
        }

        &--primary:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }
}

</style>
