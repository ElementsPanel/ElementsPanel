<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { updateInstanceConfig } from "@/services/apis/instance";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import AppDialog from "@/components/AppDialog.vue";
import { VTextField } from "vuetify/components";
const props = defineProps<{ instanceInfo?: InstanceDetail; instanceId?: string; daemonId?: string }>();
const emit = defineEmits(["update"]);
const options = ref<InstanceDetail>();
const open = ref(false);
const openDialog = () => { open.value = true; options.value = props.instanceInfo; };
const { execute, isLoading } = updateInstanceConfig();
const submit = async () => { try { await execute({ params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" }, data: { pingConfig: options.value?.config.pingConfig } }); emit("update"); open.value = false; message.success(t("TXT_CODE_d3de39b4")); } catch (err: any) { reportErrorMsg(err?.message || err); } };
defineExpose({ openDialog });
</script>
<template>
  <AppDialog v-model:open="open" :title="t('TXT_CODE_23b02a65')" :confirm-loading="isLoading" :ok-text="t('TXT_CODE_abfe9512')" compact @ok="submit">
    <template v-if="options">
      <p class="text-medium-emphasis">{{ t("TXT_CODE_2498e4ed") }}<br />{{ t("TXT_CODE_e7335483") }}</p>
      <div class="field-block"><div class="field-title">{{ t("TXT_CODE_8e632796") }}</div><div class="field-help">{{ t("TXT_CODE_c93f32f8") }}</div><VTextField v-model="options.config.pingConfig.ip" variant="solo-filled" hide-details /></div>
      <div class="field-block"><div class="field-title">{{ t("TXT_CODE_243a463") }}</div><div class="field-help">{{ t("TXT_CODE_e9935066") }}</div><VTextField v-model="options.config.pingConfig.port" type="number" variant="solo-filled" hide-details /></div>
    </template>
  </AppDialog>
</template>
<style scoped>.field-block{margin-top:16px}.field-title{font-weight:600;margin-bottom:4px}.field-help{color:var(--color-gray-7);font-size:13px;margin-bottom:6px}</style>
