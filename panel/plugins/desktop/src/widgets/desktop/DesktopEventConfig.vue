<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import { ref, watch } from "vue";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const { instanceInfo, execute: fetchInstanceInfo } = useInstanceInfo({
    instanceId: props.instanceId,
    daemonId: props.daemonId,
    autoRefresh: true
});

const options = ref<InstanceDetail>();
const isLoading = ref(false);

const { execute: updateConfig } = updateInstanceConfig();

const submit = async () => {
    if (!options.value) return;
    try {
        isLoading.value = true;
        await updateConfig({
            params: {
                uuid: props.instanceId ?? "",
                daemonId: props.daemonId ?? ""
            },
            data: {
                eventTask: options.value.config.eventTask
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
    if (val && !options.value) {
        options.value = val;
    }
}, { immediate: true });
</script>

<template>
    <div class="devent-config">
        <div class="devent-config__body">
            <a-form v-if="options" layout="vertical">
                <a-form-item>
                    <a-typography-title :level="5">{{ t("TXT_CODE_a64da7c4") }}</a-typography-title>
                    <a-typography-paragraph>
                        <a-typography-text type="secondary">
                            {{ t("TXT_CODE_619faab6") }}
                            <br />
                            {{ t("TXT_CODE_3eb58633") }}
                        </a-typography-text>
                    </a-typography-paragraph>
                    <a-switch v-model:checked="options.config.eventTask.autoRestart" />
                </a-form-item>

                <template v-if="options.config.eventTask.autoRestart">
                    <a-form-item>
                        <a-typography-title :level="5">{{ t("TXT_CODE_f4b52ed4") }}</a-typography-title>
                        <a-typography-paragraph>
                            <a-typography-text type="secondary">
                                {{ t("TXT_CODE_9d2fca76") }}
                            </a-typography-text>
                        </a-typography-paragraph>
                        <a-input v-model:value="options.config.eventTask.autoRestartMaxTimes" :style="'width: 220px'" />
                    </a-form-item>
                </template>

                <a-form-item>
                    <a-typography-title :level="5">{{ t("TXT_CODE_273d24e0") }}</a-typography-title>
                    <a-typography-paragraph>
                        <a-typography-text type="secondary">
                            {{ t("TXT_CODE_8d9f5a4e") }}
                            <br />
                            {{ t("TXT_CODE_64bf4386") }}
                        </a-typography-text>
                    </a-typography-paragraph>
                    <a-switch v-model:checked="options.config.eventTask.autoStart" />
                </a-form-item>
            </a-form>
            <div v-else class="devent-config__loading">
                {{ t("TXT_CODE_b197be11") }}
            </div>
        </div>
        <div class="devent-config__footer">
            <button class="devent-btn devent-btn--primary" :disabled="isLoading" @click="submit">
                {{ t("TXT_CODE_abfe9512") }}
            </button>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.devent-config {
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

    &__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--desktop-window-text-muted);
    }

    &__footer {
        display: flex;
        justify-content: flex-end;
        padding: 12px 16px;
        border-top: 1px solid var(--desktop-window-border);
        flex-shrink: 0;
    }
}

.devent-btn {
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
