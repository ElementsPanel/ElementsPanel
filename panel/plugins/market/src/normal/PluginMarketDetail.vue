<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PluginMarketDetail from "../components/PluginMarketDetail.vue";

const route = useRoute();
const router = useRouter();
const pluginId = computed(() => String(route.params.pluginId ?? ""));
</script>

<template>
  <PluginMarketDetail :plugin-id="pluginId" @back="router.push('/market/plugins')" />
</template>
