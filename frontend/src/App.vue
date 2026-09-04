<script setup lang="ts">
import type { FrontendConsoleService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { computed } from "vue";

// The core app is only a host. The complete shell is supplied by the
// `console` plugin after the frontend plugin set has been installed.
const consolePlugin = computed(() => usePluginService<FrontendConsoleService>("console"));
</script>

<template>
  <component v-if="consolePlugin?.root" :is="consolePlugin.root" />
</template>
