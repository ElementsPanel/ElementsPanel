<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VDialog,
  VForm,
  VTextField
} from "vuetify/components";
import { useNodeEditor } from "../../hooks/useNodeEditor";

const {
  editMode,
  formRef,
  dialog,
  ipNeedsMapping,
  requiredRule,
  apiKeyRule,
  openDialog,
  closeDialog,
  submit,
  remove
} = useNodeEditor();
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
      <VCardActions>
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

.actions-spacer {
  flex: 1 1 auto;
}

.form-hint {
  margin: -8px 0 12px;
  color: var(--color-gray-7);
  font-size: 12px;
}
</style>
