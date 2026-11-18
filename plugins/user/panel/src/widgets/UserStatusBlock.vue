<script setup lang="ts">
import CardPanel from "@elementspanel/epanel-plugin-console/components/CardPanel";

import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, onMounted } from "vue";

import { userInfoApi } from "@elementspanel/epanel-plugin-console/services/apis";

const props = defineProps<{
  type: string;
}>();

const { execute, state } = userInfoApi();

const getInstanceList = async () => {
  await execute({
    params: {
      advanced: true
    }
  });
};

const computedStatusList = computed(() => {
  if (!state.value) return [];

  return [
    {
      type: "instance_all",
      title: t("TXT_CODE_COMMON_TOTAL_NUMBER_OF_INSTANCES_ASSIGNED_TO_YOU"),
      value: state.value.instances.length
    },
    {
      type: "instance_running",
      title: t("TXT_CODE_COMMON_INSTANCES_CURRENTLY_RUNNING"),
      value: state.value.instances.filter((e) => e.status == 3).length
    },
    {
      type: "instance_stop",
      title: t("TXT_CODE_COMMON_INSTANCES_CURRENTLY_STOPPED"),
      value: state.value.instances.filter((e) => e.status == 0).length
    },
    {
      type: "instance_error",
      title: t("TXT_CODE_COMMON_TEMPORARILY_UNAVAILABLE_INSTANCES"),
      value: state.value.instances.filter((e) => e.status == -1 || e.status == 1 || e.status == 2)
        .length
    }
  ];
});

const realStatus = computed(() => computedStatusList.value.find((v) => v.type === props.type));
onMounted(() => {
  getInstanceList();
});
</script>

<template>
  <CardPanel class="StatusBlock">
    <template #title>{{ realStatus?.title }}</template>
    <template #body>
      <div class="value">{{ realStatus?.value }}</div>
    </template>
  </CardPanel>
</template>

<style lang="scss" scoped>
.StatusBlock {
  .value {
    font-weight: 800;
    font-size: var(--font-h1);
    margin-top: 4px;
  }
}
</style>
