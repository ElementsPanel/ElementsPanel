<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computeNodeName } from "@elementspanel/epanel-plugin-console/tools/nodes";
import { computed } from "vue";
import { VBtn, VDivider, VIcon, VList, VListItem, VMenu } from "vuetify/components";
import type { NodeSummary } from "./api";

const props = defineProps<{
  modelValue?: string;
  nodes: NodeSummary[];
  loading?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [daemonId: string]; open: [] }>();
const targetLabel = computed(() => {
  if (props.modelValue === undefined) return t("TXT_CODE_PLUGIN_NODE_SELECT");
  if (!props.modelValue) return t("TXT_CODE_PLUGIN_CURRENT_PANEL");
  const node = props.nodes.find((item) => item.uuid === props.modelValue);
  return node ? computeNodeName(node.ip, node.available, node.remarks) : props.modelValue;
});

function onMenuChange(open: boolean) {
  if (open) emit("open");
}
</script>

<template>
  <VMenu location="bottom end" @update:model-value="onMenuChange">
    <template #activator="{ props: menuProps }">
      <VBtn
        v-bind="menuProps"
        class="plugin-config-target-selector"
        variant="tonal"
        prepend-icon="mdi-server-outline"
        :loading="loading"
        :aria-label="t('TXT_CODE_PLUGIN_NODE_SELECT')"
      >
        <span class="plugin-config-target-name">{{ targetLabel }}</span>
        <VIcon icon="mdi-chevron-down" end />
      </VBtn>
    </template>
    <VList density="comfortable">
      <VListItem
        :active="modelValue === ''"
        :title="t('TXT_CODE_PLUGIN_CURRENT_PANEL')"
        prepend-icon="mdi-monitor-dashboard"
        @click="emit('update:modelValue', '')"
      />
      <VDivider v-if="nodes.length" />
      <VListItem
        v-for="node in nodes"
        :key="node.uuid"
        :active="modelValue === node.uuid"
        :disabled="!node.available"
        :title="computeNodeName(node.ip, node.available, node.remarks)"
        :prepend-icon="node.available ? 'mdi-database-outline' : 'mdi-server-off-outline'"
        @click="emit('update:modelValue', node.uuid)"
      />
    </VList>
  </VMenu>
</template>

<style lang="scss" scoped>
.plugin-config-target-selector {
  flex-shrink: 0;
  max-width: 100%;
  min-width: 0;
}

.plugin-config-target-selector :deep(.v-btn__content) {
  min-width: 0;
}

.plugin-config-target-name {
  min-width: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 992px) {
  .plugin-config-target-name {
    max-width: 100px;
  }
}
</style>
