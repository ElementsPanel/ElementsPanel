<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import CardPanel from "@elementspanel/epanel-plugin-console/components/CardPanel";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { onMounted } from "vue";
import { userInfoApi } from "@elementspanel/epanel-plugin-console/services/apis";
import { useRouter } from "vue-router";
import { INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@elementspanel/epanel-plugin-console/types/const";
import { parseTimestamp } from "@elementspanel/epanel-plugin-console/tools/time";
import { VBtn, VChip, VDataTable } from "vuetify/components";

withDefaults(
  defineProps<{
    title?: string;
  }>(),
  { title: "" }
);

const router = useRouter();

const { execute, state } = userInfoApi();

const columns = [
  {
    title: t("TXT_CODE_COMMON_INSTANCE_NAME"),
    dataIndex: "nickname",
    key: "nickname"
  },
  {
    title: t("TXT_CODE_COMMON_STATE"),
    dataIndex: "status",
    key: "status",
    customRender: (e: { text: INSTANCE_STATUS_CODE }) => {
      return INSTANCE_STATUS[e.text] || e.text;
    }
  },
  {
    title: t("TXT_CODE_INSTANCE_LAST_START"),
    dataIndex: "lastDatetime",
    key: "lastDatetime",
    customRender: (e: { text: number }) => {
      return parseTimestamp(e.text);
    }
  },
  {
    title: t("TXT_CODE_COMMON_EXPIRE"),
    dataIndex: "endTime",
    key: "endTime",
    customRender: (e: { text: number }) => {
      return parseTimestamp(e.text) || t("TXT_CODE_INSTANCE_EXPIRY_INDEFINITE");
    }
  },
  {
    title: t("TXT_CODE_COMMON_ACTIONS"),
    key: "operate"
  }
];

const getInstanceList = async () => {
  await execute({
    params: {
      advanced: true
    }
  });
};

const operate = (daemonId: string, instanceId: string) => {
  router.push({
    path: "/instances/terminal",
    query: {
      daemonId,
      instanceId
    }
  });
};

onMounted(() => {
  getInstanceList();
});
</script>

<template>
  <CardPanel>
    <template #title>{{ title || t("TXT_CODE_COMMON_INSTANCE_LIST") }}</template>
    <template #body>
      <VDataTable :headers="columns.map((column) => ({ title: column.title, key: column.key, value: column.dataIndex || column.key, sortable: false }))" :items="state?.instances || []" :items-per-page="-1" hide-default-footer density="comfortable">
        <template #no-data><Empty icon="mdi-view-grid-outline" /></template>
        <template #item.status="{ item }"><VChip size="small" variant="tonal" :color="item.status === INSTANCE_STATUS_CODE.RUNNING ? 'success' : item.status === INSTANCE_STATUS_CODE.BUSY ? 'warning' : 'secondary'">{{ INSTANCE_STATUS[item.status as INSTANCE_STATUS_CODE] || item.status }}</VChip></template>
        <template #item.lastDatetime="{ item }">{{ parseTimestamp(item.config?.lastDatetime) }}</template>
        <template #item.endTime="{ item }">{{ parseTimestamp(item.config?.endTime) || t("TXT_CODE_INSTANCE_EXPIRY_INDEFINITE") }}</template>
        <template #item.operate="{ item }"><VBtn variant="tonal" :disabled="item.status === INSTANCE_STATUS_CODE.BUSY" @click="operate(item.daemonId, item.instanceUuid)">{{ t("TXT_CODE_COMMON_ENTER_CONSOLE") }}</VBtn></template>
      </VDataTable>
    </template>
  </CardPanel>
</template>
