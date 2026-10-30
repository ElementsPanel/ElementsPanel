<script lang="ts" setup>
import type { ComputedNodeInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg, isLocalNetworkIP, reportErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import _ from "lodash";
import { reactive, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VDialog,
  VForm,
  VTextField
} from "vuetify/components";
import { useRemoteNode } from "../../hooks/useRemoteNode";

const { addNode, deleteNode, updateNode } = useRemoteNode({ poll: false });
const editMode = ref(false);
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> }>();

const DEFAULT_CONFIG = {
  ip: "",
  port: 24444,
  prefix: "",
  remarks: "Unnamed Node",
  apiKey: ""
};

const dialog = reactive({
  status: false,
  loading: false,
  uuid: "",
  data: _.cloneDeep(DEFAULT_CONFIG)
});

const ipNeedsMapping = (ip: string) =>
  Boolean(ip && ip.trim() !== "localhost" && isLocalNetworkIP(ip));
const requiredRule = (value: unknown) => !!String(value ?? "").trim() || t("TXT_CODE_cb08d342");
const apiKeyRule = (value: unknown) => editMode.value || requiredRule(value);

const openDialog = (data?: ComputedNodeInfo, uuid?: string) => {
  if (data && uuid) {
    editMode.value = true;
    dialog.uuid = uuid;
    dialog.data = {
      ..._.cloneDeep(DEFAULT_CONFIG),
      ..._.pick(data, Object.keys(DEFAULT_CONFIG)),
      apiKey: ""
    };
  } else {
    editMode.value = false;
    dialog.data = _.cloneDeep(DEFAULT_CONFIG);
  }
  dialog.status = true;
};

const closeDialog = () => {
  dialog.status = false;
  dialog.loading = false;
  dialog.uuid = "";
  dialog.data = _.cloneDeep(DEFAULT_CONFIG);
};
const submit = async () => {
  try {
    const result = await formRef.value?.validate();
    if (result && !result.valid) return;
    dialog.loading = true;
    if (editMode.value)
      await updateNode(dialog.uuid, { ...dialog.data, apiKey: dialog.data.apiKey || undefined });
    else await addNode(dialog.data);
    message.success(t("TXT_CODE_e74d658c"));
    const wasEdit = editMode.value;
    closeDialog();
    if (wasEdit) setTimeout(() => window.location.reload(), 150);
  } catch (error: any) {
    if (error?.errorFields instanceof Array) {
      message.warning(getValidatorErrorMsg(error, t("TXT_CODE_5245bd11")));
      return;
    }
    reportErrorMsg(error?.message ?? t("TXT_CODE_5245bd11"));
  } finally {
    dialog.loading = false;
  }
};
const remove = async () => {
  Modal.confirm({
    title: t("TXT_CODE_fb267b0b"),
    onOk: async () => {
      try {
        await deleteNode(dialog.uuid);
        closeDialog();
        message.success(t("TXT_CODE_a00e84d7"));
      } catch (error: any) {
        message.error(error?.message ?? String(error));
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <VDialog v-model="dialog.status" class="app-dialog node-detail-dialog" max-width="900px">
    <VCard :title="t(editMode ? 'TXT_CODE_39c5229e' : 'TXT_CODE_15a381d5')" rounded="xl">
      <VCardText class="node-dialog-content">
        <VForm ref="formRef" @submit.prevent="submit">
          <VTextField
            v-model="dialog.data.remarks"
            :label="t('TXT_CODE_a884de59')"
            :placeholder="t('TXT_CODE_4b1d5199')"
            :rules="[(v) => !!String(v ?? '').trim() || t('TXT_CODE_cb08d342')]"
            required
          />
          <VTextField
            v-model="dialog.data.ip"
            :label="t('TXT_CODE_93f9b02a')"
            :hint="`${t('TXT_CODE_be7a689a')} ${t('TXT_CODE_c82a51b0')}`"
            :rules="[requiredRule]"
            persistent-hint
            required
          />
          <div v-if="ipNeedsMapping(dialog.data.ip)" class="form-hint">
            {{ t("TXT_CODE_93c3cb78") }}
          </div>
          <VTextField
            v-model.number="dialog.data.port"
            type="number"
            :label="t('TXT_CODE_4a6bf8c6')"
            :hint="t('TXT_CODE_df455795')"
            :rules="[requiredRule]"
            persistent-hint
            required
          />
          <VTextField
            v-model="dialog.data.apiKey"
            :label="t('TXT_CODE_300c2ff4')"
            :placeholder="editMode ? t('TXT_CODE_dc570cf2') : t('TXT_CODE_fe25087f')"
            :hint="t('TXT_CODE_5ef2cf20')"
            :rules="[apiKeyRule]"
            persistent-hint
            :required="!editMode"
          />
          <VTextField
            v-model="dialog.data.prefix"
            :label="t('TXT_CODE_693f31d6')"
            :hint="t('TXT_CODE_3e93e31e')"
            persistent-hint
          />
        </VForm>
      </VCardText>
      <VCardActions class="node-dialog-actions">
        <VBtn
          v-if="editMode"
          color="error"
          variant="text"
          prepend-icon="mdi-delete-outline"
          @click="remove"
          >{{ t("TXT_CODE_8b937b23") }}</VBtn
        >
        <div class="actions-spacer" />
        <VBtn variant="text" @click="closeDialog">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" :loading="dialog.loading" @click="submit">{{
          t("TXT_CODE_d507abff")
        }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.node-dialog-content {
  max-height: min(72vh, 760px);
  padding: 8px 24px 20px;
}

.node-dialog-actions {
  padding: 8px 16px 12px;
}

.actions-spacer {
  flex: 1 1 auto;
}

.form-hint {
  margin: -8px 0 12px;
  color: var(--color-gray-7);
  font-size: 12px;
}
</style>
