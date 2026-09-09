<script setup lang="ts">
import { t } from "@/lang/i18n";
import { addJava, deleteJava, downloadJava, getJavaList, usingJava } from "../api";
import { parseTimestamp } from "@/tools/time";
import type { AddJavaConfigItem, DownloadJavaConfigItem, JavaInfo, JavaRuntime } from "../types";
import { notifyDesktop } from "../../../desktop/src/desktopNotice";
import { computed, onUnmounted, ref, type Ref } from "vue";
import { ctx } from "@/plugin/context";
import { VBtn, VCard, VCardText, VChip, VDataTable, VIcon, VTextField } from "vuetify/components";

const BuildOutlined = "mdi-hammer-wrench";
const DownloadOutlined = "mdi-cloud-download-outline";
const AppstoreOutlined = "mdi-language-java";

const props = defineProps<{
    instanceUuid?: string;
    instanceId?: string;
    daemonId: string;
}>();

const resolvedInstanceId = computed(() => props.instanceUuid ?? props.instanceId ?? "");
const desktopWindowComponent = computed(() => ctx.desktop.window);

const emit = defineEmits<{
    (e: "close"): void;
}>();

const headers = [
    { title: t("TXT_CODE_151d2bb7"), key: "fullname", align: "center" as const },
    { title: t("TXT_CODE_a2e79565"), key: "installTime", align: "center" as const },
    { title: t("TXT_CODE_759fb403"), key: "status", align: "center" as const },
    { title: t("TXT_CODE_fe731dfc"), key: "actions", align: "center" as const, sortable: false }
] as const;

const javaList: Ref<JavaRuntime[] | undefined> = ref([]);
const refreshJavaList = async (out: boolean = false) => {
    try {
        const list = await getJavaList().execute({
            params: {
                daemonId: props.daemonId ?? "",
                instanceId: resolvedInstanceId.value
            }
        });
        javaList.value = list.value;
        if (out) notifyDesktop(t("TXT_CODE_fbde647e"), "success");
    } catch (err: any) {
        notifyDesktop(err.message, "error");
    }
};

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

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

const JAVA_OPTIONS: DownloadJavaConfigItem[] = [
    { name: "zulu", version: "8" },
    { name: "zulu", version: "11" },
    { name: "zulu", version: "15" },
    { name: "zulu", version: "17" },
    { name: "zulu", version: "21" },
    { name: "zulu", version: "25" }
];

const downloadJavaDialog = ref({
    show: false,
    installedList: [] as string[],
    selectedIndex: null as number | null,
    resolve: null as ((value: DownloadJavaConfigItem | undefined) => void) | null
});

const selectedDownloadItem = ref<DownloadJavaConfigItem | null>(null);

const handleDownloadJava = async () => {
    const installedList = javaList.value?.map((item) => item.info.fullname) ?? [];
    downloadJavaDialog.value.installedList = installedList;
    downloadJavaDialog.value.selectedIndex = null;
    selectedDownloadItem.value = null;

    return new Promise<DownloadJavaConfigItem | undefined>((resolve) => {
        downloadJavaDialog.value.show = true;
        downloadJavaDialog.value.resolve = resolve;
    }).then(async (data) => {
        if (!data) return;
        try {
            await downloadJava().execute({
                params: {
                    daemonId: props.daemonId ?? "",
                    instanceId: resolvedInstanceId.value
                },
                data: {
                    name: data.name,
                    version: data.version
                }
            });
            notifyDesktop(t("TXT_CODE_5e7a4c02"), "success");
            await refreshJavaList();
        } catch (err: any) {
            notifyDesktop(err.message, "error");
        }
        await refreshJavaList();
    });
};

const handleSelectDownloadItem = (index: number) => {
    downloadJavaDialog.value.selectedIndex = index;
    selectedDownloadItem.value = JAVA_OPTIONS[index];
};

const confirmDownloadJava = () => {
    const { resolve } = downloadJavaDialog.value;
    const item = selectedDownloadItem.value;
    if (!item) {
        notifyDesktop(t("TXT_CODE_b5095a15"), "warning");
        return;
    }
    downloadJavaDialog.value.show = false;
    if (resolve) resolve({ name: item.name, version: item.version });
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

refreshJavaList();

const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
};
window.addEventListener("resize", updateWindowSize);
onUnmounted(() => window.removeEventListener("resize", updateWindowSize));
</script>

<template>
    <div class="djava-config">
        <div class="djava-config__body">
            <p class="djava-config__hint">
                {{ t("TXT_CODE_ebf01bcc") }}<br />
                {{ t("TXT_CODE_e1c637bb").replace("<mcsm_java>", "{mcsm_java}") }}
            </p>

            <div class="djava-config__toolbar">
                <VBtn variant="text" rounded="xl" @click="handleAddJava()">
                    <VIcon icon="mdi-plus" />
                    {{ t("TXT_CODE_8900e7ee") }}
                </VBtn>
                <VBtn variant="text" rounded="xl" @click="handleDownloadJava()">
                    <VIcon :icon="DownloadOutlined" />
                    {{ t("TXT_CODE_9c48100e") }}
                </VBtn>
                <VBtn variant="text" rounded="xl" @click="refreshJavaList(true)">
                    <VIcon icon="mdi-refresh" />
                    {{ t("TXT_CODE_b76d94e0") }}
                </VBtn>
            </div>

            <VDataTable class="djava-table mt-3" :headers="headers" :items="javaList || []" :items-per-page="15">
                <template #item.fullname="{ item }">{{ item.info.fullname || "-" }}</template>
                <template #item.installTime="{ item }">{{ item.info.installTime ? t(parseTimestamp(item.info.installTime)) : "-" }}</template>
                <template #item.status="{ item }">
                    <VChip size="small" variant="tonal" :color="item.usingInstances.length > 0 ? 'success' : item.info.downloading ? 'warning' : 'default'">
                        {{ item.usingInstances.length > 0 ? t("TXT_CODE_bdb620b9") : item.info.downloading ? t("TXT_CODE_d919f7c7") : t("TXT_CODE_15f2e564") }}
                    </VChip>
                </template>
                <template #item.actions="{ item }">
                    <div class="djava-config__actions">
                        <VBtn v-if="item.info.fullname == ''" variant="text" size="small" disabled>
                            {{ t("TXT_CODE_979520ef") }}
                        </VBtn>
                        <VBtn v-else variant="text" size="small" :disabled="item.info.downloading"
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
            <VBtn class="djava-btn djava-btn--primary" variant="text" rounded="xl" @click="emit('close')">
                <VIcon icon="mdi-close" />
                {{ t("TXT_CODE_31e92ef3") }}
            </VBtn>
        </div>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <component :is="desktopWindowComponent" v-if="desktopWindowComponent && addJavaDialog.show" id="java-manager-add-dialog" :title="t('TXT_CODE_8900e7ee')"
                    :icon="BuildOutlined" :visible="addJavaDialog.show" :minimized="false" :maximized="false"
                    :active="true" :initial-width="420" :initial-height="315" :initial-x="windowWidth / 2 - 210"
                    :initial-y="windowHeight / 2 - 140" :z-index="10002" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="cancelAddJava">
                    <div class="djava-dialog-content">
                        <div class="djava-dialog__body">
                            <VTextField v-model="addJavaDialog.data.name" :label="t('TXT_CODE_3f36206f')"
                                :placeholder="t('TXT_CODE_4ea93630')" variant="solo" density="compact" hide-details class="mb-4" />
                            <VTextField v-model="addJavaDialog.data.path" :label="t('TXT_CODE_43422ed3')"
                                :placeholder="t('TXT_CODE_4ea93630')" variant="solo" density="compact" hide-details />
                        </div>
                        <div class="djava-dialog__footer">
                            <VBtn class="djava-btn djava-btn--default" variant="text" rounded="xl" @click="cancelAddJava">
                                {{ t("TXT_CODE_a0451c97") }}
                            </VBtn>
                            <VBtn class="djava-btn djava-btn--primary" variant="text" rounded="xl" @click="confirmAddJava">
                                <VIcon icon="mdi-check" />
                                {{ t("TXT_CODE_d507abff") }}
                            </VBtn>
                        </div>
                    </div>
                </component>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <component :is="desktopWindowComponent" v-if="desktopWindowComponent && downloadJavaDialog.show" id="java-manager-download-dialog"
                    :title="t('TXT_CODE_84588601')" :icon="DownloadOutlined" :visible="downloadJavaDialog.show"
                    :minimized="false" :maximized="false" :active="true" :initial-width="700" :initial-height="460"
                    :initial-x="windowWidth / 2 - 350" :initial-y="windowHeight / 2 - 230" :z-index="10002"
                    :show-minimize="false" :show-maximize="false" :resizable="false" @close="cancelDownloadJava">
                    <div class="djava-dialog-content">
                        <div class="djava-dialog__body">
                            <div class="djava-download-grid">
                                <div v-for="(item, index) in JAVA_OPTIONS" :key="`${item.name}-${item.version}`"
                                    class="djava-download-card"
                                    :class="{ 'djava-download-card--selected': downloadJavaDialog.selectedIndex === index }"
                                    @click="handleSelectDownloadItem(index)">
                                    <div class="djava-download-card__cover">
                                        <VIcon :icon="AppstoreOutlined" class="djava-download-card__icon" />
                                    </div>
                                    <div class="djava-download-card__info">
                                        <strong>
                                            Java {{ item.version.toUpperCase() }}
                                        </strong>
                                        <VChip color="primary" size="x-small" variant="tonal">{{ item.name.toUpperCase() }}</VChip>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="djava-dialog__footer">
                            <VBtn class="djava-btn djava-btn--default" variant="text" rounded="xl" @click="cancelDownloadJava">
                                {{ t("TXT_CODE_a0451c97") }}
                            </VBtn>
                            <VBtn class="djava-btn djava-btn--primary" variant="text" rounded="xl"
                                :disabled="downloadJavaDialog.selectedIndex === null" @click="confirmDownloadJava">
                                <VIcon icon="mdi-check" />
                                {{ t("TXT_CODE_d507abff") }}
                            </VBtn>
                        </div>
                    </div>
                </component>
            </Transition>
        </Teleport>
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

.dfm-dialog-fade-enter-active,
.dfm-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.dfm-dialog-fade-enter-from,
.dfm-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.djava-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.djava-dialog__body {
    padding: 16px 20px;
    flex: 1;
    overflow-y: auto;
}

.djava-dialog__footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
}

.djava-download-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: flex-start;
}

.djava-download-card {
    width: 140px;
    cursor: pointer;
    transition: all 0.3s ease;
    border-radius: 12px;
    overflow: hidden;
    background: var(--desktop-window-titlebar-bg);

    &:hover {
        background: var(--desktop-window-control-hover);
    }

    &--selected {
        background: linear-gradient(135deg, rgba(24, 144, 255, 0.1), rgba(24, 144, 255, 0.05));
    }

    &__cover {
        padding: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        background: linear-gradient(135deg, var(--desktop-window-control-hover) 0%, var(--desktop-window-border) 100%);
    }

    &__icon {
        font-size: 48px;
        line-height: 1;
    }

    &__info {
        padding: 12px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }
}
</style>
