<script setup lang="ts">
import { useAppRouters } from "@/hooks/useAppRouters";

const props = defineProps<{
  instanceUuid: string;
  daemonId: string;
}>();

const { toPage } = useAppRouters();

const open = () => {
  void toPage({
    path: "/instances/terminal/files",
    query: {
      instanceId: props.instanceUuid,
      daemonId: props.daemonId
    }
  });
};

defineExpose({ open });
</script>

<template>
  <span v-if="false" />
</template>
