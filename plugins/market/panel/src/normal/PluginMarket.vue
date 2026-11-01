<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import PluginMarketList from "../components/PluginMarketList.vue";

const route = useRoute();
// Keep target changes inside this page; route navigation remounts the shell's view.
const daemonId = ref(typeof route.query.daemonId === "string" ? route.query.daemonId : "");
</script>

<template>
  <PluginMarketList :daemon-id="daemonId" @target-change="daemonId = $event" />
</template>
