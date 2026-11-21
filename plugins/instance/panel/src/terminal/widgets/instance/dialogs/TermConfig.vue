<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { ref, computed } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { InstanceDetail } from "@elementspanel/epanel-plugin-console/types";
import { updateInstanceConfig } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { TERMINAL_CODE } from "@elementspanel/epanel-plugin-console/types/const";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import {
  VCol,
  VForm,
  VRow,
  VSelect,
  VSwitch,
  VTextField
} from "vuetify/components";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceUuid?: string;
  instanceId?: string;
  daemonId?: string;
}>();
const emit = defineEmits(["update"]);
const options = ref<InstanceDetail>();

const open = ref(false);
const openDialog = () => {
  open.value = true;
  options.value = props.instanceInfo;
};

const resolvedInstanceId = computed(() => props.instanceUuid ?? props.instanceId ?? "");
const { execute, isLoading } = updateInstanceConfig();

const submit = async () => {
  try {
    await execute({
      params: {
        uuid: resolvedInstanceId.value,
        daemonId: props.daemonId ?? ""
      },
      data: {
        terminalOption: options.value?.config.terminalOption,
        crlf: options.value?.config.crlf,
        ie: options.value?.config.ie,
        oe: options.value?.config.oe,
        stopCommand: options.value?.config.stopCommand
      }
    });
    emit("update");
    open.value = false;
    return message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
  } catch (err: any) {
    return reportErrorMsg(err.message);
  }
};

defineExpose({
  open: openDialog,
  openDialog
});
</script>

<template>
  <AppDialog
    v-model:open="open"
    max-width="760px"
    :title="t('TXT_CODE_COMMON_TERMINAL_SETTINGS')"
    :confirm-loading="isLoading"
    :ok-text="t('TXT_CODE_COMMON_SAVE')"
    @ok="submit"
  >
    <VForm v-if="options" class="term-config-form" @submit.prevent="submit">
      <VRow density="compact">
        <VCol cols="12" md="6">
          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_COMMON_EMULATED_TERMINAL") }}</div>
            <div class="term-config-description">
              {{ t("TXT_CODE_COMMON_SUPPORTS_TAB_AND_CTRL_SHORTCUTS_DISABLE_IF_COMPATIBILITY_ISSUES_OCCUR") }}
            </div>
            <VSwitch v-model="options.config.terminalOption.pty" color="primary" hide-details />
          </div>

          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_COMMON_COLOR_RENDERING") }}</div>
            <div class="term-config-description">
              {{ t("TXT_CODE_COMMON_AUTOMATICALLY_COLORS_OUTPUT_DISABLE_IF_IT_CONFLICTS_WITH_THE_APPLICATION_S_COLORS") }}
            </div>
            <VSwitch v-model="options.config.terminalOption.haveColor" color="primary" hide-details />
          </div>

          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_COMMON_COMMAND_LINE_ENDING") }}</div>
            <div class="term-config-description">
              {{ t("TXT_CODE_TERMINAL_LINE_ENDING_PLATFORM_HINT") }}
            </div>
            <VSelect
              v-model="options.config.crlf"
              :items="[
                { title: t('TXT_CODE_COMMON_LINE_FEED'), value: 1 },
                { title: t('TXT_CODE_COMMON_CARRIAGE_RETURN_AND_LINE_FEED'), value: 2 }
              ]"
              :placeholder="t('TXT_CODE_COMMON_PLEASE_SELECT')"
              class="term-config-control"
              hide-details
            >
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect>
          </div>
        </VCol>

        <VCol cols="12" md="6">
          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_COMMON_INSTANCE_SHUTDOWN_COMMAND") }}</div>
            <div class="term-config-description">{{ t("TXT_CODE_COMMON_RUNS_WHEN_STOPPING_THE_INSTANCE_C_SENDS_CTRL_C") }}</div>
            <VTextField
              v-model="options.config.stopCommand"
              class="term-config-control"
              hide-details
            />
          </div>

          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_COMMON_INPUT_AND_OUTPUT_ENCODING") }}</div>
            <div class="term-config-description">{{ t("TXT_CODE_COMMON_CHANGE_THE_ENCODING_IF_TERMINAL_OUTPUT_IS_GARBLED") }}</div>
            <div class="term-config-encoding">
              <VSelect
                v-model="options.config.ie"
                :items="TERMINAL_CODE"
                :placeholder="t('TXT_CODE_COMMON_TERMINAL_INPUT_ENCODING')"
                hide-details
              >
                <template #no-data><Empty :icon="false" compact /></template>
              </VSelect>
              <VSelect
                v-model="options.config.oe"
                :items="TERMINAL_CODE"
                :placeholder="t('TXT_CODE_COMMON_TERMINAL_OUTPUT_ENCODING')"
                hide-details
              >
                <template #no-data><Empty :icon="false" compact /></template>
              </VSelect>
            </div>
          </div>
        </VCol>
      </VRow>
    </VForm>
  </AppDialog>
</template>

<style lang="scss" scoped>
.term-config-form {
  display: block;
}

.term-config-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 24px;
}

.term-config-title {
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}

.term-config-description {
  color: var(--color-gray-7);
  font-size: 13px;
  line-height: 1.6;
}

.term-config-control {
  width: min(100%, 280px);
}

.term-config-encoding {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
}

.term-config-encoding > * {
  width: min(100%, 180px);
}
</style>
