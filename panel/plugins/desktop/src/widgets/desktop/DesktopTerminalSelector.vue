<script setup lang="ts">
import { t } from "@/lang/i18n";
import { remoteNodeList } from "@/services/apis";
import { computeNodeName } from "@/tools/nodes";
import type { NodeStatus } from "@/types";
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ClusterOutlined,
    SearchOutlined
} from "@ant-design/icons-vue";
import { computed, onMounted, ref } from "vue";

const emit = defineProps<{
    onOpenConsole: (instance: any, daemonId: string) => void;
}>();

const searchQuery = ref("");

const { execute: getNodes, state: nodes, isLoading } = remoteNodeList();

const initNodes = async () => {
    await getNodes();
    nodes?.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
};

onMounted(async () => {
    await initNodes();
});

const filteredNodes = computed(() => {
    if (!nodes.value) return [];
    if (!searchQuery.value) return nodes.value;
    const q = searchQuery.value.toLowerCase();
    return nodes.value.filter(n =>
        n.remarks.toLowerCase().includes(q) ||
        n.ip.toLowerCase().includes(q)
    );
});

const openConsole = (node: NodeStatus) => {
    if (!node.available) return;

    const mockInstance = {
        instanceUuid: "global0001",
        config: {
            nickname: `${computeNodeName(node.ip, node.available, node.remarks)} - Terminal`
        }
    };

    emit.onOpenConsole(mockInstance, node.uuid);
};
</script>

<template>
    <div class="desktop-terminal-selector">
        <div class="dts-toolbar">
            <div class="dts-search">
                <div class="dts-search-input-wrap">
                    <SearchOutlined class="dts-search-icon" />
                    <input v-model="searchQuery" class="dts-search-input"
                        :placeholder="t('TXT_CODE_DESKTOP_NODES_SEARCH') || 'Search nodes...'" />
                </div>
            </div>
        </div>

        <div class="dts-list-wrap">
            <div v-if="isLoading" class="dts-loading">
                {{ t("TXT_CODE_b197be11") }}
            </div>
            <div v-else-if="!filteredNodes.length" class="dts-empty">
                {{ t("TXT_CODE_DESKTOP_NODES_NO_RESULTS") || 'No nodes found' }}
            </div>
            <div v-else class="dts-grid">
                <div v-for="node in filteredNodes" :key="node.uuid" class="dts-card"
                    :class="{ 'dts-card--disabled': !node.available }" @click="openConsole(node)">
                    <div class="dts-card__icon">
                        <ClusterOutlined />
                    </div>
                    <div class="dts-card__info">
                        <div class="dts-card__name">{{ computeNodeName(node.ip, node.available, node.remarks) }}</div>
                        <div class="dts-card__status">
                            <CheckCircleOutlined v-if="node.available" class="status-icon status-icon--yes" />
                            <CloseCircleOutlined v-else class="status-icon status-icon--no" />
                            {{ node.available ? (t("TXT_CODE_DESKTOP_NODES_ONLINE") || 'Online') :
                                (t("TXT_CODE_DESKTOP_NODES_OFFLINE") || 'Offline') }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.desktop-terminal-selector {
    height: 100%;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
}

.dts-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
    flex-shrink: 0;
}

.dts-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 320px;
}

.dts-search-input-wrap {
    flex: 1;
    position: relative;
}

.dts-search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--desktop-window-text-muted);
    font-size: 14px;
    pointer-events: none;
}

.dts-search-input {
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

.dts-list-wrap {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    padding: 16px;
    background: var(--desktop-window-bg);
}

.dts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
}

.dts-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(.dts-card--disabled) {
        background: var(--desktop-window-control-hover);
        border-color: var(--desktop-window-border);
    }

    &--disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &__icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--desktop-window-control-hover);
        border-radius: 8px;
        font-size: 20px;
        color: var(--desktop-window-text);
    }

    &__info {
        flex: 1;
        min-width: 0;
    }

    &__name {
        font-size: 14px;
        font-weight: 500;
        color: var(--desktop-window-text);
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    &__status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--desktop-window-text-muted);
    }
}

.status-icon {
    font-size: 12px;

    &--yes {
        color: var(--color-green-5, #52c41a);
    }

    &--no {
        color: var(--color-red-5, #ff4d4f);
    }
}

.dts-loading,
.dts-empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--desktop-window-text-muted);
}

.dts-list-wrap::-webkit-scrollbar {
    width: 6px;
}

.dts-list-wrap::-webkit-scrollbar-track {
    background: transparent;
}

.dts-list-wrap::-webkit-scrollbar-thumb {
    background: var(--desktop-window-border);
    border-radius: 3px;
}
</style>
