<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { reactive, ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import { VTextField } from "vuetify/components";

const props = defineProps<{
  instanceUuid: string;
  daemonId: string;
  instanceInfo?: InstanceDetail;
}>();

const emit = defineEmits<{
  (e: "update"): void;
}>();

const open = ref(false);
const isLoading = ref(false);
const formData = reactive({
  ip: "",
  port: "",
  type: 1
});

const { execute: updateConfig } = updateInstanceConfig();

const openDialog = () => {
  open.value = true;
  formData.ip = props.instanceInfo?.config?.pingConfig?.ip || "";
  formData.port = String(props.instanceInfo?.config?.pingConfig?.port || "");
  formData.type = props.instanceInfo?.config?.pingConfig?.type ?? 1;
};

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
    emit("update");
    open.value = false;
    message.success(t("TXT_CODE_d3de39b4"));
  } catch (err: any) {
    reportErrorMsg(err?.message || err);
  } finally {
    isLoading.value = false;
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
    :title="t('TXT_CODE_40241d8e')"
    :confirm-loading="isLoading"
    :ok-text="t('TXT_CODE_abfe9512')"
    compact
    @ok="submit"
  >
    <div>
      <p class="mc-ping-description">
        <span>
          {{ t("TXT_CODE_57d1929e") }}
          <br />
          {{ t("TXT_CODE_6b175558") }}
        </span>
      </p>
      <div class="mc-ping-form">
        <div>
          <div class="mc-ping-label">{{ t("TXT_CODE_f49149d0") }}</div>
          <div class="mc-ping-help">{{ t("TXT_CODE_2ab036a4") }}</div>
          <VTextField v-model="formData.port" :placeholder="t('TXT_CODE_e2dc0156')" hide-details variant="solo-filled" />
        </div>
        <div>
          <div class="mc-ping-label">{{ t("TXT_CODE_2f59807a") }}</div>
          <div class="mc-ping-help">{{ t("TXT_CODE_8e2be926") }}</div>
          <VTextField v-model="formData.ip" :placeholder="t('TXT_CODE_ddc2de99')" hide-details variant="solo-filled" />
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.mc-ping-description { color: var(--color-gray-7); line-height: 1.6; }
.mc-ping-form { display: flex; flex-direction: column; gap: 16px; }
.mc-ping-label { font-weight: 600; margin-bottom: 4px; }
.mc-ping-help { color: var(--color-gray-7); font-size: 13px; margin-bottom: 6px; }
</style>
