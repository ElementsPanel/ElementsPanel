<script setup lang="ts">
import { reactive, ref } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { updateInstanceConfig } from "@/services/apis/instance";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import AppDialog from "@/components/AppDialog.vue";
import { VSwitch, VTextField } from "vuetify/components";
const props = defineProps<{ instanceInfo?: InstanceDetail; instanceId?: string; daemonId?: string }>();
const emit = defineEmits(["update"]);
const open = ref(false), isLoading = ref(false);
const formData = reactive({ rconIp: "", rconPassword: "", rconPort: "", enableRcon: false });
const openDialog = () => { open.value = true; formData.rconIp = props.instanceInfo?.config?.rconIp ?? ""; formData.rconPassword = props.instanceInfo?.config?.rconPassword ?? ""; formData.rconPort = String(props.instanceInfo?.config?.rconPort || ""); formData.enableRcon = props.instanceInfo?.config?.enableRcon ?? false; };
const { execute } = updateInstanceConfig();
const submit = async () => { try { isLoading.value = true; await execute({ params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" }, data: { rconIp: formData.rconIp, rconPassword: formData.rconPassword, rconPort: Number(formData.rconPort || 0), enableRcon: formData.enableRcon } }); emit("update"); open.value = false; message.success(t("TXT_CODE_d3de39b4")); } catch (err: any) { reportErrorMsg(err?.message || err); } finally { isLoading.value = false; } };
defineExpose({ openDialog });
</script>
<template>
  <AppDialog v-model:open="open" :title="t('TXT_CODE_282b0721')" :confirm-loading="isLoading" :ok-text="t('TXT_CODE_abfe9512')" compact @ok="submit">
    <p class="text-medium-emphasis">{{ t("TXT_CODE_32d87bf1") }}</p>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_179d7be4") }}</div><div class="field-help">{{ t("TXT_CODE_a8839b35") }}</div><VSwitch v-model="formData.enableRcon" color="primary" hide-details /></div>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_d629fa48") }}</div><div class="field-help">{{ t("TXT_CODE_8e2be926") }}</div><VTextField v-model="formData.rconIp" :placeholder="t('TXT_CODE_47129a5b')" variant="solo-filled" hide-details /></div>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_890aa44c") }}</div><div class="field-help">{{ t("TXT_CODE_a4748cb0") }}</div><VTextField v-model="formData.rconPort" :placeholder="t('TXT_CODE_e2dc0156')" variant="solo-filled" hide-details /></div>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_2880eed4") }}</div><div class="field-help">{{ t("TXT_CODE_3ae0276b") }}</div><VTextField v-model="formData.rconPassword" type="password" :placeholder="t('TXT_CODE_25af3af3')" variant="solo-filled" hide-details /></div>
  </AppDialog>
</template>
<style scoped>.field-block{margin-top:16px}.field-title{font-weight:600;margin-bottom:4px}.field-help{color:var(--color-gray-7);font-size:13px;margin-bottom:6px}</style>
