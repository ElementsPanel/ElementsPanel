<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { notifyDesktop, notifyDesktopError } from "../../../desktop/src/desktopNotice";
import { reactive, ref, watch } from "vue";
import { VBtn, VIcon, VTextField } from "vuetify/components";

const props = defineProps<{
  instanceUuid: string;
  daemonId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { instanceInfo } = useInstanceInfo({
  instanceId: props.instanceUuid,
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
        uuid: props.instanceUuid,
        daemonId: props.daemonId
      },
      data: {
        pingConfig: {
          ip: formData.ip,
          port: Number(formData.port),
          type: formData.type
        }
      }
    });
    notifyDesktop(t("TXT_CODE_d3de39b4"), "success");
  } catch (err: any) {
    notifyDesktopError(err);
  } finally {
    isLoading.value = false;
  }
};

watch(
  instanceInfo,
  (value) => {
    if (!value) return;
    formData.ip = value.config?.pingConfig?.ip || "";
    formData.port = String(value.config?.pingConfig?.port || "");
    formData.type = value.config?.pingConfig?.type ?? 1;
  },
  { immediate: true }
);
</script>

<template>
  <div class="dmcping-config">
    <div class="dmcping-config__body">
      <p class="dmcping-config__hint">
        {{ t("TXT_CODE_57d1929e") }}<br />
        {{ t("TXT_CODE_6b175558") }}
      </p>
      <div class="dmcping-field">
        <div class="dmcping-field__title">{{ t("TXT_CODE_f49149d0") }}</div>
        <div class="dmcping-field__hint">{{ t("TXT_CODE_2ab036a4") }}</div>
        <VTextField v-model="formData.port" :placeholder="t('TXT_CODE_e2dc0156')" variant="solo" density="compact" hide-details />
      </div>
      <div class="dmcping-field">
        <div class="dmcping-field__title">{{ t("TXT_CODE_2f59807a") }}</div>
        <div class="dmcping-field__hint">{{ t("TXT_CODE_8e2be926") }}</div>
        <VTextField v-model="formData.ip" :placeholder="t('TXT_CODE_ddc2de99')" variant="solo" density="compact" hide-details />
      </div>
    </div>
    <div class="dmcping-config__footer">
      <VBtn class="dmcping-btn dmcping-btn--primary" variant="text" :loading="isLoading" @click="submit">
        <VIcon icon="mdi-content-save-outline" />
        {{ t("TXT_CODE_abfe9512") }}
      </VBtn>
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
    flex-shrink: 0;
  }
}

.dmcping-config__hint,
.dmcping-field__hint { color: var(--desktop-window-text-secondary); line-height: 1.5; }
.dmcping-config__hint { margin: 0 0 20px; }
.dmcping-field { margin-bottom: 20px; }
.dmcping-field__title { margin-bottom: 4px; font-size: 14px; font-weight: 600; }
.dmcping-field__hint { margin-bottom: 8px; }

.dmcping-btn {
  background: var(--desktop-window-titlebar-bg);
  color: var(--desktop-window-text);

  &:hover:not(:disabled) {
    background: var(--desktop-window-control-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--primary {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.1);

    &:hover:not(:disabled) {
      background: rgba(22, 119, 255, 0.2);
    }
  }
}
</style>
