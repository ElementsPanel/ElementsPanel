<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import AppDialog from "@/components/AppDialog.vue";
import { batchDelete } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { VCheckbox } from "vuetify/components";
const props = defineProps<{ emitResult: (ok: boolean) => void; destroyComponent: () => void; instanceId: string; daemonId: string }>();
const deleteFiles = ref(false), isOpen = ref(true), loading = ref(false), confirmOpen = ref(false);
const submit = async (deleteFile = deleteFiles.value) => { const { execute } = batchDelete(); loading.value = true; try { await execute({ params: { daemonId: props.daemonId || "" }, data: { uuids: [props.instanceId || ""], deleteFile: Boolean(deleteFile) } }); props.emitResult(true); } catch (error) { reportErrorMsg(error); props.emitResult(false); } finally { loading.value = false; isOpen.value = false; props.destroyComponent(); } };
const onDelete = () => { if (deleteFiles.value) confirmOpen.value = true; else void submit(); };
const confirmDelete = async () => { confirmOpen.value = false; await submit(true); };
const onCancel = () => { isOpen.value = false; props.emitResult(false); props.destroyComponent(); };
</script>
<template>
  <AppDialog v-model:open="isOpen" :title="t('TXT_CODE_a0e19f38')" :confirm-loading="loading" :ok-text="deleteFiles ? t('TXT_CODE_584d786d') : t('TXT_CODE_a0e19f38')" :ok-color="deleteFiles ? 'error' : undefined" @ok="onDelete" @cancel="onCancel">
    <p>{{ t("TXT_CODE_1981470a") }}</p>
    <VCheckbox v-model="deleteFiles" :label="t('TXT_CODE_7542201a')" hide-details />
  </AppDialog>
  <AppDialog v-model:open="confirmOpen" :title="t('TXT_CODE_584d786d')" compact ok-color="error" :ok-text="t('TXT_CODE_10088738')" @ok="confirmDelete"><div>{{ t('TXT_CODE_90508729') }}</div></AppDialog>
</template>
