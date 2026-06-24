<script setup lang="ts">
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { makeSocketIo, SocketStatus } from "@/hooks/useSocketIo";
import { t } from "@/lang/i18n";
import { addNode, connectNode, deleteNode, editNode, remoteNodeList } from "@/services/apis";
import { hasVersionUpdate } from "@/tools/version";
import type { NodeStatus } from "@/types";
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ClusterOutlined,
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    SettingOutlined
} from "@ant-design/icons-vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import DesktopNodeAdvancedSettings from "./DesktopNodeAdvancedSettings.vue";
import DesktopWindow from "./DesktopWindow.vue";

const { execute: fetchNodesApi, isLoading: loading } = remoteNodeList();
const { execute: fetchNodesSilentApi } = remoteNodeList();
const { execute: addNodeApiExec } = addNode();
const { execute: editNodeApiExec } = editNode();
const { execute: deleteNodeApiExec } = deleteNode();
const { execute: connectNodeApiExec } = connectNode();

const { state: allDaemonData } = useOverviewInfo();
const specifiedDaemonVersion = computed(() => allDaemonData.value?.specifiedDaemonVersion);

const nodes = ref<NodeStatus[]>([]);
const searchQuery = ref("");

const socketStatusMap = reactive<Record<string, SocketStatus>>({});

const nodeVersionMap = computed<Record<string, string | undefined>>(() => {
    const map: Record<string, string | undefined> = {};
    const remotes = allDaemonData.value?.remote;
    if (remotes) {
        for (const remote of remotes) {
            map[remote.uuid] = remote.version;
        }
    }
    return map;
});

const testNodeSocket = async (node: NodeStatus) => {
    if (!node.available) {
        socketStatusMap[node.uuid] = SocketStatus.Error;
        return;
    }
    try {
        const addr = `${node.ip}:${node.port}`;
        const socket = makeSocketIo(addr, node.prefix);
        await new Promise<void>((resolve, reject) => {
            socket.on("connect", () => {
                socket.disconnect();
                resolve();
            });
            socket.on("connect_error", (error) => {
                reject(error);
            });
        });
        socketStatusMap[node.uuid] = SocketStatus.Connected;
    } catch {
        socketStatusMap[node.uuid] = SocketStatus.Error;
    }
};

const testAllSockets = async () => {
    for (const node of nodes.value) {
        await testNodeSocket(node).catch(() => { });
    }
};

const showDialog = ref(false);
const dialogMode = ref<"add" | "edit">("add");
const editingNode = ref<NodeStatus | null>(null);
const form = reactive({
    ip: "",
    port: 24444,
    remarks: "",
    apiKey: "",
    prefix: ""
});
const formError = ref("");
const saving = ref(false);

const showDeleteConfirm = ref(false);
const deletingNode = ref<NodeStatus | null>(null);

const showAdvancedSettings = ref(false);
const advancedSettingsNode = ref<NodeStatus | null>(null);

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    const updateWindowSize = () => {
        windowWidth.value = window.innerWidth;
        windowHeight.value = window.innerHeight;
    };
    window.addEventListener('resize', updateWindowSize);
    fetchNodes();
    testAllSockets();
    refreshTimer = setInterval(() => {
        fetchNodesSilent();
        testAllSockets();
    }, 3000);
});

onUnmounted(() => {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
});

const fetchNodes = async () => {
    try {
        const res = await fetchNodesApi();
        if (res?.value) {
            nodes.value = res.value || [];
        }
    } catch {
        nodes.value = [];
    } finally {
        testAllSockets();
    }
};

const fetchNodesSilent = async () => {
    try {
        const res = await fetchNodesSilentApi();
        if (res?.value) {
            nodes.value = res.value || [];
        }
    } catch {
        // ignore
    }
};

const filteredNodes = computed(() => {
    if (!searchQuery.value) return nodes.value;
    const q = searchQuery.value.toLowerCase();
    return nodes.value.filter(n =>
        n.remarks.toLowerCase().includes(q) ||
        n.ip.toLowerCase().includes(q)
    );
});

const openAddDialog = () => {
    dialogMode.value = "add";
    editingNode.value = null;
    form.ip = "";
    form.port = 24444;
    form.remarks = "";
    form.apiKey = "";
    form.prefix = "";
    formError.value = "";
    showDialog.value = true;
};

const openEditDialog = (node: NodeStatus) => {
    dialogMode.value = "edit";
    editingNode.value = node;
    form.ip = node.ip;
    form.port = node.port;
    form.remarks = node.remarks;
    form.prefix = node.prefix || "";
    form.apiKey = "";
    formError.value = "";
    showDialog.value = true;
};

const closeDialog = () => {
    showDialog.value = false;
    formError.value = "";
};

const saveNode = async () => {
    formError.value = "";

    if (!form.ip.trim()) {
        formError.value = t("TXT_CODE_DESKTOP_NODES_IP_REQUIRED") || "IP is required";
        return;
    }

    if (!form.port) {
        formError.value = t("TXT_CODE_DESKTOP_NODES_PORT_REQUIRED") || "Port is required";
        return;
    }

    if (dialogMode.value === "add" && !form.apiKey.trim()) {
        formError.value = t("TXT_CODE_DESKTOP_NODES_APIKEY_REQUIRED") || "API Key is required";
        return;
    }

    saving.value = true;
    try {
        if (dialogMode.value === "add") {
            await addNodeApiExec({
                data: {
                    ip: form.ip.trim(),
                    port: Number(form.port),
                    remarks: form.remarks.trim(),
                    apiKey: form.apiKey.trim()
                }
            });
        } else if (editingNode.value) {
            const editData: any = {
                ip: form.ip.trim(),
                port: Number(form.port),
                remarks: form.remarks.trim(),
                prefix: form.prefix.trim()
            };
            if (form.apiKey.trim()) {
                editData.apiKey = form.apiKey.trim();
            }
            await editNodeApiExec({
                params: {
                    uuid: editingNode.value.uuid
                },
                data: editData
            });
            try {
                await connectNodeApiExec({
                    params: {
                        uuid: editingNode.value.uuid
                    }
                });
            } catch {
                // ignore
            }
        }
        showDialog.value = false;
        fetchNodes();
    } catch (e: any) {
        formError.value = e?.message || "Error";
    } finally {
        saving.value = false;
    }
};

const confirmDelete = (node: NodeStatus) => {
    deletingNode.value = node;
    showDeleteConfirm.value = true;
};

const executeDelete = async () => {
    if (!deletingNode.value) return;
    saving.value = true;
    try {
        await deleteNodeApiExec({
            params: {
                uuid: deletingNode.value.uuid
            }
        });
        showDeleteConfirm.value = false;
        deletingNode.value = null;
        fetchNodes();
    } catch {
        // ignore
    } finally {
        saving.value = false;
    }
};

const cancelDelete = () => {
    showDeleteConfirm.value = false;
    deletingNode.value = null;
};

const reconnectNode = async (node: NodeStatus) => {
    try {
        await connectNodeApiExec({
            params: {
                uuid: node.uuid
            }
        });
        fetchNodes();
    } catch {
        // ignore
    }
};

const openAdvancedSettings = (node: NodeStatus) => {
    advancedSettingsNode.value = node;
    showAdvancedSettings.value = true;
};

const closeAdvancedSettings = () => {
    showAdvancedSettings.value = false;
    advancedSettingsNode.value = null;
};
</script>

<template>
    <div class="desktop-nodes">
        <div class="dn-toolbar">
            <div class="dn-search">
                <SearchOutlined class="dn-search__icon" />
                <input v-model="searchQuery" class="dn-search__input" :placeholder="t('TXT_CODE_DESKTOP_NODES_SEARCH')"
                    autocomplete="off" spellcheck="false" />
            </div>
            <button class="dn-btn dn-btn--primary" @click="openAddDialog">
                <PlusOutlined />
                {{ t("TXT_CODE_DESKTOP_NODES_ADD") }}
            </button>
        </div>

        <div class="dn-table-wrap">
            <table class="dn-table">
                <thead>
                    <tr>
                        <th class="dn-table__col--status">{{ t("TXT_CODE_DESKTOP_NODES_STATUS") }}</th>
                        <th class="dn-table__col--socket">{{ t("TXT_CODE_DESKTOP_NODES_SOCKET") }}</th>
                        <th class="dn-table__col--version">{{ t("TXT_CODE_81634069") }}</th>
                        <th class="dn-table__col--name">{{ t("TXT_CODE_DESKTOP_NODES_REMARKS") }}</th>
                        <th class="dn-table__col--ip">{{ t("TXT_CODE_DESKTOP_NODES_IP") }}</th>
                        <th class="dn-table__col--port">{{ t("TXT_CODE_DESKTOP_NODES_PORT") }}</th>
                        <th class="dn-table__col--prefix">{{ t("TXT_CODE_693f31d6") }}</th>
                        <th class="dn-table__col--actions">{{ t("TXT_CODE_OPERATE") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td colspan="8" class="dn-table__empty">
                            <div class="dn-loading">{{ t("TXT_CODE_b197be11") }}</div>
                        </td>
                    </tr>
                    <tr v-else-if="filteredNodes.length === 0">
                        <td colspan="8" class="dn-table__empty">
                            <div class="dn-empty">{{ t("TXT_CODE_DESKTOP_NODES_NO_RESULTS") }}</div>
                        </td>
                    </tr>
                    <tr v-for="node in filteredNodes" :key="node.uuid" class="dn-table__row">
                        <td class="dn-table__col--status">
                            <CheckCircleOutlined v-if="node.available" class="dn-badge-icon dn-badge-icon--yes" />
                            <CloseCircleOutlined v-else class="dn-badge-icon dn-badge-icon--no" />
                        </td>
                        <td class="dn-table__col--socket">
                            <CheckCircleOutlined v-if="socketStatusMap[node.uuid] === SocketStatus.Connected"
                                class="dn-badge-icon dn-badge-icon--yes" />
                            <a-tooltip v-else-if="socketStatusMap[node.uuid] === SocketStatus.Error"
                                :title="t('TXT_CODE_6b4a27dd')">
                                <span class="dn-badge-icon dn-badge-icon--no">
                                    <InfoCircleOutlined />
                                </span>
                            </a-tooltip>
                            <span v-else class="dn-badge-icon dn-badge-icon--dash">--</span>
                        </td>
                        <td class="dn-table__col--version">
                            <template v-if="node.available && nodeVersionMap[node.uuid]">
                                <a-tooltip v-if="node.brand !== 'ElementsPanel'" :title="t('TXT_CODE_NODE_BRAND_ERR')">
                                    <span class="dn-badge-icon dn-badge-icon--warn">
                                        <InfoCircleOutlined />
                                    </span>
                                </a-tooltip>
                                <CheckCircleOutlined
                                    v-else-if="!hasVersionUpdate(specifiedDaemonVersion, nodeVersionMap[node.uuid])"
                                    class="dn-badge-icon dn-badge-icon--yes" />
                                <a-tooltip v-else :title="t('TXT_CODE_e520908a')">
                                    <span class="dn-badge-icon dn-badge-icon--no">
                                        <InfoCircleOutlined />
                                    </span>
                                </a-tooltip>
                            </template>
                            <span v-else class="dn-badge-icon dn-badge-icon--dash">--</span>
                        </td>
                        <td class="dn-table__col--name">
                            <div class="dn-node-name">
                                <ClusterOutlined class="dn-node-name__icon" />
                                <span>{{ node.remarks || node.ip }}</span>
                            </div>
                        </td>
                        <td class="dn-table__col--ip">{{ node.ip }}</td>
                        <td class="dn-table__col--port">{{ node.port }}</td>
                        <td class="dn-table__col--prefix">{{ node.prefix || "-" }}</td>
                        <td class="dn-table__col--actions">
                            <div class="dn-action-btns">
                                <button class="dn-action-btn dn-action-btn--reconnect" :title="t('TXT_CODE_f8b28901')"
                                    @click="reconnectNode(node)">
                                    <ReloadOutlined />
                                </button>
                                <button class="dn-action-btn dn-action-btn--edit"
                                    :title="t('TXT_CODE_DESKTOP_NODES_EDIT')" @click="openEditDialog(node)">
                                    <EditOutlined />
                                </button>
                                <button class="dn-action-btn dn-action-btn--advanced"
                                    :title="t('TXT_CODE_DESKTOP_NODES_ADVANCED')" @click="openAdvancedSettings(node)">
                                    <SettingOutlined />
                                </button>
                                <button class="dn-action-btn dn-action-btn--delete"
                                    :title="t('TXT_CODE_DESKTOP_NODES_DELETE')" @click="confirmDelete(node)">
                                    <DeleteOutlined />
                                </button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <Teleport to="body">
            <Transition name="dn-dialog-fade">
                <DesktopWindow v-if="showDialog" id="node-edit-dialog"
                    :title="dialogMode === 'add' ? (t('TXT_CODE_DESKTOP_NODES_ADD')) : (t('TXT_CODE_DESKTOP_NODES_EDIT'))"
                    :icon="dialogMode === 'add' ? PlusOutlined : EditOutlined" :visible="showDialog" :minimized="false"
                    :maximized="false" :active="true" :initial-width="420" :initial-height="485"
                    :initial-x="windowWidth / 2 - 210" :initial-y="windowHeight / 2 - 230" :z-index="10001"
                    :show-minimize="false" :show-maximize="false" :resizable="false" @close="closeDialog">
                    <div class="dn-dialog-content">
                        <div class="dn-dialog__body">
                            <div class="dn-form-group">
                                <label class="dn-form-label">
                                    {{ t("TXT_CODE_DESKTOP_NODES_REMARKS") }}
                                </label>
                                <input v-model="form.remarks" class="dn-form-input"
                                    :placeholder="t('TXT_CODE_DESKTOP_NODES_REMARKS')" />
                            </div>
                            <div class="dn-form-group">
                                <label class="dn-form-label">
                                    {{ t("TXT_CODE_DESKTOP_NODES_IP") }}
                                </label>
                                <input v-model="form.ip" class="dn-form-input"
                                    :placeholder="t('TXT_CODE_DESKTOP_NODES_IP')" />
                            </div>
                            <div class="dn-form-group">
                                <label class="dn-form-label">
                                    {{ t("TXT_CODE_DESKTOP_NODES_PORT") }}
                                </label>
                                <input v-model="form.port" type="number" class="dn-form-input"
                                    :placeholder="t('TXT_CODE_DESKTOP_NODES_PORT')" />
                            </div>
                            <div class="dn-form-group">
                                <label class="dn-form-label">
                                    {{ t("TXT_CODE_DESKTOP_NODES_APIKEY") }}
                                </label>
                                <input v-model="form.apiKey" type="password" class="dn-form-input"
                                    autocomplete="new-password"
                                    :placeholder="dialogMode === 'edit' ? (t('TXT_CODE_DESKTOP_NODES_APIKEY_HELP')) : ''" />
                                <span v-if="dialogMode === 'edit'" class="dn-form-hint">
                                    {{ t("TXT_CODE_DESKTOP_NODES_APIKEY_HELP") }}
                                </span>
                            </div>
                            <div class="dn-form-group">
                                <label class="dn-form-label">
                                    {{ t("TXT_CODE_693f31d6") }}
                                </label>
                                <input v-model="form.prefix" class="dn-form-input"
                                    :placeholder="t('TXT_CODE_693f31d6')" />
                                <span class="dn-form-hint">
                                    {{ t("TXT_CODE_3e93e31e") }}
                                </span>
                            </div>
                            <div v-if="formError" class="dn-form-error">{{ formError }}</div>
                        </div>
                        <div class="dn-dialog__footer">
                            <button class="dn-btn dn-btn--default" @click="closeDialog">
                                {{ t("TXT_CODE_DESKTOP_NODES_CANCEL") }}
                            </button>
                            <button class="dn-btn dn-btn--primary" :disabled="saving" @click="saveNode">
                                {{ t("TXT_CODE_DESKTOP_NODES_SAVE") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dn-dialog-fade">
                <DesktopWindow v-if="showDeleteConfirm" id="node-delete-dialog"
                    :title="t('TXT_CODE_DESKTOP_NODES_DELETE')" :icon="ExclamationCircleOutlined"
                    :visible="showDeleteConfirm" :minimized="false" :maximized="false" :active="true"
                    :initial-width="400" :initial-height="200" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 100" :z-index="10002" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="cancelDelete">
                    <div class="dn-dialog-content">
                        <div class="dn-dialog__body dn-dialog__body--column">
                            <ExclamationCircleOutlined class="dn-dialog__warn-icon" />
                            <p class="dn-dialog__desc">
                                {{ t("TXT_CODE_DESKTOP_NODES_DELETE_CONFIRM", {
                                    name: deletingNode?.remarks ||
                                        deletingNode?.ip
                                }) }}
                            </p>
                        </div>
                        <div class="dn-dialog__footer">
                            <button class="dn-btn dn-btn--default" @click="cancelDelete">
                                {{ t("TXT_CODE_DESKTOP_NODES_CANCEL") }}
                            </button>
                            <button class="dn-btn dn-btn--primary"
                                style="background: var(--color-red-5); border-color: var(--color-red-5);"
                                :disabled="saving" @click="executeDelete">
                                {{ t("TXT_CODE_DESKTOP_NODES_DELETE") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dn-dialog-fade">
                <DesktopNodeAdvancedSettings v-if="showAdvancedSettings && advancedSettingsNode"
                    :visible="showAdvancedSettings" :node="advancedSettingsNode" @close="closeAdvancedSettings" />
            </Transition>
        </Teleport>
    </div>
</template>

<style lang="scss" scoped>
.desktop-nodes {
    height: 100%;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
}

.dn-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

.dn-search {
    flex: 1;
    position: relative;
    max-width: 320px;

    &__icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--desktop-window-text-muted);
        font-size: 14px;
        pointer-events: none;
    }

    &__input {
        width: 100%;
        padding: 7px 10px 7px 30px;
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);
        border-radius: 6px;
        color: var(--desktop-window-text);
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;

        &::placeholder {
            color: var(--desktop-window-text-muted);
        }

        &:focus {
            border-color: var(--desktop-window-border);
        }
    }
}

.dn-btn {
    padding: 7px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--desktop-window-text);
    white-space: nowrap;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &--primary {
        background: var(--color-blue-5, #1677ff);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--color-blue-6, #4096ff);
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }

    &--danger {
        background: var(--color-red-5, #ff4d4f);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--color-red-6, #ff7875);
        }
    }
}

.dn-table-wrap {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
}

.dn-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;

    th {
        text-align: left;
        padding: 10px 12px;
        color: var(--desktop-window-text-secondary);
        font-weight: 500;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        background: var(--desktop-window-titlebar-bg);
        border-bottom: 1px solid var(--desktop-window-border);
        white-space: nowrap;
    }

    td {
        padding: 10px 12px;
        color: var(--desktop-window-text);
        border-bottom: 1px solid var(--desktop-window-border);
    }

    &__row {
        transition: background 0.15s;

        &:hover {
            background: var(--desktop-window-control-hover);
        }
    }

    &__empty {
        text-align: center;
        padding: 40px 12px;
    }

    &__col--status {
        min-width: 40px;
    }

    &__col--socket {
        min-width: 40px;
    }

    &__col--version {
        min-width: 40px;
    }

    &__col--name {
        min-width: 140px;
    }

    &__col--ip {
        min-width: 120px;
    }

    &__col--port {
        min-width: 80px;
    }

    &__col--prefix {
        min-width: 100px;
    }

    &__col--actions {
        min-width: 80px;
        text-align: right;
    }
}

.dn-node-name {
    display: flex;
    align-items: center;
    gap: 6px;

    &__icon {
        color: var(--desktop-window-text-muted);
        font-size: 14px;
    }
}

.dn-badge-icon {
    font-size: 14px;

    &--yes {
        color: var(--color-green-5, #52c41a);
    }

    &--no {
        color: var(--color-red-5, #ff4d4f);
    }

    &--warn {
        color: var(--color-warning, #faad14);
    }

    &--loading {
        color: var(--desktop-window-text-muted);
    }

    &--dash {
        color: var(--desktop-window-text-muted);
    }
}

.dn-action-btns {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
}

.dn-action-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
    color: var(--desktop-window-text-secondary);
    background: transparent;

    &:hover {
        background: var(--desktop-window-control-hover);
        color: var(--desktop-window-text);
    }

    &--reconnect:hover {
        background: rgba(22, 119, 255, 0.15);
        color: #1677ff;
    }

    &--advanced:hover {
        background: rgba(250, 173, 20, 0.15);
        color: #faad14;
    }

    &--delete:hover {
        background: rgba(255, 77, 79, 0.15);
        color: #ff4d4f;
    }
}

.dn-loading,
.dn-empty {
    font-size: 13px;
    color: var(--desktop-window-text-muted);
}

.dn-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

.dn-dialog {
    background: var(--desktop-window-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 12px;
    width: 420px;
    max-width: 90vw;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;

    &--small {
        width: 360px;
    }

    &__header {
        padding: 16px 20px 0;

        h3 {
            font-size: 16px;
            font-weight: 600;
            color: var(--desktop-window-text);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
    }

    &__footer {
        padding: 12px 20px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        border-top: 1px solid var(--desktop-window-border);
    }
}

.dn-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.dn-dialog__footer {
    margin-top: auto;
}

.dn-form-group {
    margin-bottom: 14px;

    &:last-child {
        margin-bottom: 0;
    }
}

.dn-form-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--desktop-window-text-secondary);
    margin-bottom: 6px;
    font-weight: 500;
}

.dn-form-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;

    &::placeholder {
        color: var(--desktop-window-text-muted);
    }

    &:focus {
        border-color: var(--desktop-window-border);
    }

    &:disabled {
        opacity: 0.5;
    }
}

.dn-form-hint {
    display: block;
    font-size: 11px;
    color: var(--desktop-window-text-muted);
    margin-top: 4px;
}

.dn-form-error {
    padding: 8px 10px;
    background: rgba(255, 77, 79, 0.1);
    border: 1px solid rgba(255, 77, 79, 0.2);
    border-radius: 6px;
    color: #ff4d4f;
    font-size: 12px;
    margin-top: 8px;
}

.dn-dialog__body {
    padding: 16px 20px;
    flex: 1;
    overflow-y: auto;

    &--column {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
    }
}

.dn-dialog__warn-icon {
    font-size: 36px;
    color: var(--color-warning, #faad14);
}

.dn-dialog__desc {
    margin: 0;
    color: var(--desktop-window-text);
    font-size: 14px;
    text-align: center;
    line-height: 1.6;
}

.dn-delete-text {
    font-size: 13px;
    color: var(--desktop-window-text);
    line-height: 1.6;
    margin: 0;
}

.dn-dialog-fade-enter-active,
.dn-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.dn-dialog-fade-enter-from,
.dn-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.dn-table-wrap::-webkit-scrollbar {
    width: 4px;
}

.dn-table-wrap::-webkit-scrollbar-track {
    background: transparent;
}

.dn-table-wrap::-webkit-scrollbar-thumb {
    background: var(--desktop-window-border);
    border-radius: 2px;
}
</style>
