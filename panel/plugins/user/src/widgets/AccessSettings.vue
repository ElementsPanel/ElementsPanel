<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import type { UserInstance } from "@/types/user";
import { computed, onMounted, ref } from "vue";
import { t } from "@/lang/i18n";
import { useScreen } from "@/hooks/useScreen";
import { useRoute } from "vue-router";
import { userInfoApiAdvanced, updateUserInstance } from "@/services/apis";
import { useSelectInstances } from "@/components/fc";
import { message } from "@/tools/vuetifyToast";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_STATUS } from "@/types/const";
import dayjs from "dayjs";
import WarningDialog from "@/components/fc/WarningDialog.vue";
import { useMountComponent } from "@/hooks/useMountComponent";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDataTable, VDialog, VSpacer } from "vuetify/components";

const props = defineProps<{ uuid?: string }>();
const { isPhone } = useScreen();
const route = useRoute();
interface AccessInstance extends UserInstance {
  remarks?: string;
  endTime?: number | string;
}
const dataSource = ref<AccessInstance[]>([]);
const userUuid = props.uuid ?? String(route.query.uuid ?? "");
const deleteDialog = ref<{ open: boolean; item: UserInstance | null }>({ open: false, item: null });

const refreshTableData = async () => {
  if (userUuid == null) return;
  try {
    const rawUserInfo = (await userInfoApiAdvanced().execute({ params: { uuid: String(userUuid), advanced: true }, forceRequest: true })).value;
    dataSource.value = rawUserInfo?.instances ? [...rawUserInfo.instances] : [];
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

const saveData = async () => {
  try {
    await updateUserInstance().execute({ data: { config: { instances: dataSource.value }, uuid: String(userUuid) } });
    message.success(t("TXT_CODE_d3de39b4"));
    await refreshTableData();
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

const handleDelete = async () => {
  const deletedInstance = deleteDialog.value.item;
  deleteDialog.value.open = false;
  if (!deletedInstance) return;
  dataSource.value = dataSource.value.filter((instance) => !(instance.daemonId === deletedInstance.daemonId && instance.instanceUuid === deletedInstance.instanceUuid));
  await saveData();
};

const assignApp = async () => {
  try {
    const selectedInstances = await useSelectInstances(dataSource.value);
    const warningInstances = (selectedInstances || []).filter((instance) => typeof instance.config?.docker?.image === "string" && !instance.config.docker.image).map((instance) => instance.nickname);
    if (warningInstances.length > 0) {
      const component = (await useMountComponent({ title: t("TXT_CODE_dd78943e"), subTitle: t("TXT_CODE_57e86edb") + warningInstances.join(", "), checkText: t("TXT_CODE_19f697f3") })).load<InstanceType<typeof WarningDialog>>(WarningDialog);
      await component.openDialog();
    }
    if (selectedInstances) {
      dataSource.value = selectedInstances;
      await saveData();
    }
  } catch (err: any) {
    reportErrorMsg(err.message);
  }
};

const headers = computed(() => [
  ...(!isPhone.value ? [{ title: t("TXT_CODE_b26a0528"), key: "remarks" }] : []),
  { title: t("TXT_CODE_f70badb9"), key: "nickname" },
  ...(!isPhone.value ? [{ title: t("TXT_CODE_fa920c0"), key: "endTime" }] : []),
  ...(!isPhone.value ? [{ title: t("TXT_CODE_3d602459"), key: "status" }] : []),
  { title: t("TXT_CODE_fe731dfc"), key: "operation", sortable: false, align: "end" as const }
]);

onMounted(refreshTableData);
</script>

<template>
  <main class="user-access-page">
    <PageToolbar :title="t('TXT_CODE_76d20724')" icon="mdi-account-key-outline">
      <template #actions>
        <VBtn variant="text" prepend-icon="mdi-refresh" @click="refreshTableData">{{ t("TXT_CODE_b76d94e0") }}</VBtn>
        <VBtn color="primary" prepend-icon="mdi-plus" @click="assignApp">{{ t("TXT_CODE_9393b484") }}</VBtn>
      </template>
    </PageToolbar>
    <VCard rounded="xl" flat class="user-access-card">
      <VDataTable :headers="headers" :items="dataSource" item-value="instanceUuid" :items-per-page="-1">
        <template #item.remarks="{ item }">{{ item.hostIp }}<template v-if="item.remarks"> ({{ item.remarks }})</template></template>
        <template #item.endTime="{ item }">{{ Number(item.endTime) === 0 ? t("TXT_CODE_8dfd8b17") : !isNaN(Number(item.endTime)) ? dayjs(Number(item.endTime)).format("YYYY-MM-DD HH:mm:ss") : item.endTime }}</template>
        <template #item.status="{ item }">{{ INSTANCE_STATUS[item.status as keyof typeof INSTANCE_STATUS] || item.status }}</template>
        <template #item.operation="{ item }"><VBtn color="error" variant="tonal" size="small" @click="deleteDialog = { open: true, item }">{{ t("TXT_CODE_ecbd7449") }}</VBtn></template>
      </VDataTable>
    </VCard>
    <VDialog v-model="deleteDialog.open" class="app-dialog" max-width="460" scrollable>
      <VCard rounded="xl"><VCardTitle>{{ t("TXT_CODE_71155575") }}</VCardTitle><VCardText>{{ t("TXT_CODE_71155575") }}</VCardText><VCardActions><VSpacer /><VBtn variant="text" @click="deleteDialog.open = false">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="error" @click="handleDelete">{{ t("TXT_CODE_ecbd7449") }}</VBtn></VCardActions></VCard>
    </VDialog>
  </main>
</template>

<style scoped lang="scss">
.user-access-page { width: 100%; max-width: var(--app-max-width); margin: 0 auto; padding: 16px 24px 32px; box-sizing: border-box; }
.user-access-card { overflow: hidden; }
@media (max-width: 992px) { .user-access-page { padding: 12px 12px 28px; } }
</style>
