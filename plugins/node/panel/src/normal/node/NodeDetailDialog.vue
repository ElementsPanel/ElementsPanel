<script lang="ts" setup>
import type { ComputedNodeInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { getValidatorErrorMsg, isLocalNetworkIP, reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
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
const requiredRule = (value: unknown) => !!String(value ?? "").trim() || t("TXT_CODE_COMMON_FIELD_CANNOT_BE_EMPTY");
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
    message.success(t("TXT_CODE_NODE_SETTINGS_SAVED"));
    const wasEdit = editMode.value;
    closeDialog();
    if (wasEdit) setTimeout(() => window.location.reload(), 150);
  } catch (error: any) {
    if (error?.errorFields instanceof Array) {
      message.warning(getValidatorErrorMsg(error, t("TXT_CODE_COMMON_PLEASE_COMPLETE_THE_FORM")));
      return;
    }
    reportErrorMsg(error?.message ?? t("TXT_CODE_COMMON_PLEASE_COMPLETE_THE_FORM"));
  } finally {
    dialog.loading = false;
  }
};
const remove = async () => {
  Modal.confirm({
    title: t("TXT_CODE_COMMON_PERMANENTLY_DELETE_THIS_DAEMON"),
    onOk: async () => {
      try {
        await deleteNode(dialog.uuid);
        closeDialog();
        message.success(t("TXT_CODE_COMMON_DELETED"));
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
    <VCard :title="t(editMode ? 'TXT_CODE_COMMON_EDIT_DAEMON_INFORMATION' : 'TXT_CODE_COMMON_NEW_DAEMON')" rounded="xl">
      <VCardText class="node-dialog-content">
        <VForm ref="formRef" @submit.prevent="submit">
          <VTextField
            v-model="dialog.data.remarks"
            :label="t('TXT_CODE_COMMON_DISPLAY_NAME')"
            :placeholder="t('TXT_CODE_COMMON_SUPPORT_ANY_LANGUAGE')"
            :rules="[(v) => !!String(v ?? '').trim() || t('TXT_CODE_COMMON_FIELD_CANNOT_BE_EMPTY')]"
            required
          />
          <VTextField
            v-model="dialog.data.ip"
            :label="t('TXT_CODE_COMMON_DAEMON_IP')"
            :hint="t('TXT_CODE_COMMON_USE_AN_ADDRESS_REACHABLE_FROM_THE_PANEL_SERVER')"
            :rules="[requiredRule]"
            persistent-hint
            required
          />
          <div v-if="ipNeedsMapping(dialog.data.ip)" class="form-hint">
            {{ t("TXT_CODE_COMMON_FOR_THIS_ADDRESS_TO_WORK_YOU_MAY_NEED_TO_CONFIGURE_NODE_DIRECT_CONNECTION_MAPPINGS") }}
          </div>
          <VTextField
            v-model.number="dialog.data.port"
            type="number"
            :label="t('TXT_CODE_COMMON_DAEMON_PORT')"
            :hint="t('TXT_CODE_COMMON_BY_DEFAULT_24444')"
            :rules="[requiredRule]"
            persistent-hint
            required
          />
          <VTextField
            v-model="dialog.data.apiKey"
            :label="t('TXT_CODE_COMMON_DAEMON_KEY')"
            :placeholder="editMode ? t('TXT_CODE_COMMON_LEAVE_IT_BLANK_TO_MAKE_NO_CHANGES') : t('TXT_CODE_COMMON_PLEASE_ENTER_THE_KEY')"
            :hint="t('TXT_CODE_COMMON_ENTER_THE_KEY_GENERATED_BY_THE_NODE')"
            :rules="[apiKeyRule]"
            persistent-hint
            :required="!editMode"
          />
          <VTextField
            v-model="dialog.data.prefix"
            :label="t('TXT_CODE_NODE_CONNECTION_PATH_PREFIX')"
            :hint="t('TXT_CODE_COMMON_USED_WHEN_REUSING_PORTS_IN_MOST_CASES_NO_CONFIGURATION_IS_REQUIRED_HERE')"
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
          >{{ t("TXT_CODE_COMMON_REMOVE_DAEMON") }}</VBtn
        >
        <div class="actions-spacer" />
        <VBtn variant="text" @click="closeDialog">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn>
        <VBtn color="primary" :loading="dialog.loading" @click="submit">{{
          t("TXT_CODE_COMMON_CONFIRM")
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
