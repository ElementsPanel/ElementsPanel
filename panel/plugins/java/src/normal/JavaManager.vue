<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import { useAddJavaDialog, useDownloadJavaDialog } from "../dialogs";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { addJava, deleteJava, downloadJava, getJavaList, usingJava } from "../api";
import { parseTimestamp } from "@/tools/time";
import type { JavaInfo, JavaRuntime } from "../types";
import { message } from "ant-design-vue";
import { computed, ref, type Ref } from "vue";
import { VBtn, VChip, VDataTable } from "vuetify/lib/components/index.mjs";

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
const open = ref(false);
const javaList: Ref<JavaRuntime[] | undefined> = ref([]);
const deleteDialogOpen = ref(false);
const deleteCandidate = ref<JavaInfo>();
const { isLoading } = updateInstanceConfig();
const javaDescription = computed(() =>
  t("TXT_CODE_e1c637bb").replace("<mcsm_java>", "{mcsm_java}")
);

const refreshJavaList = async (out = false) => {
  try {
    const list = await getJavaList().execute({
      params: { daemonId: props.daemonId ?? "", instanceId: resolvedInstanceId.value }
    });
    javaList.value = list.value;
    if (out) message.success(t("TXT_CODE_fbde647e"));
  } catch (err: any) {
    message.error(err.message);
  }
};
const openDialog = async () => {
  await refreshJavaList();
  open.value = true;
};
const close = () => {
  open.value = false;
};
const handleDownloadJava = async () => {
  const data = await useDownloadJavaDialog(javaList.value?.map((item) => item.info.fullname) ?? []);
  if (!data) return;
  try {
    await downloadJava().execute({
      params: { daemonId: props.daemonId ?? "", instanceId: resolvedInstanceId.value },
      data: { name: data.name, version: data.version }
    });
    message.success(t("TXT_CODE_5e7a4c02"));
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
    message.success(t("TXT_CODE_10f0f8d"));
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
    if (props.instanceInfo) props.instanceInfo.config.java.id = info.fullname;
    message.success(t("TXT_CODE_d3de39b4"));
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
  { title: t("TXT_CODE_151d2bb7"), key: "fullname" },
  { title: t("TXT_CODE_a2e79565"), key: "installTime" },
  { title: t("TXT_CODE_759fb403"), key: "status" },
  { title: t("TXT_CODE_fe731dfc"), key: "actions", sortable: false, align: "end" }
] as any;
defineExpose({ open: openDialog, openDialog });
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="t('TXT_CODE_3fee13ed')"
    :max-width="1000"
    :confirm-loading="isLoading"
    :show-cancel="false"
    :ok-text="t('TXT_CODE_31e92ef3')"
    @ok="close"
  >
    <div class="text-medium-emphasis mb-4">
      {{ t("TXT_CODE_ebf01bcc") }}<br />{{ javaDescription }}
    </div>
    <div class="java-actions">
      <VBtn variant="text" prepend-icon="mdi-plus" @click="handleAddJava">{{
        t("TXT_CODE_8900e7ee")
      }}</VBtn>
      <VBtn variant="text" prepend-icon="mdi-download" @click="handleDownloadJava">{{
        t("TXT_CODE_9c48100e")
      }}</VBtn>
      <VBtn variant="text" prepend-icon="mdi-refresh" @click="refreshJavaList(true)">{{
        t("TXT_CODE_b76d94e0")
      }}</VBtn>
    </div>
    <VDataTable :headers="headers" :items="javaList ?? []" :items-per-page="15" class="java-table">
      <template #item.fullname="{ item }">{{ (item.raw ?? item).info.fullname }}</template>
      <template #item.installTime="{ item }">{{
        t(parseTimestamp((item.raw ?? item).info.installTime))
      }}</template>
      <template #item.status="{ item }"
        ><VChip
          size="small"
          :color="
            (item.raw ?? item).usingInstances.length
              ? 'success'
              : (item.raw ?? item).info.downloading
              ? 'warning'
              : undefined
          "
          variant="tonal"
          >{{
            (item.raw ?? item).usingInstances.length
              ? t("TXT_CODE_bdb620b9")
              : (item.raw ?? item).info.downloading
              ? t("TXT_CODE_d919f7c7")
              : t("TXT_CODE_15f2e564")
          }}</VChip
        ></template
      >
      <template #item.actions="{ item }">
        <div class="java-row-actions">
          <VBtn
            size="small"
            variant="text"
            :disabled="
              (item.raw ?? item).info.fullname === props.instanceInfo?.config.java.id ||
              (item.raw ?? item).info.downloading
            "
            @click="handleUsingJava((item.raw ?? item).info)"
            >{{
              (item.raw ?? item).info.fullname === props.instanceInfo?.config.java.id
                ? t("TXT_CODE_979520ef")
                : t("TXT_CODE_f0dcc8bf")
            }}</VBtn
          ><VBtn
            size="small"
            color="error"
            variant="text"
            prepend-icon="mdi-delete-outline"
            :disabled="(item.raw ?? item).info.downloading"
            @click="confirmDelete((item.raw ?? item).info)"
            >{{ t("TXT_CODE_ecbd7449") }}</VBtn
          >
        </div>
      </template>
    </VDataTable>
  </AppDialog>
  <AppDialog
    v-model:open="deleteDialogOpen"
    :title="t('TXT_CODE_f4f86ba8')"
    compact
    ok-color="error"
    :ok-text="t('TXT_CODE_ecbd7449')"
    @ok="handleDeleteJava"
    ><div>{{ t("TXT_CODE_35631d1d") }}</div></AppDialog
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
