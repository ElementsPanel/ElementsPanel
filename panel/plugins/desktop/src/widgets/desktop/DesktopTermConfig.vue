<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { TERMINAL_CODE } from "@/types/const";
import { message } from "ant-design-vue";
import { computed, ref, watch } from "vue";

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

const screen = useScreen();
const isPhone = computed(() => screen.isPhone.value);

const options = ref<any>();
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
                terminalOption: options.value.config.terminalOption,
                crlf: options.value.config.crlf,
                ie: options.value.config.ie,
                oe: options.value.config.oe,
                stopCommand: options.value.config.stopCommand
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
    <div class="dterm-config">
        <div class="dterm-config__body">
            <a-form v-if="options" layout="vertical">
                <a-row :gutter="[24, 24]">
                    <a-col :xs="24" :md="12" :offset="0">
                        <a-form-item>
                            <a-typography-title :level="5">{{ t("TXT_CODE_ef650d57") }}</a-typography-title>
                            <a-typography-paragraph>
                                <a-typography-text type="secondary">
                                    {{ t("TXT_CODE_feeea328") }}
                                    <br />
                                    {{ t("TXT_CODE_d6e7f572") }}
                                </a-typography-text>
                            </a-typography-paragraph>
                            <a-switch v-model:checked="options.config.terminalOption.pty" />
                        </a-form-item>

                        <a-form-item>
                            <a-typography-title :level="5">{{ t("TXT_CODE_e1a3b150") }}</a-typography-title>
                            <a-typography-paragraph>
                                <a-typography-text type="secondary">
                                    {{ t("TXT_CODE_6a515e35") }}
                                    <br />
                                    {{ t("TXT_CODE_1295831e") }}
                                </a-typography-text>
                            </a-typography-paragraph>
                            <a-switch v-model:checked="options.config.terminalOption.haveColor" />
                        </a-form-item>

                        <a-form-item>
                            <a-typography-title :level="5">{{ t("TXT_CODE_b91a94f9") }}</a-typography-title>
                            <a-typography-paragraph>
                                <a-typography-text type="secondary">
                                    {{ t("TXT_CODE_5b2daea0") }}
                                    <br />
                                    {{ t("TXT_CODE_b94f13ce") }}
                                </a-typography-text>
                            </a-typography-paragraph>
                            <a-select v-model:value="options.config.crlf" :placeholder="t('TXT_CODE_3bb646e4')"
                                :style="'width: ' + (isPhone ? '100%' : '220px')">
                                <a-select-option :value="1">{{ t("TXT_CODE_365aabd4") }}</a-select-option>
                                <a-select-option :value="2">{{ t("TXT_CODE_20cec54") }}</a-select-option>
                            </a-select>
                        </a-form-item>
                    </a-col>
                    <a-col :xs="24" :md="12" :offset="0">
                        <a-form-item>
                            <a-typography-title :level="5">{{ t("TXT_CODE_11cfe3a1") }}</a-typography-title>
                            <a-typography-paragraph>
                                <a-typography-text type="secondary">
                                    {{ t("TXT_CODE_7ec7ccb8") }}
                                </a-typography-text>
                            </a-typography-paragraph>
                            <a-input v-model:value="options.config.stopCommand"
                                :style="'width: ' + (isPhone ? '100%' : '220px')" />
                        </a-form-item>

                        <a-form-item>
                            <a-typography-title :level="5">{{ t("TXT_CODE_449d1581") }}</a-typography-title>
                            <a-typography-paragraph>
                                <a-typography-text type="secondary">
                                    {{ t("TXT_CODE_d16d82ab") }}
                                </a-typography-text>
                            </a-typography-paragraph>
                            <a-select v-model:value="options.config.ie" class="mr-10 mb-20"
                                :placeholder="t('TXT_CODE_bd2559f3')" :style="'width: ' + (isPhone ? '100%' : '220px')">
                                <a-select-option v-for="item in TERMINAL_CODE" :key="item" :value="item">
                                </a-select-option>
                            </a-select>
                            <a-select v-model:value="options.config.oe" :placeholder="t('TXT_CODE_6e96b2a9')"
                                :style="'width: ' + (isPhone ? '100%' : '220px')">
                                <a-select-option v-for="item in TERMINAL_CODE" :key="item" :value="item">
                                </a-select-option>
                            </a-select>
                        </a-form-item>
                    </a-col>
                </a-row>
            </a-form>
            <div v-else class="dterm-config__loading">
                {{ t("TXT_CODE_b197be11") }}
            </div>
        </div>
        <div class="dterm-config__footer">
            <button class="dterm-btn dterm-btn--primary" :disabled="isLoading" @click="submit">
                {{ t("TXT_CODE_abfe9512") }}
            </button>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.dterm-config {
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

.dterm-btn {
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
