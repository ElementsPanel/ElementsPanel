<script setup lang="ts">
import { openInstanceLog } from "../instanceLog";

const props = defineProps<{
  instanceUuid: string;
  daemonId: string;
  instanceInfo?: { config?: { nickname?: string } };
}>();

const open = () => {
  openInstanceLog({
    mode: "normal",
    instanceId: props.instanceUuid,
    daemonId: props.daemonId,
    instanceName: props.instanceInfo?.config?.nickname
  });
};

defineExpose({ open });
</script>

<template>
  <span v-if="false" />
</template>
