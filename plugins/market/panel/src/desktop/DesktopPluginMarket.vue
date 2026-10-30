<script setup lang="ts">
import { ref } from "vue";
import PluginMarketDetail from "../components/PluginMarketDetail.vue";
import PluginMarketList from "../components/PluginMarketList.vue";

const pluginList = ref<InstanceType<typeof PluginMarketList>>();
const selectedPluginId = ref("");

function openPlugin(pluginId: string) {
  selectedPluginId.value = pluginId;
}

function backToList() {
  selectedPluginId.value = "";
}

function updateInstalled(pluginId: string, version: string | undefined) {
  pluginList.value?.updateInstalled(pluginId, version);
}
</script>

<template>
  <div class="desktop-plugin-market">
    <PluginMarketList v-show="!selectedPluginId" ref="pluginList" embedded @select="openPlugin" />
    <PluginMarketDetail
      v-if="selectedPluginId"
      :plugin-id="selectedPluginId"
      embedded
      @back="backToList"
      @installed="updateInstalled"
    />
  </div>
</template>

<style lang="scss" scoped>
.desktop-plugin-market {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--desktop-window-text);
}
</style>
