<script setup lang="ts">
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import { batchDelete } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { getInstanceDeleteError } from "../../../tools/deletion";
import { VCheckbox } from "vuetify/components";
const props = defineProps<{
  emitResult: (ok: boolean) => void;
  destroyComponent: () => void;
  instanceId: string;
  daemonId: string;
}>();
const deleteFiles = ref(false),
  isOpen = ref(true),
  loading = ref(false),
  confirmOpen = ref(false);
const submit = async (deleteFile = deleteFiles.value) => {
  if (loading.value) return;
  const { execute } = batchDelete();
  loading.value = true;
  try {
    const result = await execute({
      params: { daemonId: props.daemonId || "" },
      data: { uuids: [props.instanceId || ""], deleteFile: Boolean(deleteFile) }
    });
    const error = getInstanceDeleteError(result.value);
    if (error) throw error;
    props.emitResult(true);
  } catch (error) {
    reportErrorMsg(error);
    props.emitResult(false);
  } finally {
    loading.value = false;
    isOpen.value = false;
    props.destroyComponent();
  }
};
const onDelete = () => {
  if (deleteFiles.value) confirmOpen.value = true;
  else void submit();
};
const confirmDelete = async () => {
  confirmOpen.value = false;
  await submit(true);
};
const onCancel = () => {
  isOpen.value = false;
  props.emitResult(false);
  props.destroyComponent();
};
</script>
<template>
  <AppDialog
    v-model:open="isOpen"
    :title="t('TXT_CODE_COMMON_DELETE_INSTANCE')"
    :confirm-loading="loading"
    :ok-text="
      deleteFiles
        ? t('TXT_CODE_COMMON_DELETE_INSTANCE_AND_RELATED_FILES')
        : t('TXT_CODE_COMMON_DELETE_INSTANCE')
    "
    :ok-color="deleteFiles ? 'error' : undefined"
    @ok="onDelete"
    @cancel="onCancel"
  >
    <p>
      {{
        t(
          "TXT_CODE_COMMON_IF_YOU_CHOOSE_TO_DELETE_THE_INSTANCE_RELATED_FILES_AT_THE_SAME_TIME_THE_ENTIRE_DIRECTORY"
        )
      }}
    </p>
    <VCheckbox
      v-model="deleteFiles"
      :label="t('TXT_CODE_COMMON_DELETE_INSTANCE_RELATED_FILES_SIMULTANEOUSLY')"
      hide-details
    />
  </AppDialog>
  <AppDialog
    v-model:open="confirmOpen"
    :title="t('TXT_CODE_COMMON_DELETE_INSTANCE_AND_RELATED_FILES')"
    compact
    ok-color="error"
    :ok-text="t('TXT_CODE_COMMON_CONFIRM_DELETION')"
    @ok="confirmDelete"
    ><div>{{ t("TXT_CODE_INSTANCE_DELETE_DIRECTORY_WARNING") }}</div></AppDialog
  >
</template>
