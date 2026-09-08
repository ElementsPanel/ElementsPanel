<script lang="ts" setup>
import type { ComputedNodeInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg, isLocalNetworkIP, reportErrorMsg } from "@/tools/validator";
import { message, Modal } from "ant-design-vue";
import _ from "lodash";
import { computed, reactive, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VCol,
  VDialog,
  VForm,
  VRow,
  VSelect,
  VSheet,
  VSwitch,
  VTab,
  VTabs,
  VTextField,
  VWindow,
  VWindowItem
} from "vuetify/lib/components/index.mjs";
import { useRemoteNode } from "../../hooks/useRemoteNode";
import NodeRemoteMappingEdit from "../NodeRemoteMappingEdit.vue";

const { addNode, deleteNode, updateNode } = useRemoteNode();
const editMode = ref(false);
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> }>();
const activeTabKey = ref("basic");
const daemonInfo = ref<ComputedNodeInfo | null>(null);

const DEFAULT_CONFIG = {
  ip: "", port: 24444, prefix: "", remarks: "Unnamed Node", apiKey: "", language: "",
  uploadSpeedRate: 0, downloadSpeedRate: 0, maxDownloadFromUrlFileCount: 1,
  portRangeStart: 0, portRangeEnd: 0, portAssignInterval: 0, daemonPort: 24444,
  remoteMappings: [] as IPanelOverviewRemoteMappingResponse[], outputBufferSize: 256,
  enableSoftShutdown: true, softShutdownSkipDocker: true, softShutdownWaitSeconds: 10,
  instanceBackupPath: "", instanceBackupFormat: "zip", instanceBackupCompressionLevel: 9
};

const SPEED_RATE_OPTIONS = [
  { title: t("TXT_CODE_e3a77a77"), value: 0 }, { title: "320KB/s", value: 5 }, { title: "640KB/s", value: 10 },
  { title: "1MB/s", value: 16 }, { title: "2MB/s", value: 32 }, { title: "4MB/s", value: 64 },
  { title: "6MB/s", value: 96 }, { title: "8MB/s", value: 128 }, { title: "10MB/s", value: 160 },
  { title: "15MB/s", value: 240 }, { title: "20MB/s", value: 320 }, { title: "30MB/s", value: 480 }
];

const dialog = reactive({
  status: false, loading: false, title: computed(() => editMode.value ? t("TXT_CODE_39c5229e") : t("TXT_CODE_15a381d5")),
  uuid: "", data: _.cloneDeep(DEFAULT_CONFIG)
});

const ipNeedsMapping = (ip: string) => Boolean(ip && ip.trim() !== "localhost" && isLocalNetworkIP(ip));
const requiredRule = (value: unknown) => !!String(value ?? "").trim() || t("TXT_CODE_cb08d342");
const apiKeyRule = (value: unknown) => editMode.value || requiredRule(value);

const openDialog = (data?: ComputedNodeInfo, uuid?: string) => {
  if (data && uuid) {
    daemonInfo.value = data; editMode.value = true; dialog.uuid = uuid;
    dialog.data = { ..._.cloneDeep(DEFAULT_CONFIG), ...data, ...data.config, port: data.port, daemonPort: data.config?.port ?? 24444, apiKey: "", remoteMappings: data.remoteMappings ?? [] };
  } else {
    daemonInfo.value = null; editMode.value = false; dialog.data = _.cloneDeep(DEFAULT_CONFIG);
  }
  activeTabKey.value = "basic";
  dialog.status = true;
};

const closeDialog = () => { dialog.status = false; dialog.loading = false; dialog.uuid = ""; dialog.data = _.cloneDeep(DEFAULT_CONFIG); };
const submit = async () => {
  try {
    const result = await formRef.value?.validate();
    if (result && !result.valid) return;
    dialog.loading = true;
    if (editMode.value) await updateNode(dialog.uuid, { ...dialog.data, setting: { ...dialog.data } });
    else await addNode(dialog.data);
    message.success(t("TXT_CODE_e74d658c"));
    const wasEdit = editMode.value;
    closeDialog();
    if (wasEdit) setTimeout(() => window.location.reload(), 150);
  } catch (error: any) {
    if (error?.errorFields instanceof Array) { message.warning(getValidatorErrorMsg(error, t("TXT_CODE_5245bd11"))); return; }
    reportErrorMsg(error?.message ?? t("TXT_CODE_5245bd11"));
  } finally { dialog.loading = false; }
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
  <VDialog v-model="dialog.status" class="app-dialog node-detail-dialog" max-width="900px" scrollable>
    <VCard rounded="xl">
      <VCardTitle class="node-dialog-title">{{ dialog.title }}</VCardTitle>
      <VCardText class="node-dialog-content">
        <VTabs v-model="activeTabKey" color="primary" density="comfortable" class="mb-4">
          <VTab value="basic">{{ t("TXT_CODE_cc7b54b9") }}</VTab>
          <VTab v-if="daemonInfo?.available" value="advanced">{{ t("TXT_CODE_31a1d824") }}</VTab>
        </VTabs>

        <VWindow v-model="activeTabKey" class="node-dialog-form">
          <VWindowItem value="basic">
            <VForm ref="formRef" @submit.prevent="submit">
              <VTextField v-model="dialog.data.remarks" :label="t('TXT_CODE_a884de59')"
                :placeholder="t('TXT_CODE_4b1d5199')"
                :rules="[(v) => !!String(v ?? '').trim() || t('TXT_CODE_cb08d342')]" required />
              <VTextField v-model="dialog.data.ip" :label="t('TXT_CODE_93f9b02a')"
                :hint="`${t('TXT_CODE_be7a689a')} ${t('TXT_CODE_c82a51b0')}`" :rules="[requiredRule]" persistent-hint
                required />
              <div v-if="ipNeedsMapping(dialog.data.ip)" class="form-hint">{{ t("TXT_CODE_93c3cb78") }}</div>
              <VTextField v-model.number="dialog.data.port" type="number" :label="t('TXT_CODE_4a6bf8c6')"
                :hint="t('TXT_CODE_df455795')" :rules="[requiredRule]" persistent-hint required />
              <VTextField v-model="dialog.data.apiKey" :label="t('TXT_CODE_300c2ff4')"
                :placeholder="editMode ? t('TXT_CODE_dc570cf2') : t('TXT_CODE_fe25087f')" :hint="t('TXT_CODE_5ef2cf20')"
                :rules="[apiKeyRule]" persistent-hint :required="!editMode" />
              <VTextField v-model="dialog.data.prefix" :label="t('TXT_CODE_693f31d6')" :hint="t('TXT_CODE_3e93e31e')"
                persistent-hint />
            </VForm>
          </VWindowItem>

          <VWindowItem value="advanced">
            <VRow>
              <VCol cols="12" md="6">
                <VSelect v-model="dialog.data.uploadSpeedRate" :items="SPEED_RATE_OPTIONS" item-title="title"
                  item-value="value" :label="t('TXT_CODE_fde31068')" :hint="t('TXT_CODE_d8d19932')" persistent-hint />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect v-model="dialog.data.downloadSpeedRate" :items="SPEED_RATE_OPTIONS" item-title="title"
                  item-value="value" :label="t('TXT_CODE_785a0fcf')" :hint="t('TXT_CODE_b9fc604c')" persistent-hint />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField v-model.number="dialog.data.maxDownloadFromUrlFileCount" type="number"
                  :label="t('TXT_CODE_a15fca22')" :hint="t('TXT_CODE_ecaf78a2')" persistent-hint />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField v-model.number="dialog.data.outputBufferSize" type="number"
                  :label="t('TXT_CODE_daemon_outputBufferSize')" :hint="t('TXT_CODE_daemon_outputBufferSizeInfo')"
                  persistent-hint />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch v-model="dialog.data.enableSoftShutdown" :label="t('TXT_CODE_daemon_enableSoftShutdown')"
                  :hint="t('TXT_CODE_daemon_enableSoftShutdownInfo')" persistent-hint color="primary" />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch v-model="dialog.data.softShutdownSkipDocker"
                  :label="t('TXT_CODE_daemon_softShutdownSkipDocker')"
                  :hint="t('TXT_CODE_daemon_softShutdownSkipDockerInfo')" persistent-hint color="primary" />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField v-model.number="dialog.data.softShutdownWaitSeconds" type="number"
                  :label="t('TXT_CODE_daemon_softShutdownWaitSeconds')"
                  :hint="t('TXT_CODE_daemon_softShutdownWaitSecondsInfo')" persistent-hint />
              </VCol>
              <VCol cols="12">
                <VTextField v-model.number="dialog.data.daemonPort" type="number" :label="t('TXT_CODE_cd1f9ef7')"
                  :hint="t('TXT_CODE_75ef0619')" persistent-hint />
              </VCol>
              <VCol cols="12">
                <VTextField v-model="dialog.data.instanceBackupPath" :label="t('TXT_CODE_INSTANCE_BACKUP_PATH')"
                  :hint="t('TXT_CODE_INSTANCE_BACKUP_PATH_HINT')" placeholder="data/backups" persistent-hint />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect v-model="dialog.data.instanceBackupFormat" :items="['zip', 'tar.gz', '7z']"
                  :label="t('TXT_CODE_e06c1cea')" />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField v-model.number="dialog.data.instanceBackupCompressionLevel" type="number" min="0" max="9"
                  :label="t('TXT_CODE_743ed87f')" />
              </VCol>
              <VCol cols="12">
                <VSheet class="mapping-sheet" rounded="xl" variant="tonal">
                  <div class="mapping-label">{{ t('TXT_CODE_bbe23ee7') }}</div>
                  <div class="form-hint">{{ t('TXT_CODE_497568db') }}</div>
                  <NodeRemoteMappingEdit v-model:value="dialog.data.remoteMappings" />
                </VSheet>
              </VCol>
            </VRow>
          </VWindowItem>
        </VWindow>
      </VCardText>
      <VCardActions class="node-dialog-actions">
        <VBtn v-if="editMode" color="error" variant="text" prepend-icon="mdi-delete-outline" @click="remove">{{
          t("TXT_CODE_8b937b23") }}</VBtn>
        <div class="actions-spacer" />
        <VBtn variant="text" @click="closeDialog">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" :loading="dialog.loading" @click="submit">{{ t("TXT_CODE_d507abff") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.node-dialog-title {
  padding: 12px 24px 4px;
  font-weight: 600;
}

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

.mapping-sheet {
  padding: 16px;
}

.mapping-label {
  margin-bottom: 4px;
  font-weight: 600;
}
</style>
