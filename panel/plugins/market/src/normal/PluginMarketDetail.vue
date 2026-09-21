<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PluginMarketDetail from "../components/PluginMarketDetail.vue";

const route = useRoute();
const router = useRouter();
const pluginId = computed(() => String(route.params.pluginId ?? ""));
const version = computed(() =>
  typeof route.query.version === "string" ? route.query.version : undefined
);

function selectVersion(version: string) {
  void router.replace({ query: { ...route.query, version } });
}
</script>

<template>
  <PluginMarketDetail
    :plugin-id="pluginId"
    :version="version"
    @back="router.push('/market/plugins')"
    @select-version="selectVersion"
  />
</template>
