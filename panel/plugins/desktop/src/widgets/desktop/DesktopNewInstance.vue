<script setup lang="ts">
import { openNodeSelectDialog } from "@/components/fc/index";
import { QUICKSTART_METHOD } from "@/hooks/widgets/quickStartFlow";
import { t } from "@/lang/i18n";
import CreateInstanceForm from "@/widgets/setupApp/CreateInstanceForm.vue";
import { FileZipOutlined, FolderOpenOutlined } from "@ant-design/icons-vue";
import { ref } from "vue";

const emit = defineEmits<{
    (e: "close"): void;
}>();

const formData = ref({
    createMethod: QUICKSTART_METHOD.IMPORT,
    daemonId: ""
});

const showCreateForm = ref(false);

const handleNext = (instanceUuid: string) => {
    showCreateForm.value = false;
    emit("close");
};

const handleInstallAction = async (createMethod: QUICKSTART_METHOD) => {
    formData.value.createMethod = createMethod;

    try {
        const selectedNode = await openNodeSelectDialog();
        if (!selectedNode) return;
        formData.value.daemonId = selectedNode.uuid;
        showCreateForm.value = true;
    } catch (error) {
        console.error(error);
    }
};
</script>

<template>
    <div class="dni-container">
        <div class="dni-header">
            <h3>{{ t("TXT_CODE_DESKTOP_IM_NEW_INSTANCE") }}</h3>
            <p>{{ t("TXT_CODE_DESKTOP_NEW_INSTANCE_DESC") }}</p>
        </div>

        <div class="dni-options">
            <div class="dni-option" @click="handleInstallAction(QUICKSTART_METHOD.IMPORT)">
                <div class="dni-option__icon dni-option__icon--import">
                    <FileZipOutlined />
                </div>
                <div class="dni-option__content">
                    <h4>{{ t("TXT_CODE_a3efb1cc") }}</h4>
                    <p>{{ t("TXT_CODE_f09da050") }}</p>
                </div>
            </div>

            <div class="dni-option" @click="handleInstallAction(QUICKSTART_METHOD.EXIST)">
                <div class="dni-option__icon dni-option__icon--exist">
                    <FolderOpenOutlined />
                </div>
                <div class="dni-option__content">
                    <h4>{{ t("TXT_CODE_e0fca76") }}</h4>
                    <p>{{ t("TXT_CODE_b3844cf8") }}</p>
                </div>
            </div>
        </div>

        <a-modal v-model:open="showCreateForm" :title="t('TXT_CODE_645bc545')" :width="1000" :footer="null"
            :destroy-on-close="true">
            <CreateInstanceForm :create-method="formData.createMethod" :daemon-id="formData.daemonId"
                @next-step="handleNext" />
        </a-modal>
    </div>
</template>

<style lang="scss" scoped>
.dni-container {
    padding: 24px;
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
}

.dni-header {
    margin-bottom: 24px;

    h3 {
        font-size: 20px;
        font-weight: 600;
        color: var(--desktop-window-text);
        margin: 0 0 8px 0;
    }

    p {
        font-size: 13px;
        color: var(--desktop-window-text-secondary);
        margin: 0;
    }
}

.dni-options {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.dni-option {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: var(--desktop-window-control-hover);
        border-color: var(--desktop-window-border);
    }

    &__icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;

        &--import {
            background: rgba(22, 119, 255, 0.15);
            color: #1677ff;
        }

        &--exist {
            background: rgba(82, 196, 26, 0.15);
            color: #52c41a;
        }
    }

    &__content {
        flex: 1;

        h4 {
            font-size: 16px;
            font-weight: 500;
            color: var(--desktop-window-text);
            margin: 0 0 4px 0;
        }

        p {
            font-size: 13px;
            color: var(--desktop-window-text-secondary);
            margin: 0;
            line-height: 1.4;
        }
    }
}
</style>
