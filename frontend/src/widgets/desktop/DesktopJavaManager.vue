<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { addJava, deleteJava, downloadJava, getJavaList, usingJava } from "@/services/apis/javaManager";
import { parseTimestamp } from "@/tools/time";
import type { AntColumnsType } from "@/types/ant";
import type { AddJavaConfigItem, DownloadJavaConfigItem, JavaInfo, JavaRuntime } from "@/types/javaManager";
import {
    AppstoreOutlined,
    BuildOutlined,
    DeleteOutlined,
    DownloadOutlined,
    PlusOutlined,
    ReloadOutlined
} from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { h, ref, type Ref } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const { isPhone } = useScreen();

const columns: AntColumnsType[] = [
    {
        align: "center",
        title: t("TXT_CODE_151d2bb7"),
        dataIndex: ["info", "fullname"],
        key: "fullname"
    },
    {
        align: "center",
        title: t("TXT_CODE_a2e79565"),
        dataIndex: ["info", "installTime"],
        key: "installTime",
        customRender: (e: { text: number }) => t(parseTimestamp(e.text))
    },
    {
        align: "center",
        title: t("TXT_CODE_759fb403"),
        key: "status",
        customRender: ({ record }: { record: JavaRuntime }) => {
            if (record.usingInstances.length > 0) return t("TXT_CODE_bdb620b9");
            else if (record.info.downloading) return t("TXT_CODE_d919f7c7");
            else return t("TXT_CODE_15f2e564");
        }
    },
    {
        align: "center",
        title: t("TXT_CODE_fe731dfc"),
        key: "actions",
        width: 250
    }
];

const javaList: Ref<JavaRuntime[] | undefined> = ref([]);
const isLoading = ref(false);

const { isLoading: updateLoading } = updateInstanceConfig();

const refreshJavaList = async (out: boolean = false) => {
    try {
        const list = await getJavaList().execute({
            params: {
                daemonId: props.daemonId ?? "",
                instanceId: props.instanceId ?? ""
            }
        });
        javaList.value = list.value;
        if (out) message.success(t("TXT_CODE_fbde647e"));
    } catch (err: any) {
        message.error(err.message);
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
            message.error(err.message);
        }
        message.success(t("TXT_CODE_10f0f8d"));
        await refreshJavaList();
    });
};

const confirmAddJava = () => {
    const { data, resolve } = addJavaDialog.value;
    if (!data.name || !data.path) {
        message.warning(t("TXT_CODE_b5095a15"));
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
                    instanceId: props.instanceId ?? ""
                },
                data: {
                    name: data.name,
                    version: data.version
                }
            });
            message.success(t("TXT_CODE_5e7a4c02"));
            await refreshJavaList();
        } catch (err: any) {
            message.error(err.message);
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
        message.warning(t("TXT_CODE_b5095a15"));
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
                instanceId: props.instanceId ?? ""
            },
            data: {
                id: info.fullname
            }
        });
    } catch (err: any) {
        message.error(err.message);
    }
    await refreshJavaList();
};

const handleUsingJava = async (info: JavaInfo) => {
    try {
        await usingJava().execute({
            params: {
                daemonId: props.daemonId ?? "",
                instanceId: props.instanceId ?? ""
            },
            data: {
                id: info.fullname
            }
        });
        message.success(t("TXT_CODE_d3de39b4"));
    } catch (err: any) {
        message.error(err.message);
    }
    await refreshJavaList();
};

refreshJavaList();

const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
};
window.addEventListener('resize', updateWindowSize);
</script>

<template>
    <div class="djava-config">
        <div class="djava-config__body">
            <a-typography-paragraph>
                <a-typography-text type="secondary">
                    {{ t("TXT_CODE_ebf01bcc") }}
                    <br />
                    {{ t("TXT_CODE_e1c637bb").replace("<mcsm_java>", "{mcsm_java}") }}
                </a-typography-text>
            </a-typography-paragraph>

            <div class="djava-config__toolbar">
                <a-button type="link" :icon="h(PlusOutlined)" @click="handleAddJava()">
                    {{ t("TXT_CODE_8900e7ee") }}
                </a-button>
                <a-button type="link" :icon="h(DownloadOutlined)" @click="handleDownloadJava()">
                    {{ t("TXT_CODE_9c48100e") }}
                </a-button>
                <a-button :icon="h(ReloadOutlined)" type="text" @click="refreshJavaList(true)">
                    {{ t("TXT_CODE_b76d94e0") }}
                </a-button>
            </div>

            <a-table class="mt-12" :data-source="javaList" :columns="columns" :scroll="{ x: 'max-content' }"
                :pagination="{
                    pageSize: 15
                }">
                <template #bodyCell="{ column, record }">
                    <div v-if="column.key === 'actions'" class="djava-config__actions">
                        <a-button v-if="record.info.fullname == ''" class="mr-8" type="link" :disabled="true">
                            {{ t("TXT_CODE_979520ef") }}
                        </a-button>
                        <a-button v-else class="mr-8" type="link" :disabled="record.info.downloading"
                            @click="handleUsingJava(record.info as JavaInfo)">
                            {{ t("TXT_CODE_f0dcc8bf") }}
                        </a-button>
                        <a-popconfirm :title="t('TXT_CODE_f4f86ba8')" :description="t('TXT_CODE_35631d1d')"
                            @confirm="handleDeleteJava(record.info as JavaInfo)">
                            <a-button danger type="link" :disabled="record.info.downloading">
                                {{ t("TXT_CODE_ecbd7449") }}
                                <DeleteOutlined />
                            </a-button>
                        </a-popconfirm>
                    </div>
                </template>
            </a-table>
        </div>
        <div class="djava-config__footer">
            <button class="djava-btn djava-btn--primary" @click="emit('close')">
                {{ t("TXT_CODE_31e92ef3") }}
            </button>
        </div>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="addJavaDialog.show" id="java-manager-add-dialog" :title="t('TXT_CODE_8900e7ee')"
                    :icon="BuildOutlined" :visible="addJavaDialog.show" :minimized="false" :maximized="false"
                    :active="true" :initial-width="420" :initial-height="315" :initial-x="windowWidth / 2 - 210"
                    :initial-y="windowHeight / 2 - 140" :z-index="10002" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="cancelAddJava">
                    <div class="djava-dialog-content">
                        <div class="djava-dialog__body">
                            <a-form layout="vertical">
                                <a-form-item :label="t('TXT_CODE_3f36206f')">
                                    <a-input v-model:value="addJavaDialog.data.name"
                                        :placeholder="t('TXT_CODE_4ea93630')" />
                                </a-form-item>
                                <a-form-item :label="t('TXT_CODE_43422ed3')">
                                    <a-input v-model:value="addJavaDialog.data.path"
                                        :placeholder="t('TXT_CODE_4ea93630')" />
                                </a-form-item>
                            </a-form>
                        </div>
                        <div class="djava-dialog__footer">
                            <button class="djava-btn djava-btn--default" @click="cancelAddJava">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="djava-btn djava-btn--primary" @click="confirmAddJava">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="downloadJavaDialog.show" id="java-manager-download-dialog"
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
                                        <AppstoreOutlined class="djava-download-card__icon" />
                                    </div>
                                    <div class="djava-download-card__info">
                                        <a-typography-text strong>
                                            Java {{ item.version.toUpperCase() }}
                                        </a-typography-text>
                                        <a-tag color="blue">{{ item.name.toUpperCase() }}</a-tag>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="djava-dialog__footer">
                            <button class="djava-btn djava-btn--default" @click="cancelDownloadJava">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="djava-btn djava-btn--primary"
                                :disabled="downloadJavaDialog.selectedIndex === null" @click="confirmDownloadJava">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
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
        border-top: 1px solid var(--desktop-window-border);
        flex-shrink: 0;
    }
}

.djava-btn {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    padding: 6px 16px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:hover:not(:disabled) {
        background: var(--desktop-window-control-hover);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--primary {
        color: #1677ff;
        border-color: rgba(22, 119, 255, 0.3);
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
        border: 1px solid var(--desktop-window-border);

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
    border-top: 1px solid var(--desktop-window-border);
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
    border: 1px solid var(--desktop-window-border);
    overflow: hidden;
    background: var(--desktop-window-titlebar-bg);

    &:hover {
        border-color: #1890ff;
    }

    &--selected {
        border-color: #1890ff;
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
