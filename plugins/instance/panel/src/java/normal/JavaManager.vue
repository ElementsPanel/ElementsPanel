<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import { useAddJavaDialog, useDownloadJavaDialog } from "../dialogs";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { updateInstanceConfig } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { addJava, deleteJava, downloadJava, usingJava } from "../api";
import { parseTimestamp } from "@elementspanel/epanel-plugin-console/tools/time";
import type { JavaInfo } from "../types";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { computed, ref, watch } from "vue";
import { VBtn, VDataTable } from "vuetify/components";
import { useJavaList } from "../hooks/useJavaList";
import JavaRuntimeStatus from "../components/JavaRuntimeStatus.vue";

interface InstanceInfo {
  config: { java: { id: string } };
}
const props = defineProps<{
  instanceInfo?: InstanceInfo;
  daemonId?: string;
  instanceUuid?: string;
  instanceId?: string;
}>();
const resolvedInstanceId = computed(() => props.instanceUuid ?? props.instanceId ?? "");
const selectedJavaId = ref<string>();
watch(
  () => props.instanceInfo?.config.java.id,
  (id) => {
    selectedJavaId.value = id;
  },
  { immediate: true }
);
const open = ref(false);
const {
  javaList,
  loading: listLoading,
  error: listError,
  refresh
} = useJavaList({
  daemonId: () => props.daemonId ?? "",
  instanceId: () => resolvedInstanceId.value,
  active: () => open.value
});
const deleteDialogOpen = ref(false);
const deleteCandidate = ref<JavaInfo>();
const { isLoading } = updateInstanceConfig();
const javaDescription = computed(() =>
  t(
    "TXT_CODE_COMMON_AFTER_COMPLETING_THE_CONFIGURATION_THE_JAVA_COMMAND_WILL_BE_REPLACED_WITH"
  ).replace("<mcsm_java>", "{mcsm_java}")
);

const refreshJavaList = async (out = false) => {
  try {
    await refresh(true);
    if (out) message.success(t("TXT_CODE_COMMON_REFRESHED"));
  } catch (err: any) {
    message.error(err.message);
  }
};
const openDialog = () => {
  open.value = true;
};
const close = () => {
  open.value = false;
};
const handleDownloadJava = async () => {
  const data = await useDownloadJavaDialog(
    props.daemonId ?? "",
    javaList.value.filter((item) => !item.info.error).map((item) => item.info.fullname)
  );
  if (!data) return;
  await startDownload(data.version);
};
const startDownload = async (version: string) => {
  try {
    await downloadJava().execute({
      params: { daemonId: props.daemonId ?? "", instanceId: resolvedInstanceId.value },
      data: { name: "msl", version }
    });
    message.success(t("TXT_CODE_JAVA_DOWNLOAD_STARTED"));
    await refreshJavaList();
  } catch (err: any) {
    message.error(err.message);
  }
};
const handleAddJava = async () => {
  const data = await useAddJavaDialog();
  if (!data) return;
  try {
    await addJava().execute({
      params: { daemonId: props.daemonId ?? "" },
      data: { name: data.name, path: data.path }
    });
    message.success(t("TXT_CODE_JAVA_RUNTIME_ADD_SUCCESS"));
    await refreshJavaList();
  } catch (err: any) {
    message.error(err.message);
  }
};
const handleDeleteJava = async () => {
  if (!deleteCandidate.value) return;
  try {
    await deleteJava().execute({
      params: { daemonId: props.daemonId ?? "", instanceId: resolvedInstanceId.value },
      data: { id: deleteCandidate.value.fullname }
    });
    await refreshJavaList();
  } catch (err: any) {
    message.error(err.message);
  }
  deleteDialogOpen.value = false;
};
const handleUsingJava = async (info: JavaInfo) => {
  try {
    await usingJava().execute({
      params: { daemonId: props.daemonId ?? "", instanceId: resolvedInstanceId.value },
      data: { id: info.fullname }
    });
    selectedJavaId.value = info.fullname;
    message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
    await refreshJavaList();
  } catch (err: any) {
    message.error(err.message);
  }
};
const confirmDelete = (info: JavaInfo) => {
  deleteCandidate.value = info;
  deleteDialogOpen.value = true;
};
const headers = [
  { title: t("TXT_CODE_COMMON_ENVIRONMENT_NAME"), key: "fullname" },
  { title: t("TXT_CODE_COMMON_INSTALLATION_TIME"), key: "installTime" },
  { title: t("TXT_CODE_COMMON_STATUS"), key: "status" },
  { title: t("TXT_CODE_COMMON_ACTIONS"), key: "actions", sortable: false, align: "end" }
] as any;
defineExpose({ open: openDialog, openDialog });
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="t('TXT_CODE_COMMON_JAVA_MANAGER')"
    :max-width="1000"
    :confirm-loading="isLoading"
    :show-cancel="false"
    :ok-text="t('TXT_CODE_JAVA_RUNTIME_SETUP_DONE')"
    @ok="close"
  >
    <div class="text-medium-emphasis mb-1">
      {{ t("TXT_CODE_COMMON_SELECT_JAVA_FOR_THE_INSTANCE_DOCKER_INSTANCES_USE_THE_IMAGE_S_RUNTIME")
      }}<br />{{ javaDescription }}
    </div>
    <div class="java-actions">
      <VBtn variant="text" prepend-icon="mdi-plus" @click="handleAddJava">{{
        t("TXT_CODE_COMMON_ADD_INSTALLED_JAVA")
      }}</VBtn>
      <VBtn variant="text" prepend-icon="mdi-download" @click="handleDownloadJava">{{
        t("TXT_CODE_COMMON_DOWNLOAD_OTHER_JAVA")
      }}</VBtn>
      <VBtn variant="text" prepend-icon="mdi-refresh" @click="refreshJavaList(true)">{{
        t("TXT_CODE_COMMON_REFRESH")
      }}</VBtn>
    </div>
    <Empty
      v-if="listError"
      icon="mdi-alert-circle-outline"
      :title="t('TXT_CODE_COMMON_PAGE_FAILED_TO_LOAD_PLEASE_TRY_AGAIN_LATER')"
      :description="listError"
      :compact="!!javaList.length"
    >
      <template #actions>
        <VBtn
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="listLoading"
          @click="refreshJavaList()"
          >{{ t("TXT_CODE_COMMON_RETRY") }}</VBtn
        >
      </template>
    </Empty>
    <VDataTable
      v-if="!listError || javaList.length"
      :headers="headers"
      :items="javaList"
      :loading="listLoading"
      :items-per-page="15"
      class="java-table"
    >
      <template #no-data><Empty icon="mdi-language-java" /></template>
      <template #item.fullname="{ item }">{{ item.info.fullname }}</template>
      <template #item.installTime="{ item }">{{ parseTimestamp(item.info.installTime) }}</template>
      <template #item.status="{ item }"><JavaRuntimeStatus :runtime="item" /></template>
      <template #item.actions="{ item }">
        <div class="java-row-actions">
          <VBtn
            v-if="item.info.error && /^msl_[0-9]+$/.test(item.info.fullname)"
            size="small"
            variant="text"
            @click="startDownload(item.info.fullname.slice(4))"
            >{{ t("TXT_CODE_COMMON_RETRY") }}</VBtn
          >
          <VBtn
            size="small"
            variant="text"
            :disabled="
              item.info.fullname === selectedJavaId || item.info.downloading || !!item.info.error
            "
            @click="handleUsingJava(item.info)"
            >{{
              item.info.fullname === selectedJavaId
                ? t("TXT_CODE_COMMON_IN_USE")
                : t("TXT_CODE_COMMON_USE")
            }}</VBtn
          ><VBtn
            size="small"
            color="error"
            variant="text"
            prepend-icon="mdi-delete-outline"
            :disabled="item.info.downloading"
            @click="confirmDelete(item.info)"
            >{{ t("TXT_CODE_COMMON_DELETE") }}</VBtn
          >
        </div>
      </template>
    </VDataTable>
  </AppDialog>
  <AppDialog
    v-model:open="deleteDialogOpen"
    :title="t('TXT_CODE_COMMON_DELETE_JAVA_RUNTIME')"
    compact
    ok-color="error"
    :ok-text="t('TXT_CODE_COMMON_DELETE')"
    @ok="handleDeleteJava"
    ><p>{{ deleteCandidate?.fullname }}</p>
    <div>
      {{ t("TXT_CODE_COMMON_EXTERNALLY_ADDED_JAVA_IS_REMOVED_FROM_THE_LIST_ITS_FILES_ARE_KEPT") }}
    </div></AppDialog
  >
</template>

<style scoped>
.java-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.java-table {
  width: 100%;
}
.java-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
