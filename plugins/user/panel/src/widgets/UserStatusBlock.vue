<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";

import { t } from "@/lang/i18n";
import { computed, onMounted } from "vue";

import { userInfoApi } from "@/services/apis/index";

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
      title: t("TXT_CODE_53745cc0"),
      value: state.value.instances.length
    },
    {
      type: "instance_running",
      title: t("TXT_CODE_7638590c"),
      value: state.value.instances.filter((e) => e.status == 3).length
    },
    {
      type: "instance_stop",
      title: t("TXT_CODE_9bc7f49e"),
      value: state.value.instances.filter((e) => e.status == 0).length
    },
    {
      type: "instance_error",
      title: t("TXT_CODE_ecf17071"),
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
  <CardPanel class="StatusBlock" style="height: 100%">
    <template #title>{{ realStatus?.title }}</template>
    <template #body>
      <span class="color-info">
        {{ realStatus?.title }}
      </span>
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
