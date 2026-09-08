<script setup lang="ts">
import { ref, computed } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { updateInstanceConfig } from "@/services/apis/instance";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { TERMINAL_CODE } from "@/types/const";
import AppDialog from "@/components/AppDialog.vue";
import {
  VCol,
  VForm,
  VRow,
  VSelect,
  VSwitch,
  VTextField
} from "vuetify/lib/components/index.mjs";

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
    return message.success(t("TXT_CODE_d3de39b4"));
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
    :title="t('TXT_CODE_d23631cb')"
    :confirm-loading="isLoading"
    :ok-text="t('TXT_CODE_abfe9512')"
    @ok="submit"
  >
    <VForm v-if="options" class="term-config-form" @submit.prevent="submit">
      <VRow dense>
        <VCol cols="12" md="6">
          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_ef650d57") }}</div>
            <div class="term-config-description">
              {{ t("TXT_CODE_feeea328") }}<br />{{ t("TXT_CODE_d6e7f572") }}
            </div>
            <VSwitch v-model="options.config.terminalOption.pty" color="primary" hide-details />
          </div>

          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_e1a3b150") }}</div>
            <div class="term-config-description">
              {{ t("TXT_CODE_6a515e35") }}<br />{{ t("TXT_CODE_1295831e") }}
            </div>
            <VSwitch v-model="options.config.terminalOption.haveColor" color="primary" hide-details />
          </div>

          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_b91a94f9") }}</div>
            <div class="term-config-description">
              {{ t("TXT_CODE_5b2daea0") }}<br />{{ t("TXT_CODE_b94f13ce") }}
            </div>
            <VSelect
              v-model="options.config.crlf"
              :items="[
                { title: t('TXT_CODE_365aabd4'), value: 1 },
                { title: t('TXT_CODE_20cec54'), value: 2 }
              ]"
              :placeholder="t('TXT_CODE_3bb646e4')"
              class="term-config-control"
              hide-details
            />
          </div>
        </VCol>

        <VCol cols="12" md="6">
          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_11cfe3a1") }}</div>
            <div class="term-config-description">{{ t("TXT_CODE_7ec7ccb8") }}</div>
            <VTextField
              v-model="options.config.stopCommand"
              class="term-config-control"
              hide-details
            />
          </div>

          <div class="term-config-section">
            <div class="term-config-title">{{ t("TXT_CODE_449d1581") }}</div>
            <div class="term-config-description">{{ t("TXT_CODE_d16d82ab") }}</div>
            <div class="term-config-encoding">
              <VSelect
                v-model="options.config.ie"
                :items="TERMINAL_CODE"
                :placeholder="t('TXT_CODE_bd2559f3')"
                hide-details
              />
              <VSelect
                v-model="options.config.oe"
                :items="TERMINAL_CODE"
                :placeholder="t('TXT_CODE_6e96b2a9')"
                hide-details
              />
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
