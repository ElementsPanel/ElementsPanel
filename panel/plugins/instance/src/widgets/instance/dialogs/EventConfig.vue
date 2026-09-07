<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { updateInstanceConfig } from "@/services/apis/instance";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import AppDialog from "@/components/AppDialog.vue";
import {
  VForm,
  VSwitch,
  VTextField
} from "vuetify/lib/components/index.mjs";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
  modelValue?: boolean;
}>();
const emit = defineEmits(["update", "update:modelValue"]);
const options = ref<InstanceDetail>();
const dialogOpen = computed({
  get: () => props.modelValue ?? false,
  set: (value: boolean) => emit("update:modelValue", value)
});
const openDialog = () => {
  dialogOpen.value = true;
  options.value = props.instanceInfo;
};

watch(
  () => props.modelValue,
  (value) => {
    if (value) options.value = props.instanceInfo;
  },
  { immediate: true }
);

const { execute, isLoading } = updateInstanceConfig();

const submit = async () => {
  try {
    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: {
        eventTask: options.value?.config.eventTask
      }
    });
    emit("update");
    dialogOpen.value = false;
    return message.success(t("TXT_CODE_d3de39b4"));
  } catch (err: any) {
    return reportErrorMsg(err.message);
  }
};

defineExpose({
  openDialog
});
</script>

<template>
  <AppDialog
    v-model:open="dialogOpen"
    class="event-config-dialog"
    :title="t('TXT_CODE_10150756')"
    :confirm-loading="isLoading"
    :ok-text="t('TXT_CODE_abfe9512')"
    compact
    @ok="submit"
  >
    <VForm v-if="options" class="event-config-form" @submit.prevent="submit">
      <div class="event-config-section">
        <div class="event-config-title">{{ t("TXT_CODE_a64da7c4") }}</div>
        <div class="event-config-description">
          {{ t("TXT_CODE_619faab6") }}
          <br />
          {{ t("TXT_CODE_3eb58633") }}
        </div>
        <VSwitch
          v-model="options.config.eventTask.autoRestart"
          color="primary"
          hide-details
        />
      </div>

      <div v-if="options.config.eventTask.autoRestart" class="event-config-section">
        <div class="event-config-title">{{ t("TXT_CODE_f4b52ed4") }}</div>
        <div class="event-config-description">{{ t("TXT_CODE_9d2fca76") }}</div>
        <VTextField
          v-model.number="options.config.eventTask.autoRestartMaxTimes"
          type="number"
          class="event-config-number"
          hide-details
          variant="solo-filled"
        />
      </div>

      <div class="event-config-section">
        <div class="event-config-title">{{ t("TXT_CODE_273d24e0") }}</div>
        <div class="event-config-description">
          {{ t("TXT_CODE_8d9f5a4e") }}
          <br />
          {{ t("TXT_CODE_64bf4386") }}
        </div>
        <VSwitch v-model="options.config.eventTask.autoStart" color="primary" hide-details />
      </div>
    </VForm>
  </AppDialog>
</template>

<style lang="scss" scoped>
.event-config-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.event-config-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.event-config-title {
  color: var(--text-color);
  font-size: 16px;
  font-weight: 600;
}

.event-config-description {
  color: var(--color-gray-7);
  font-size: 13px;
  line-height: 1.6;
}

.event-config-number {
  width: 220px;
}
</style>
