<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import { onMounted } from "vue";
import { userInfoApi } from "@/services/apis/index";
import { useRouter } from "vue-router";
import { INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@/types/const";
import { parseTimestamp } from "@/tools/time";
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
    title: t("TXT_CODE_f70badb9"),
    dataIndex: "nickname",
    key: "nickname"
  },
  {
    title: t("TXT_CODE_5476e012"),
    dataIndex: "status",
    key: "status",
    customRender: (e: { text: INSTANCE_STATUS_CODE }) => {
      return INSTANCE_STATUS[e.text] || e.text;
    }
  },
  {
    title: t("TXT_CODE_5ab2062d"),
    dataIndex: "lastDatetime",
    key: "lastDatetime",
    customRender: (e: { text: number }) => {
      return parseTimestamp(e.text);
    }
  },
  {
    title: t("TXT_CODE_fa920c0"),
    dataIndex: "endTime",
    key: "endTime",
    customRender: (e: { text: number }) => {
      return parseTimestamp(e.text) || t("TXT_CODE_abc080d");
    }
  },
  {
    title: t("TXT_CODE_fe731dfc"),
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
    <template #title>{{ title || t("TXT_CODE_d655beec") }}</template>
    <template #body>
      <VDataTable :headers="columns.map((column) => ({ title: column.title, key: column.key, value: column.dataIndex || column.key, sortable: false }))" :items="state?.instances || []" :items-per-page="-1" hide-default-footer density="comfortable">
        <template #item.status="{ item }"><VChip size="small" variant="tonal" :color="item.status === INSTANCE_STATUS_CODE.RUNNING ? 'success' : item.status === INSTANCE_STATUS_CODE.BUSY ? 'warning' : 'secondary'">{{ INSTANCE_STATUS[item.status as INSTANCE_STATUS_CODE] || item.status }}</VChip></template>
        <template #item.lastDatetime="{ item }">{{ parseTimestamp(item.config?.lastDatetime) }}</template>
        <template #item.endTime="{ item }">{{ parseTimestamp(item.config?.endTime) || t("TXT_CODE_abc080d") }}</template>
        <template #item.operate="{ item }"><VBtn variant="tonal" :disabled="item.status === INSTANCE_STATUS_CODE.BUSY" @click="operate(item.daemonId, item.instanceUuid)">{{ t("TXT_CODE_aa43b248") }}</VBtn></template>
      </VDataTable>
    </template>
  </CardPanel>
</template>
