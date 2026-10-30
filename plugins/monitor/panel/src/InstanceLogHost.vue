<script setup lang="ts">
import { computed } from "vue";
import InstanceOperationLog from "./normal/InstanceOperationLog.vue";
import { closeInstanceLog, useActiveInstanceLog } from "./instanceLog";

const request = computed(() => useActiveInstanceLog().value);
</script>

<template>
  <InstanceOperationLog
    v-if="request"
    :key="request.key"
    :mode="request.mode"
    :instance-id="request.instanceId"
    :daemon-id="request.daemonId"
    :instance-name="request.instanceName"
    @close="closeInstanceLog"
  />
</template>
