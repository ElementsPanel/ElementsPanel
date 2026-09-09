<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { TERMINAL_CODE } from "@/types/const";
import { notifyDesktop, notifyDesktopError } from "../../../desktop/src/desktopNotice";
import { computed, ref, watch } from "vue";
import { VBtn, VCol, VIcon, VProgressCircular, VRow, VSelect, VSwitch, VTextField } from "vuetify/components";

const props = defineProps<{
  instanceUuid?: string;
  instanceId?: string;
  daemonId: string;
}>();

const resolvedInstanceId = computed(() => props.instanceUuid ?? props.instanceId ?? "");
const { instanceInfo } = useInstanceInfo({
  instanceId: resolvedInstanceId.value,
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
        uuid: resolvedInstanceId.value,
        daemonId: props.daemonId
      },
      data: {
        terminalOption: options.value.config.terminalOption,
        crlf: options.value.config.crlf,
        ie: options.value.config.ie,
        oe: options.value.config.oe,
        stopCommand: options.value.config.stopCommand
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
  if (val) options.value = val;
}, { immediate: true });
</script>

<template>
  <div class="dterm-config">
    <div class="dterm-config__body">
      <VRow v-if="options" :dense="isPhone">
        <VCol cols="12" md="6">
          <div class="dterm-field dterm-field--switch">
            <div><div class="dterm-field__title">{{ t("TXT_CODE_ef650d57") }}</div><div class="dterm-field__hint">{{ t("TXT_CODE_feeea328") }}<br />{{ t("TXT_CODE_d6e7f572") }}</div></div>
            <VSwitch v-model="options.config.terminalOption.pty" color="primary" hide-details />
          </div>
          <div class="dterm-field dterm-field--switch">
            <div><div class="dterm-field__title">{{ t("TXT_CODE_e1a3b150") }}</div><div class="dterm-field__hint">{{ t("TXT_CODE_6a515e35") }}<br />{{ t("TXT_CODE_1295831e") }}</div></div>
            <VSwitch v-model="options.config.terminalOption.haveColor" color="primary" hide-details />
          </div>
          <div class="dterm-field">
            <div class="dterm-field__title">{{ t("TXT_CODE_b91a94f9") }}</div>
            <div class="dterm-field__hint">{{ t("TXT_CODE_5b2daea0") }}<br />{{ t("TXT_CODE_b94f13ce") }}</div>
            <VSelect v-model="options.config.crlf" :items="[{ title: t('TXT_CODE_365aabd4'), value: 1 }, { title: t('TXT_CODE_20cec54'), value: 2 }]" :placeholder="t('TXT_CODE_3bb646e4')" variant="solo" density="compact" hide-details />
          </div>
        </VCol>
        <VCol cols="12" md="6">
          <div class="dterm-field">
            <div class="dterm-field__title">{{ t("TXT_CODE_11cfe3a1") }}</div>
            <div class="dterm-field__hint">{{ t("TXT_CODE_7ec7ccb8") }}</div>
            <VTextField v-model="options.config.stopCommand" variant="solo" density="compact" hide-details />
          </div>
          <div class="dterm-field">
            <div class="dterm-field__title">{{ t("TXT_CODE_449d1581") }}</div>
            <div class="dterm-field__hint">{{ t("TXT_CODE_d16d82ab") }}</div>
            <VSelect v-model="options.config.ie" :items="TERMINAL_CODE" :placeholder="t('TXT_CODE_bd2559f3')" variant="solo" density="compact" hide-details class="mb-3" />
            <VSelect v-model="options.config.oe" :items="TERMINAL_CODE" :placeholder="t('TXT_CODE_6e96b2a9')" variant="solo" density="compact" hide-details />
          </div>
        </VCol>
      </VRow>
      <div v-else class="dterm-config__loading"><VProgressCircular indeterminate size="22" width="2" />{{ t("TXT_CODE_b197be11") }}</div>
    </div>
    <div class="dterm-config__footer">
      <VBtn class="dterm-btn dterm-btn--primary" variant="text" :loading="isLoading" @click="submit">
        <VIcon icon="mdi-content-save-outline" />
        {{ t("TXT_CODE_abfe9512") }}
      </VBtn>
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
    flex-shrink: 0;
  }
}

.dterm-btn {
  background: var(--desktop-window-titlebar-bg);
  color: var(--desktop-window-text);

  &:hover:not(:disabled) { background: var(--desktop-window-control-hover); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.1);
    &:hover:not(:disabled) { background: rgba(22, 119, 255, 0.2); }
  }
}

.dterm-field { margin-bottom: 20px; }
.dterm-field--switch { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.dterm-field__title { margin-bottom: 4px; font-size: 14px; font-weight: 600; }
.dterm-field__hint { margin-bottom: 8px; color: var(--desktop-window-text-secondary); line-height: 1.5; }
</style>
