<script setup lang="ts">
import { computed } from "vue";
import { usePluginService, type FrontendDesktopService } from "@/plugin/context";

defineOptions({ inheritAttrs: false });
const shell = computed(() => usePluginService<FrontendDesktopService>("desktop")?.window);
</script>

<template>
  <component :is="shell" v-if="shell" v-bind="$attrs"><slot /></component>
</template>
