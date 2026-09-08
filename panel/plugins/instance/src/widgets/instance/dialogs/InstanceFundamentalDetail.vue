<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { TERMINAL_CODE } from "@/types/const";
import { INSTANCE_TYPE_TRANSLATION } from "@/hooks/useInstance";
import dayjs, { type Dayjs } from "dayjs";
import _ from "lodash";
import { computed, ref, unref } from "vue";
import { VBtn, VCol, VRow, VSelect, VTextField, VTextarea } from "vuetify/lib/components/index.mjs";
import { message } from "ant-design-vue";
import { dayjsToTimestamp, timestampToDayjs } from "@/tools/time";
import { useDockerEnvEditDialog } from "@/components/fc";

interface FormDetail extends InstanceDetail { dayjsEndTime?: Dayjs; }
const props = defineProps<{ instanceInfo?: InstanceDetail; instanceId?: string; daemonId?: string }>();
const emit = defineEmits(["update"]);
const options = ref<FormDetail>();
const screen = useScreen();
const isPhone = computed(() => screen.isPhone.value);
const open = ref(false);
const { execute, isLoading } = updateInstanceConfig();
const updateCommandDesc = t("TXT_CODE_fa487a47");
const UPDATE_CMD_TEMPLATE = t("TXT_CODE_61ca492b") + `"C:/SteamCMD/steamcmd.exe" +login anonymous +force_install_dir "{mcsm_workspace}" "+app_update 380870 validate" +quit`;
const initFormDetail = () => { if (props.instanceInfo) options.value = { ...props.instanceInfo, dayjsEndTime: timestampToDayjs(props.instanceInfo.config?.endTime) }; };
const isDockerMode = computed(() => options.value?.config.processType === "docker");
const openDialog = async () => { open.value = true; initFormDetail(); };
const encodeFormData = () => { const postData = _.cloneDeep(unref(options)); if (postData) { postData.config.endTime = dayjsToTimestamp(postData.dayjsEndTime); return postData; } throw new Error("Ref Options is null"); };
const submit = async () => {
  try {
    if (!options.value?.config) throw new Error("");
    await execute({ params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" }, data: encodeFormData().config });
    emit("update"); open.value = false; message.success(t("TXT_CODE_d3de39b4"));
  } catch (error: any) { reportErrorMsg(error.message ?? t("TXT_CODE_9911ac11")); }
};
const handleEditDockerEnv = async () => {
  if (!options.value?.config) return;
  const envs = options.value.config.docker.env?.map((v) => { const tmp = v.split("="); return { label: tmp[0] || "", value: tmp[1] || "" }; });
  const result = await useDockerEnvEditDialog(envs);
  options.value.config.docker.env = result.map((v) => `${v.label}=${v.value}`);
};
defineExpose({ openDialog });
</script>

<template>
  <AppDialog v-model:open="open" :max-width="isPhone ? '100%' : '1200px'" :title="t('TXT_CODE_aac98b2a')" :confirm-loading="isLoading" :ok-text="t('TXT_CODE_abfe9512')" :mask-closable="false" @ok="submit">
    <div v-if="options" class="dialog-overflow-container">
      <p class="text-medium-emphasis">{{ t("TXT_CODE_66f38b2e") }}</p>
      <VRow>
        <VCol cols="12" lg="6"><VTextField v-model="options.config.nickname" :label="t('TXT_CODE_f70badb9')" disabled variant="solo-filled" hide-details /></VCol>
        <VCol cols="12" lg="6"><VTextField :model-value="INSTANCE_TYPE_TRANSLATION[options.config.type]" :label="t('TXT_CODE_2f291d8b')" disabled variant="solo-filled" hide-details /></VCol>
        <VCol cols="12" lg="6"><VTextField :model-value="options.dayjsEndTime ? dayjs(options.dayjsEndTime).format('YYYY-MM-DD HH:mm:ss') : ''" :label="t('TXT_CODE_fa920c0')" disabled variant="solo-filled" hide-details /></VCol>
        <VCol cols="12" lg="6"><VSelect v-model="options.config.fileCode" :items="TERMINAL_CODE" :label="t('TXT_CODE_f041de90')" variant="solo-filled" hide-details /></VCol>
        <VCol cols="12"><VTextarea v-model="options.config.startCommand" :label="t('TXT_CODE_d12fa808')" :placeholder="isDockerMode ? t('TXT_CODE_98e7c829') : t('TXT_CODE_f50cfe2')" :disabled="!isDockerMode" rows="5" variant="solo-filled" hide-details /></VCol>
        <VCol cols="12" lg="9"><VTextField v-model="options.config.updateCommand" :label="t('TXT_CODE_bb0b9711')" :hint="updateCommandDesc" persistent-hint :placeholder="UPDATE_CMD_TEMPLATE" :disabled="!isDockerMode" variant="solo-filled" hide-details="auto" /></VCol>
        <VCol cols="12" lg="3" class="d-flex align-center"><VBtn variant="tonal" @click="handleEditDockerEnv">{{ t('TXT_CODE_ad207008') }}</VBtn></VCol>
      </VRow>
    </div>
  </AppDialog>
</template>
