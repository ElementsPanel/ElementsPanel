<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { useCommandHistory } from "../../hooks/useCommandHistory";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types";
import { CodeOutlined, DeleteOutlined } from "@ant-design/icons-vue";
import { onMounted, ref } from "vue";

const props = defineProps<{
    card: LayoutCard;
}>();

const { clickHistoryItem } = useCommandHistory();

const TERMINAL_HISTORY_KEY = "TERMINAL_HISTORY_KEY";
const historyList = ref<string[]>([]);

const loadHistory = () => {
    historyList.value = JSON.parse(localStorage.getItem(TERMINAL_HISTORY_KEY) || "[]") as string[];
};

const handleItemClick = (item: string) => {
    clickHistoryItem(item);
};

const clearHistory = () => {
    localStorage.removeItem(TERMINAL_HISTORY_KEY);
    historyList.value = [];
};

onMounted(() => {
    loadHistory();
    // Listen to storage events to update history if it changes in another tab or component
    window.addEventListener("storage", (e) => {
        if (e.key === TERMINAL_HISTORY_KEY) {
            loadHistory();
        }
    });

    // Also poll for changes since localStorage changes in the same tab don't trigger 'storage' event
    setInterval(() => {
        loadHistory();
    }, 2000);
});
</script>

<template>
    <CardPanel class="containerWrapper" style="height: 100%">
        <template #title>
            {{ card.title }}
        </template>
        <template #operator>
            <a-tooltip :title="t('TXT_CODE_7333c7f7')">
                <a-button type="text" size="small" @click="clearHistory">
                    <DeleteOutlined />
                </a-button>
            </a-tooltip>
        </template>
        <template #body>
            <div class="history-container">
                <div v-if="historyList.length === 0" class="empty-history">
                    {{ t("TXT_CODE_NO_DATA") }}
                </div>
                <div v-else class="history-list">
                    <div v-for="(item, index) in historyList" :key="index" class="history-item"
                        @click="handleItemClick(item)">
                        <CodeOutlined class="history-icon" />
                        <span class="history-text" :title="item">{{ item }}</span>
                    </div>
                </div>
            </div>
        </template>
    </CardPanel>
</template>

<style scoped lang="scss">
.history-container {
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px 0;
}

.empty-history {
    text-align: center;
    color: var(--color-gray-6);
    padding: 20px 0;
}

.history-list {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    align-items: center;
}

.history-item {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s;
    background-color: var(--color-gray-2);
    border: 1px solid var(--color-gray-3);
    max-width: 100%;
    flex-shrink: 0;

    &:hover {
        background-color: var(--color-gray-4);
        border-color: var(--color-gray-5);
    }
}

.history-icon {
    margin-right: 6px;
    font-size: 12px;
    color: var(--color-gray-7);
}

.history-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 12px;
    color: var(--color-gray-9);
}
</style>
