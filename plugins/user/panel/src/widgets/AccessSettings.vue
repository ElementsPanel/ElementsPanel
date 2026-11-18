<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import type { UserInstance } from "@elementspanel/epanel-plugin-console/types/user";
import { computed, onMounted, ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { useRoute } from "vue-router";
import { userInfoApiAdvanced, updateUserInstance } from "@elementspanel/epanel-plugin-console/services/apis";
import { useSelectInstances } from "@elementspanel/epanel-plugin-console/components/fc";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { INSTANCE_STATUS } from "@elementspanel/epanel-plugin-console/types/const";
import dayjs from "dayjs";
import WarningDialog from "@elementspanel/epanel-plugin-console/components/fc/WarningDialog";
import { useMountComponent } from "@elementspanel/epanel-plugin-console/hooks/useMountComponent";
import { VBtn, VCard, VCardActions, VCardText, VDataTable, VDialog, VSpacer } from "vuetify/components";

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
    message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
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
      const component = (await useMountComponent({ title: t("TXT_CODE_COMMON_SAFETY_WARNING"), subTitle: t("TXT_CODE_USER_UNPROTECTED_INSTANCES_WARNING") + warningInstances.join(", "), checkText: t("TXT_CODE_COMMON_I_M_AWARE_THAT_MALICIOUS_PROGRAMS_AND_OR_PERSONELL_CAN_GAIN_ACCESS_TO_MY_MACHINE_AS") })).load<InstanceType<typeof WarningDialog>>(WarningDialog);
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
  ...(!isPhone.value ? [{ title: t("TXT_CODE_COMMON_HOST_DAEMON"), key: "remarks" }] : []),
  { title: t("TXT_CODE_COMMON_INSTANCE_NAME"), key: "nickname" },
  ...(!isPhone.value ? [{ title: t("TXT_CODE_COMMON_EXPIRE"), key: "endTime" }] : []),
  ...(!isPhone.value ? [{ title: t("TXT_CODE_COMMON_INSTANCES_STATUS"), key: "status" }] : []),
  { title: t("TXT_CODE_COMMON_ACTIONS"), key: "operation", sortable: false, align: "end" as const }
]);

onMounted(refreshTableData);
</script>

<template>
  <main class="user-access-page">
    <PageToolbar :title="t('TXT_CODE_COMMON_ASSIGNED_INSTANCES')" icon="mdi-account-key-outline">
      <template #actions>
        <VBtn variant="text" prepend-icon="mdi-refresh" @click="refreshTableData">{{ t("TXT_CODE_COMMON_REFRESH") }}</VBtn>
        <VBtn color="primary" prepend-icon="mdi-plus" @click="assignApp">{{ t("TXT_CODE_COMMON_ASSIGN") }}</VBtn>
      </template>
    </PageToolbar>
    <VCard rounded="xl" flat>
      <VDataTable :headers="headers" :items="dataSource" item-value="instanceUuid" :items-per-page="-1">
        <template #no-data><Empty icon="mdi-view-grid-outline" compact /></template>
        <template #item.remarks="{ item }">{{ item.hostIp }}<template v-if="item.remarks"> ({{ item.remarks }})</template></template>
        <template #item.endTime="{ item }">{{ Number(item.endTime) === 0 ? t("TXT_CODE_USER_ACCESS_INDEFINITE") : !isNaN(Number(item.endTime)) ? dayjs(Number(item.endTime)).format("YYYY-MM-DD HH:mm:ss") : item.endTime }}</template>
        <template #item.status="{ item }">{{ INSTANCE_STATUS[item.status as keyof typeof INSTANCE_STATUS] || item.status }}</template>
        <template #item.operation="{ item }"><VBtn color="error" variant="tonal" size="small" @click="deleteDialog = { open: true, item }">{{ t("TXT_CODE_USER_UNASSIGN_INSTANCE") }}</VBtn></template>
      </VDataTable>
    </VCard>
    <VDialog v-model="deleteDialog.open" class="app-dialog" max-width="460" scrollable>
      <VCard :title="t('TXT_CODE_USER_UNASSIGN_INSTANCE')" rounded="xl">
        <VCardText>{{ t("TXT_CODE_USER_UNASSIGN_INSTANCE_DESC", { name: deleteDialog.item?.nickname || deleteDialog.item?.instanceUuid || "" }) }}</VCardText>
        <VCardActions><VSpacer /><VBtn variant="text" @click="deleteDialog.open = false">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn><VBtn color="error" @click="handleDelete">{{ t("TXT_CODE_USER_UNASSIGN_INSTANCE") }}</VBtn></VCardActions>
      </VCard>
    </VDialog>
  </main>
</template>

<style scoped lang="scss">
.user-access-page { width: 100%; max-width: var(--app-max-width); margin: 0 auto; padding: 20px 24px 32px; box-sizing: border-box; }
@media (max-width: 992px) { .user-access-page { padding: 16px 12px 28px; } }
</style>
