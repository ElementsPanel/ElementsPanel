<script setup lang="ts">
import { useFileManager } from "@/hooks/useFileManager";
import { t } from "@/lang/i18n";
import { onMounted, ref } from "vue";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
    fileName: string;
    filePath: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const { getFileLink } = useFileManager(props.instanceId, props.daemonId);

const imgLink = ref("");
const downloadBtnLoading = ref(false);

const onClose = () => {
    emit("close");
};

const onDownload = async () => {
    downloadBtnLoading.value = true;
    const link = await getFileLink(props.fileName, props.filePath.replace(props.fileName, ""));
    if (link) {
        window.open(link);
    }
    downloadBtnLoading.value = false;
};

onMounted(async () => {
    const link = await getFileLink(props.fileName, props.filePath.replace(props.fileName, ""));
    if (link) {
        imgLink.value = link;
    }
});
</script>

<template>
    <div class="desktop-image-viewer">
        <div class="image-view">
            <a-spin :spinning="!imgLink">
                <a-image v-if="imgLink" :src="imgLink" :alt="props.fileName" />
            </a-spin>
        </div>
        <div class="image-footer">
            <div class="image-name">{{ props.fileName }}</div>
            <a-button type="primary" size="small" :loading="downloadBtnLoading" @click="onDownload">
                {{ t("TXT_CODE_65b21404") }}
            </a-button>
        </div>
    </div>
</template>

<style scoped>
.desktop-image-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--desktop-window-bg);
    color: var(--desktop-window-text);
}

.image-view {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: auto;
    padding: 16px;
}

.image-view :deep(.ant-image) {
    max-width: 100%;
    max-height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.image-view :deep(.ant-image-img) {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.image-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid var(--desktop-window-border);
    background-color: var(--desktop-window-titlebar-bg);
}

.image-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 70%;
}
</style>
