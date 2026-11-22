<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { computed } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { useRoute } from "vue-router";
import { INSTANCE_STATUS } from "@elementspanel/epanel-plugin-console/types/const";
import dayjs from "dayjs";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VDataTable,
  VDialog,
  VSpacer
} from "vuetify/components";
import { useUserAccess } from "../hooks/useUserAccess";

const props = defineProps<{ uuid?: string }>();
const { isPhone } = useScreen();
const route = useRoute();
const userUuid = props.uuid ?? String(route.query.uuid ?? "");
const { dataSource, deleteDialog, refreshTableData, handleDelete, assignApp } = useUserAccess({
  userUuid
});
const headers = computed(() => [
  ...(!isPhone.value ? [{ title: t("TXT_CODE_COMMON_HOST_DAEMON"), key: "remarks" }] : []),
  { title: t("TXT_CODE_COMMON_INSTANCE_NAME"), key: "nickname" },
  ...(!isPhone.value ? [{ title: t("TXT_CODE_COMMON_EXPIRE"), key: "endTime" }] : []),
  ...(!isPhone.value ? [{ title: t("TXT_CODE_COMMON_INSTANCES_STATUS"), key: "status" }] : []),
  { title: t("TXT_CODE_COMMON_ACTIONS"), key: "operation", sortable: false, align: "end" as const }
]);
</script>

<template>
  <main class="user-access-page">
    <PageToolbar :title="t('TXT_CODE_COMMON_ASSIGNED_INSTANCES')" icon="mdi-account-key-outline">
      <template #actions>
        <VBtn variant="text" prepend-icon="mdi-refresh" @click="refreshTableData">{{
          t("TXT_CODE_COMMON_REFRESH")
        }}</VBtn>
        <VBtn color="primary" prepend-icon="mdi-plus" @click="assignApp">{{
          t("TXT_CODE_COMMON_ASSIGN")
        }}</VBtn>
      </template>
    </PageToolbar>
    <VCard rounded="xl" flat>
      <VDataTable
        :headers="headers"
        :items="dataSource"
        item-value="instanceUuid"
        :items-per-page="-1"
      >
        <template #no-data><Empty icon="mdi-view-grid-outline" compact /></template>
        <template #item.remarks="{ item }"
          >{{ item.hostIp }}<template v-if="item.remarks"> ({{ item.remarks }})</template></template
        >
        <template #item.endTime="{ item }">{{
          Number(item.endTime) === 0
            ? t("TXT_CODE_USER_ACCESS_INDEFINITE")
            : !isNaN(Number(item.endTime))
            ? dayjs(Number(item.endTime)).format("YYYY-MM-DD HH:mm:ss")
            : item.endTime
        }}</template>
        <template #item.status="{ item }">{{
          INSTANCE_STATUS[item.status as keyof typeof INSTANCE_STATUS] || item.status
        }}</template>
        <template #item.operation="{ item }"
          ><VBtn
            color="error"
            variant="tonal"
            size="small"
            @click="deleteDialog = { open: true, item }"
            >{{ t("TXT_CODE_USER_UNASSIGN_INSTANCE") }}</VBtn
          ></template
        >
      </VDataTable>
    </VCard>
    <VDialog v-model="deleteDialog.open" class="app-dialog" max-width="460" scrollable>
      <VCard :title="t('TXT_CODE_USER_UNASSIGN_INSTANCE')" rounded="xl">
        <VCardText>{{
          t("TXT_CODE_USER_UNASSIGN_INSTANCE_DESC", {
            name: deleteDialog.item?.nickname || deleteDialog.item?.instanceUuid || ""
          })
        }}</VCardText>
        <VCardActions
          ><VSpacer /><VBtn variant="text" @click="deleteDialog.open = false">{{
            t("TXT_CODE_COMMON_CANCEL")
          }}</VBtn
          ><VBtn color="error" @click="handleDelete">{{
            t("TXT_CODE_USER_UNASSIGN_INSTANCE")
          }}</VBtn></VCardActions
        >
      </VCard>
    </VDialog>
  </main>
</template>

<style scoped lang="scss">
.user-access-page {
  width: 100%;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
  box-sizing: border-box;
}
@media (max-width: 992px) {
  .user-access-page {
    padding: 16px 12px 28px;
  }
}
</style>
