<script setup lang="ts">
import { reactive, ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { InstanceDetail } from "@elementspanel/epanel-plugin-console/types";
import { updateInstanceConfig } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import { VSwitch, VTextField } from "vuetify/components";
const props = defineProps<{ instanceInfo?: InstanceDetail; instanceId?: string; daemonId?: string }>();
const emit = defineEmits(["update"]);
const open = ref(false), isLoading = ref(false);
const formData = reactive({ rconIp: "", rconPassword: "", rconPort: "", enableRcon: false });
const openDialog = () => { open.value = true; formData.rconIp = props.instanceInfo?.config?.rconIp ?? ""; formData.rconPassword = props.instanceInfo?.config?.rconPassword ?? ""; formData.rconPort = String(props.instanceInfo?.config?.rconPort || ""); formData.enableRcon = props.instanceInfo?.config?.enableRcon ?? false; };
const { execute } = updateInstanceConfig();
const submit = async () => { try { isLoading.value = true; await execute({ params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" }, data: { rconIp: formData.rconIp, rconPassword: formData.rconPassword, rconPort: Number(formData.rconPort || 0), enableRcon: formData.enableRcon } }); emit("update"); open.value = false; message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL")); } catch (err: any) { reportErrorMsg(err?.message || err); } finally { isLoading.value = false; } };
defineExpose({ openDialog });
</script>
<template>
  <AppDialog v-model:open="open" :title="t('TXT_CODE_COMMON_RCON')" :confirm-loading="isLoading" :ok-text="t('TXT_CODE_COMMON_SAVE')" compact @ok="submit">
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_COMMON_ENABLE_THE_RCON_PROTOCOL") }}</div><div class="field-help">{{ t("TXT_CODE_COMMON_WHEN_ENABLED_CONSOLE_COMMANDS_ARE_SENT_THROUGH_RCON") }}</div><VSwitch v-model="formData.enableRcon" color="primary" hide-details /></div>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_COMMON_GAME_SERVER_IP") }}</div><div class="field-help">{{ t("TXT_CODE_COMMON_LEAVE_BLANK_TO_USE_THE_NODE_S_LOCALHOST") }}</div><VTextField v-model="formData.rconIp" :placeholder="t('TXT_CODE_COMMON_LEAVE_BLANK_TO_AUTOMATICALLY_USE_LOCALHOST_AS_THE_HOST_ADDRESS')" hide-details /></div>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_COMMON_RCON_PORT") }}</div><div class="field-help">{{ t("TXT_CODE_COMMON_USE_THE_RCON_PORT_IN_THE_SERVER_CONFIGURATION") }}</div><VTextField v-model="formData.rconPort" :placeholder="t('TXT_CODE_COMMON_EXAMPLE_25565')" hide-details /></div>
    <div class="field-block"><div class="field-title">{{ t("TXT_CODE_COMMON_RCON_PASSWORD") }}</div><div class="field-help">{{ t("TXT_CODE_COMMON_USE_THE_RCON_PASSWORD_IN_THE_SERVER_CONFIGURATION") }}</div><VTextField v-model="formData.rconPassword" type="password" :placeholder="t('TXT_CODE_COMMON_RCON_ACCESS_PASSWORD')" hide-details /></div>
  </AppDialog>
</template>
<style scoped>.field-block{margin-top:16px}.field-title{font-weight:600;margin-bottom:4px}.field-help{color:var(--color-gray-7);font-size:13px;margin-bottom:6px}</style>
