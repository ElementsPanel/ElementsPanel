<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { reactive, ref, watch } from "vue";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const { instanceInfo } = useInstanceInfo({
    instanceId: props.instanceId,
    daemonId: props.daemonId,
    autoRefresh: true
});

const isLoading = ref(false);
const formData = reactive({
    ip: "",
    port: "",
    type: 1
});

const { execute: updateConfig } = updateInstanceConfig();

const submit = async () => {
    try {
        isLoading.value = true;
        await updateConfig({
            params: {
                uuid: props.instanceId ?? "",
                daemonId: props.daemonId ?? ""
            },
            data: {
                pingConfig: {
                    ip: formData.ip,
                    port: Number(formData.port),
                    type: formData.type
                }
            }
        });
        message.success(t("TXT_CODE_d3de39b4"));
    } catch (err: any) {
        reportErrorMsg(err.message);
    } finally {
        isLoading.value = false;
    }
};

watch(instanceInfo, (val) => {
    if (val) {
        formData.ip = val.config?.pingConfig?.ip || "";
        formData.port = String(val.config?.pingConfig?.port || "");
        formData.type = val.config?.pingConfig?.type ?? 1;
    }
}, { immediate: true });
</script>

<template>
    <div class="dmcping-config">
        <div class="dmcping-config__body">
            <a-form layout="vertical">
                <a-typography-paragraph>
                    <a-typography-text type="secondary">
                        {{ t("TXT_CODE_57d1929e") }}
                        <br />
                        {{ t("TXT_CODE_6b175558") }}
                    </a-typography-text>
                </a-typography-paragraph>
                <a-form-item>
                    <a-typography-title :level="5">{{ t("TXT_CODE_f49149d0") }}</a-typography-title>
                    <a-typography-paragraph>
                        <a-typography-text type="secondary">
                            {{ t("TXT_CODE_2ab036a4") }}
                        </a-typography-text>
                    </a-typography-paragraph>
                    <a-input v-model:value="formData.port" :placeholder="t('TXT_CODE_e2dc0156')" />
                </a-form-item>
                <a-form-item>
                    <a-typography-title :level="5">{{ t("TXT_CODE_2f59807a") }}</a-typography-title>
                    <a-typography-paragraph>
                        <a-typography-text type="secondary">
                            {{ t("TXT_CODE_8e2be926") }}
                        </a-typography-text>
                    </a-typography-paragraph>
                    <a-input v-model:value="formData.ip" :placeholder="t('TXT_CODE_ddc2de99')" />
                </a-form-item>
            </a-form>
        </div>
        <div class="dmcping-config__footer">
            <button class="dmcping-btn dmcping-btn--primary" :disabled="isLoading" @click="submit">
                {{ t("TXT_CODE_abfe9512") }}
            </button>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.dmcping-config {
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

    &__footer {
        display: flex;
        justify-content: flex-end;
        padding: 12px 16px;
        border-top: 1px solid var(--desktop-window-border);
        flex-shrink: 0;
    }
}

.dmcping-btn {
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
    }
}
</style>
