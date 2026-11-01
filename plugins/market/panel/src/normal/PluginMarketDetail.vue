<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PluginMarketDetail from "../components/PluginMarketDetail.vue";

const route = useRoute();
const router = useRouter();
const pluginId = computed(() => String(route.params.pluginId ?? ""));
const daemonId = computed(() =>
  typeof route.query.daemonId === "string" ? route.query.daemonId : ""
);
</script>

<template>
  <PluginMarketDetail
    :plugin-id="pluginId"
    :daemon-id="daemonId"
    @back="router.push({ path: '/market/plugins', query: { daemonId } })"
  />
</template>
