<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import type { InstanceDetail } from "@/types";
import { ref, watch } from "vue";
import { notifyDesktop, notifyDesktopError } from "../../desktopNotice";
import { VBtn, VSwitch, VTextField } from "vuetify/components";

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
        notifyDesktop(t("TXT_CODE_d3de39b4"), "success");
    } catch (err: any) {
        notifyDesktopError(err);
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
            <div v-if="options" class="devent-form">
                <section class="devent-form__section">
                    <h3>{{ t("TXT_CODE_a64da7c4") }}</h3>
                    <p class="devent-form__hint">
                            {{ t("TXT_CODE_619faab6") }}
                            <br />
                            {{ t("TXT_CODE_3eb58633") }}
                    </p>
                    <VSwitch v-model="options.config.eventTask.autoRestart" color="primary" hide-details density="compact" />
                </section>

                <template v-if="options.config.eventTask.autoRestart">
                    <section class="devent-form__section">
                        <h3>{{ t("TXT_CODE_f4b52ed4") }}</h3>
                        <p class="devent-form__hint">
                            {{ t("TXT_CODE_9d2fca76") }}
                        </p>
                        <VTextField v-model="options.config.eventTask.autoRestartMaxTimes" type="number" width="220" variant="solo" density="compact" rounded="xl" hide-details />
                    </section>
                </template>

                <section class="devent-form__section">
                    <h3>{{ t("TXT_CODE_273d24e0") }}</h3>
                    <p class="devent-form__hint">
                            {{ t("TXT_CODE_8d9f5a4e") }}
                            <br />
                            {{ t("TXT_CODE_64bf4386") }}
                    </p>
                    <VSwitch v-model="options.config.eventTask.autoStart" color="primary" hide-details density="compact" />
                </section>
            </div>
            <div v-else class="devent-config__loading">
                {{ t("TXT_CODE_b197be11") }}
            </div>
        </div>
        <div class="devent-config__footer">
            <VBtn class="devent-btn devent-btn--primary" variant="text" rounded="xl" :disabled="isLoading" @click="submit">
                {{ t("TXT_CODE_abfe9512") }}
            </VBtn>
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
