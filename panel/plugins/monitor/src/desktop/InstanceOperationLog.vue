<script setup lang="ts">
import { getInstanceOperationLog } from "../api";
import { formatOperationLogItem, type FormattedOperationLog } from "../hooks/useOperationLog";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";
import InstanceOperationLogContent from "../normal/InstanceOperationLogContent.vue";

const props = defineProps<{
  instanceUuid: string;
  daemonId: string;
}>();

const loading = ref(false);
const logs = ref<FormattedOperationLog[]>([]);

const fetchLogs = async () => {
  loading.value = true;
  try {
    const { execute } = getInstanceOperationLog();
    const data = await execute({
      params: {
        daemonId: props.daemonId,
        instanceId: props.instanceUuid,
        limit: 100
      }
    });
    logs.value = (data.value || []).reverse().map(formatOperationLogItem);
  } catch (error: any) {
    message.error(error?.message || t("TXT_CODE_4a689666"));
    logs.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(fetchLogs);
</script>

<template>
  <InstanceOperationLogContent :loading="loading" :logs="logs" desktop />
</template>
