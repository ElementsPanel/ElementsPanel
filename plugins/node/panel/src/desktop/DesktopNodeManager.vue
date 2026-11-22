<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import DesktopDialog from "@elementspanel/epanel-plugin-console/components/DesktopDialog";
import { usePluginService, type FrontendDesktopService } from "@elements-panel/sdk";
import { SocketStatus } from "@elementspanel/epanel-plugin-console/hooks/useSocketIo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { NodeStatus } from "@elementspanel/epanel-plugin-console/types";
import { computed } from "vue";
import { VBtn, VDataTable, VIcon, VTextField, VTooltip } from "vuetify/components";
import { useNodeList } from "../hooks/useNodeList";
import { useDesktopNodeEditor } from "../hooks/useDesktopNodeEditor";

const desktop = computed(() => usePluginService<FrontendDesktopService>("desktop"));
const ConfirmDialog = computed(() => desktop.value?.confirmation);
const pluginConfigAvailable = computed(
  () =>
    desktop.value?.views.some(
      (view) => view.id === "node-plugin-config" && (!view.condition || view.condition())
    )
);

const openPluginConfig = (node: NodeStatus) => {
  desktop.value?.open({
    id: `node-plugin-config-${node.uuid}`,
    view: "node-plugin-config",
    title: `${t("TXT_CODE_PLUGIN_CONFIG")} - ${node.remarks || `${node.ip}:${node.port}`}`,
    props: { scope: "node", daemonId: node.uuid }
  });
};

const PlusOutlined = "mdi-plus";
const EditOutlined = "mdi-pencil-outline";

const nodeHeaders = [
  { title: t("TXT_CODE_COMMON_STATUS"), key: "status", sortable: false },
  { title: t("TXT_CODE_DESKTOP_NODES_SOCKET"), key: "socket", sortable: false },
  { title: t("TXT_CODE_NODE_COMPAT"), key: "compatibility", sortable: false },
  { title: t("TXT_CODE_COMMON_REMARKS"), key: "name", sortable: false },
  { title: t("TXT_CODE_DESKTOP_NODES_IP"), key: "ip" },
  { title: t("TXT_CODE_COMMON_PORT"), key: "port" },
  { title: t("TXT_CODE_NODE_CONNECTION_PATH_PREFIX"), key: "prefix" },
  { title: t("TXT_CODE_OPERATE"), key: "actions", sortable: false }
];

const { loading, nodes, searchQuery, nodeCompatMap, socketStatusMap, fetchNodes, filteredNodes } =
  useNodeList();
const {
  showDialog,
  dialogMode,
  form,
  formError,
  saving,
  showDeleteConfirm,
  deletingNode,
  openAddDialog,
  openEditDialog,
  closeDialog,
  saveNode,
  confirmDelete,
  executeDelete,
  cancelDelete,
  reconnectNode
} = useDesktopNodeEditor({ fetchNodes });
</script>

<template>
  <div class="desktop-nodes">
    <div class="dn-toolbar">
      <div class="dn-search">
        <VTextField
          v-model="searchQuery"
          class="dn-search__input"
          :label="t('TXT_CODE_DESKTOP_NODES_SEARCH')"
          prepend-inner-icon="mdi-magnify"
          density="comfortable"
          hide-details
          clearable
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <VBtn class="dn-btn dn-btn--primary" variant="text" @click="openAddDialog">
        <VIcon icon="mdi-plus" />
        {{ t("TXT_CODE_DESKTOP_NODES_ADD") }}
      </VBtn>
    </div>

    <VDataTable
      class="dn-table"
      :headers="nodeHeaders"
      :items="filteredNodes"
      :loading="loading"
      item-value="uuid"
      density="comfortable"
    >
      <template #item.status="{ item }"
        ><VIcon
          :icon="item.available ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'"
          :class="item.available ? 'dn-badge-icon--yes' : 'dn-badge-icon--no'"
      /></template>
      <template #item.socket="{ item }"
        ><VIcon
          v-if="socketStatusMap[item.uuid] === SocketStatus.Connected"
          icon="mdi-check-circle-outline"
          class="dn-badge-icon--yes"
        /><VTooltip
          v-else-if="socketStatusMap[item.uuid] === SocketStatus.Error"
          :text="t('TXT_CODE_COMMON_THE_WEB_FRONT_END_CANNOT_ESTABLISH_A_WEB_SOCKET_CONNECTION_WITH_THE_NODE_PLEASE_CHECK_THE')"
          ><template #activator="{ props: tooltipProps }"
            ><span v-bind="tooltipProps" class="dn-badge-icon--no"
              ><VIcon icon="mdi-information-outline" /></span></template></VTooltip
        ><span v-else>--</span></template
      >
      <template #item.compatibility="{ item }"
        ><VTooltip
          v-if="nodeCompatMap[item.uuid]?.version.brandMismatch"
          :text="t('TXT_CODE_NODE_BRAND_ERR')"
          ><template #activator="{ props: tooltipProps }"
            ><span v-bind="tooltipProps" class="dn-badge-icon--no"
              ><VIcon icon="mdi-alert-circle-outline" /></span></template></VTooltip
        ><VIcon
          v-else-if="item.available && nodeCompatMap[item.uuid]?.ok"
          icon="mdi-check-circle-outline"
          class="dn-badge-icon--yes"
        /><VTooltip
          v-else-if="item.available && nodeCompatMap[item.uuid]"
          :text="t('TXT_CODE_COMMON_THE_NODE_S_PLUGINS_OR_VERSION_DO_NOT_MATCH_THE_PANEL_WHICH_MAY_CAUSE_FUNCTIONAL_ISSUES')"
          ><template #activator="{ props: tooltipProps }"
            ><span v-bind="tooltipProps" class="dn-badge-icon--warn"
              ><VIcon icon="mdi-alert-circle-outline" /></span></template></VTooltip
        ><span v-else>--</span></template
      >
      <template #item.name="{ item }"
        ><div class="dn-node-name">
          <VIcon icon="mdi-server-network" class="dn-node-name__icon" /><span>{{
            item.remarks || item.ip
          }}</span>
        </div></template
      >
      <template #item.actions="{ item }"
        ><div class="dn-action-btns">
          <VBtn
            icon
            variant="text"
            class="dn-action-btn"
            :title="t('TXT_CODE_COMMON_RECONNECT')"
            @click="reconnectNode(item)"
            ><VIcon icon="mdi-refresh" /></VBtn
          ><VBtn
            icon
            variant="text"
            class="dn-action-btn"
            :title="t('TXT_CODE_DESKTOP_NODES_EDIT')"
            @click="openEditDialog(item)"
            ><VIcon icon="mdi-pencil-outline" /></VBtn
          ><VBtn
            v-if="pluginConfigAvailable"
            icon
            variant="text"
            class="dn-action-btn"
            :title="t('TXT_CODE_PLUGIN_CONFIG')"
            @click="openPluginConfig(item)"
            ><VIcon icon="mdi-cog-outline" /></VBtn
          ><VBtn
            icon
            variant="text"
            color="error"
            class="dn-action-btn"
            :title="t('TXT_CODE_COMMON_REMOVE_DAEMON')"
            @click="confirmDelete(item)"
            ><VIcon icon="mdi-delete-outline"
          /></VBtn></div
      ></template>
      <template #no-data>
        <Empty
          icon="mdi-server-network-outline"
          :title="t('TXT_CODE_NODE_LIST_EMPTY')"
          :description="t('TXT_CODE_NO_DATA')"
        />
      </template>
    </VDataTable>

    <DesktopDialog
      id="node-edit-dialog"
      :title="dialogMode === 'add' ? t('TXT_CODE_DESKTOP_NODES_ADD') : t('TXT_CODE_DESKTOP_NODES_EDIT')"
      :icon="dialogMode === 'add' ? PlusOutlined : EditOutlined"
      :model-value="showDialog"
      :width="420"
      :height="485"
      :z-index="10001"
      @close="closeDialog"
    >
      <div class="dn-form-group">
        <label class="dn-form-label">
          {{ t("TXT_CODE_COMMON_REMARKS") }}
        </label>
        <VTextField
          v-model="form.remarks"
          class="dn-form-input"
          density="compact"
          hide-details
          :placeholder="t('TXT_CODE_COMMON_REMARKS')"
        />
      </div>
      <div class="dn-form-group">
        <label class="dn-form-label">
          {{ t("TXT_CODE_DESKTOP_NODES_IP") }}
        </label>
        <VTextField
          v-model="form.ip"
          class="dn-form-input"
          density="compact"
          hide-details
          :placeholder="t('TXT_CODE_DESKTOP_NODES_IP')"
        />
      </div>
      <div class="dn-form-group">
        <label class="dn-form-label">
          {{ t("TXT_CODE_COMMON_PORT") }}
        </label>
        <VTextField
          v-model="form.port"
          type="number"
          class="dn-form-input"
          density="compact"
          hide-details
          :placeholder="t('TXT_CODE_COMMON_PORT')"
        />
      </div>
      <div class="dn-form-group">
        <label class="dn-form-label">
          {{ t("TXT_CODE_DESKTOP_NODES_APIKEY") }}
        </label>
        <VTextField
          v-model="form.apiKey"
          type="password"
          class="dn-form-input"
          density="compact"
          hide-details
          autocomplete="new-password"
          :placeholder="
            dialogMode === 'edit' ? t('TXT_CODE_DESKTOP_NODES_APIKEY_HELP') : ''
          "
        />
        <span v-if="dialogMode === 'edit'" class="dn-form-hint">
          {{ t("TXT_CODE_DESKTOP_NODES_APIKEY_HELP") }}
        </span>
      </div>
      <div class="dn-form-group">
        <label class="dn-form-label">
          {{ t("TXT_CODE_NODE_CONNECTION_PATH_PREFIX") }}
        </label>
        <VTextField
          v-model="form.prefix"
          class="dn-form-input"
          density="compact"
          hide-details
          :placeholder="t('TXT_CODE_NODE_CONNECTION_PATH_PREFIX')"
        />
        <span class="dn-form-hint">
          {{ t("TXT_CODE_COMMON_USED_WHEN_REUSING_PORTS_IN_MOST_CASES_NO_CONFIGURATION_IS_REQUIRED_HERE") }}
        </span>
      </div>
      <div v-if="formError" class="dn-form-error">{{ formError }}</div>
      <template #footer>
        <VBtn class="dn-btn dn-btn--default" variant="text" @click="closeDialog">
          {{ t("TXT_CODE_COMMON_CANCEL") }}
        </VBtn>
        <VBtn
          class="dn-btn dn-btn--primary"
          variant="text"
          :disabled="saving"
          @click="saveNode"
        >
          {{ t("TXT_CODE_COMMON_SAVE") }}
        </VBtn>
      </template>
    </DesktopDialog>

    <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="showDeleteConfirm" id="node-delete-dialog"
      :title="t('TXT_CODE_COMMON_REMOVE_DAEMON')"
      :message="t('TXT_CODE_DESKTOP_NODES_DELETE_CONFIRM', { name: deletingNode?.remarks || deletingNode?.ip })"
      danger :loading="saving" :ok-text="t('TXT_CODE_COMMON_REMOVE_DAEMON')"
      @cancel="cancelDelete" @confirm="executeDelete" />
  </div>
</template>

<style lang="scss" scoped>
.desktop-nodes {
  height: 100%;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.dn-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.dn-search {
  flex: 1;
  min-width: 0;
  max-width: 320px;

  &__input {
    width: 100%;
  }
}

.dn-btn {
  padding: 7px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  color: var(--desktop-window-text);
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--primary {
    background: var(--color-blue-5, #1677ff);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--color-blue-6, #4096ff);
    }
  }

  &--default {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);

    &:hover:not(:disabled) {
      background: var(--desktop-window-control-hover);
    }
  }
}

.dn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.dn-node-name {
  display: flex;
  align-items: center;
  gap: 6px;

  &__icon {
    color: var(--desktop-window-text-muted);
    font-size: 14px;
  }
}

.dn-badge-icon {
  &--yes {
    color: var(--color-green-5, #52c41a);
  }

  &--no {
    color: var(--color-red-5, #ff4d4f);
  }

  &--warn {
    color: var(--color-warning, #faad14);
  }
}

.dn-action-btns {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.dn-action-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  background: transparent;

  &:hover {
    background: var(--desktop-window-control-hover);
  }
}

@layer vuetify-overrides {
  .dn-action-btn {
    color: var(--desktop-window-text-secondary);

    &:hover {
      color: var(--desktop-window-text);
    }
  }
}

.dn-form-group {
  margin-bottom: 14px;

  &:last-child {
    margin-bottom: 0;
  }
}

.dn-form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--desktop-window-text-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.dn-form-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--desktop-window-titlebar-bg);
  border: 1px solid var(--desktop-window-border);
  border-radius: 6px;
  color: var(--desktop-window-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;

  &::placeholder {
    color: var(--desktop-window-text-muted);
  }

  &:focus {
    border-color: var(--desktop-window-border);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.dn-form-hint {
  display: block;
  font-size: 11px;
  color: var(--desktop-window-text-muted);
  margin-top: 4px;
}

.dn-form-error {
  padding: 8px 10px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.2);
  border-radius: 6px;
  color: #ff4d4f;
  font-size: 12px;
  margin-top: 8px;
}

</style>
