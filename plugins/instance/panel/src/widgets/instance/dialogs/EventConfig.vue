<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { InstanceDetail } from "@elementspanel/epanel-plugin-console/types";
import { updateInstanceConfig } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import {
  VForm,
  VSwitch,
  VTextField
} from "vuetify/components";

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
    return message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
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
    :title="t('TXT_CODE_COMMON_AUTOMATIC_STARTUP_AND_RESTART')"
    :confirm-loading="isLoading"
    :ok-text="t('TXT_CODE_COMMON_SAVE')"
    compact
    @ok="submit"
  >
    <VForm v-if="options" class="event-config-form" @submit.prevent="submit">
      <div class="event-config-section">
        <div class="event-config-title">{{ t("TXT_CODE_COMMON_AUTO_RESTART") }}</div>
        <div class="event-config-description">
          {{ t("TXT_CODE_COMMON_AUTOMATICALLY_RESTARTS_THE_INSTANCE_AFTER_AN_UNEXPECTED_STOP_OR_CRASH") }}
        </div>
        <VSwitch
          v-model="options.config.eventTask.autoRestart"
          color="primary"
          hide-details
        />
      </div>

      <div v-if="options.config.eventTask.autoRestart" class="event-config-section">
        <div class="event-config-title">{{ t("TXT_CODE_COMMON_MAXIMUM_AUTO_RESTART_COUNT") }}</div>
        <div class="event-config-description">{{ t("TXT_CODE_COMMON_DO_NOT_AUTOMATICALLY_RESTART_IF_THE_AUTO_RESTART_COUNT_IS_REACHED_SET_TO_1_TO_DISABLE") }}</div>
        <VTextField
          v-model.number="options.config.eventTask.autoRestartMaxTimes"
          type="number"
          class="event-config-number"
          hide-details
          variant="solo-filled"
        />
      </div>

      <div class="event-config-section">
        <div class="event-config-title">{{ t("TXT_CODE_COMMON_AUTO_START") }}</div>
        <div class="event-config-description">
          {{ t("TXT_CODE_COMMON_AUTOMATICALLY_STARTS_THE_INSTANCE_WHEN_THE_NODE_STARTS") }}
          <br />
          {{ t("TXT_CODE_COMMON_THIS_COULD_BE_USED_FOR_INSTANCE_TO_START_AS_THE_REMOTE_DAEMON_BOOTS") }}
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
