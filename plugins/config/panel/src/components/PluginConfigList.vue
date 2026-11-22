<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VBtn, VList, VListItem, VListSubheader } from "vuetify/components";
import { pluginLabel } from "../labels";
import type { PluginRecord, NodePluginRecord } from "../api";
import type { PluginGroupView } from "../types";

defineProps<{
  groups: PluginGroupView[];
  currentId: string;
  remarks: Map<string, string>;
  draggedPluginId: string;
  dragOverGroupId: string;
  empty: boolean;
  warning: (plugin: PluginRecord | NodePluginRecord) => boolean;
}>();
const emit = defineEmits<{
  select: [pluginId: string, event: MouseEvent | KeyboardEvent];
  contextmenu: [pluginId: string, event: MouseEvent];
  pointerdown: [pluginId: string, event: PointerEvent];
  rename: [group: PluginGroupView];
  remove: [group: PluginGroupView];
}>();
</script>

<template>
  <VList class="plugin-config-list" data-app-surface="transparent" density="compact">
    <div
      v-for="group in groups"
      :key="group.id"
      class="plugin-config-group"
      :data-plugin-group-id="group.id"
      :class="{ 'plugin-config-group-over': dragOverGroupId === group.id }"
    >
      <VListSubheader class="plugin-config-group-heading">
        <span>{{ group.name }}</span>
        <span v-if="!group.unassigned" class="plugin-config-group-actions">
          <VBtn
            icon="mdi-pencil-outline"
            size="x-small"
            variant="text"
            :aria-label="t('TXT_CODE_PLUGIN_GROUP_RENAME')"
            @click.stop="emit('rename', group)"
          />
          <VBtn
            icon="mdi-delete-outline"
            size="x-small"
            variant="text"
            :aria-label="t('TXT_CODE_PLUGIN_GROUP_DELETE')"
            @click.stop="emit('remove', group)"
          />
        </span>
      </VListSubheader>
      <VListItem
        v-for="plugin in group.plugins"
        :key="plugin.id"
        class="plugin-config-item"
        draggable="false"
        :active="plugin.id === currentId"
        :class="{
          'plugin-config-item-off': !plugin.enabled,
          'plugin-config-item-dragging': draggedPluginId === plugin.id
        }"
        :title="pluginLabel(plugin.id)"
        :subtitle="remarks.get(plugin.id)"
        @click="emit('select', plugin.id, $event)"
        @contextmenu="emit('contextmenu', plugin.id, $event)"
        @pointerdown="emit('pointerdown', plugin.id, $event)"
        @dragstart.prevent
      >
        <template #append>
          <span
            class="plugin-config-item-dot"
            :class="{
              'plugin-config-item-dot-off':
                !plugin.enabled || (!warning(plugin) && plugin.state && plugin.state !== 'active'),
              'plugin-config-item-dot-warning': warning(plugin)
            }"
          ></span>
        </template>
      </VListItem>
    </div>
    <Empty v-if="empty" icon="mdi-puzzle-outline" compact />
  </VList>
</template>

<style lang="scss" scoped>
.plugin-config-list {
  min-height: 0;
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: auto;
  padding: 0 10px 4px;
}

.plugin-config-list :deep(.v-list-item) {
  --v-activated-opacity: 0;

  min-height: 36px;
  margin: 0 0 6px;
  padding-top: 2px;
  padding-bottom: 2px;
  overflow: hidden;
  border-radius: 24px !important;
  color: var(--text-color);
}

.plugin-config-list :deep(.plugin-config-group-heading) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding-inline: 8px;
  background: transparent;
  color: var(--text-color);
  font-size: 11px;
  font-weight: 600;
  opacity: 0.55;
}

.plugin-config-group {
  border-radius: 8px;
}

.plugin-config-group-over {
  background: rgba(var(--v-theme-primary), 0.12);
}

.plugin-config-group-over :deep(.plugin-config-group-heading) {
  opacity: 1;
}

.plugin-config-group-actions {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.plugin-config-list :deep(.plugin-config-group-heading:hover .plugin-config-group-actions),
.plugin-config-list :deep(.plugin-config-group-heading:focus-within .plugin-config-group-actions) {
  opacity: 1;
  pointer-events: auto;
}

.plugin-config-group-actions :deep(.v-btn) {
  --v-btn-height: 16px;

  width: 16px;
  min-width: 16px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  opacity: 0.62;
}

.plugin-config-group-actions :deep(.v-icon) {
  font-size: 12px;
}

.plugin-config-group-actions :deep(.v-btn:hover) {
  opacity: 1;
}

.plugin-config-list :deep(.plugin-config-item) {
  cursor: grab;
  user-select: none;
}

.plugin-config-list :deep(.plugin-config-item-dragging) {
  cursor: grabbing;
}

.plugin-config-list :deep(.v-list-item__content) {
  min-width: 0;
  overflow: hidden;
}

.plugin-config-list :deep(.v-list-item-title),
.plugin-config-list :deep(.v-list-item-subtitle) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-config-list :deep(.v-list-item--active) {
  background: rgba(22, 119, 255, 0.12);
}

.plugin-config-list :deep(.v-list-item__overlay),
.plugin-config-list :deep(.v-list-item__underlay) {
  border-radius: inherit;
}

.plugin-config-list :deep(.plugin-config-item-off .v-list-item-title) {
  opacity: 0.42;
}

.plugin-config-item-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
}

.plugin-config-item-dot-off {
  background: var(--color-gray-6);
}

.plugin-config-item-dot-warning {
  background: var(--color-yellow-6);
}
</style>
