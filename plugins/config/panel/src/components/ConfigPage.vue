<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { ctx } from "@elements-panel/sdk";
import { computed, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VChip,
  VDialog,
  VDivider,
  VList,
  VListItem,
  VMenu,
  VNavigationDrawer,
  VProgressCircular,
  VProgressLinear,
  VTextField,
  VSpacer,
  VTooltip
} from "vuetify/components";
import { type PluginRecord, type NodePluginRecord, type PluginChangeResult } from "../api";
import { pluginLabel } from "../labels";
import { notify } from "../notifications";
import type { Scope } from "../types";
import { usePluginGroups } from "../hooks/usePluginGroups";
import { usePluginDrag } from "../hooks/usePluginDrag";
import { usePluginRemarks } from "../hooks/usePluginRemarks";
import { usePluginSettings } from "../hooks/usePluginSettings";
import { usePluginInventory } from "../hooks/usePluginInventory";
import { usePluginActions } from "../hooks/usePluginActions";
import PluginActionDialogs from "./PluginActionDialogs.vue";
import PluginConfigList from "./PluginConfigList.vue";
import SettingsPages from "./SettingsPages.vue";
import PluginConfigTargetSelector from "./PluginConfigTargetSelector.vue";

const props = defineProps<{
  scope?: Scope;
  daemonId?: string;
  pluginId?: string;
  hideTargetSelect?: boolean;
}>();
const { isPhone } = useScreen();
const sidebarOpen = ref(false);
const navigationProps = computed(() =>
  isPhone.value
    ? {
        class: "plugin-config-navigation plugin-config-navigation-mobile",
        modelValue: sidebarOpen.value,
        "onUpdate:modelValue": (value: boolean) => {
          sidebarOpen.value = value;
        },
        color: "surface",
        location: "left",
        temporary: true,
        floating: true,
        disableResizeWatcher: true,
        retainFocus: true,
        captureFocus: true,
        touchless: true,
        width: 280,
        "aria-label": t("TXT_CODE_PLUGIN_LIST")
      }
    : { class: "plugin-config-navigation" }
);
watch(isPhone, (phone) => {
  if (!phone) sidebarOpen.value = false;
});
const scope = ref<Scope>("panel");
const route = useRoute();
const router = useRouter();
const preferredPluginId = ref(String(props.pluginId ?? route.query.plugin ?? ""));

const selectedId = ref("");
const selectedNodeId = ref("");
const nodeSelectedId = ref("");
const {
  loading,
  plugins,
  nodes,
  nodesLoading,
  nodePlugins,
  nodeError,
  load,
  loadNodes,
  loadNodePlugins,
  reloadNodePluginsAfterToggle,
  refreshInventory,
  isDisposed
} = usePluginInventory({
  scope,
  selectedNodeId,
  isBusy: () => actionSubmitting.value
});

const selectedTargetId = computed({
  get: () => (scope.value === "panel" ? "" : selectedNodeId.value || undefined),
  set: (daemonId: string | undefined) => {
    if (daemonId === undefined) return;
    scope.value = daemonId ? "node" : "panel";
    if (daemonId) selectedNodeId.value = daemonId;
  }
});
defineExpose({ scope, selectedNodeId, selectedTargetId, nodes, nodesLoading, loadNodes, loading });

const currentList = computed<Array<PluginRecord | NodePluginRecord>>(() =>
  scope.value === "panel" ? plugins.value : nodePlugins.value
);

const lastResult = ref<PluginChangeResult | null>(null);
const recordResult = (result?: PluginChangeResult | boolean) => {
  lastResult.value = result && typeof result === "object" ? result : null;
  if (lastResult.value?.application === "failed")
    notify(lastResult.value.error || t("TXT_CODE_PLUGIN_LOAD_FAILED"), "error");
};

const {
  pluginGroupsState,
  pluginGroupsLoading,
  pluginContextMenu,
  pluginContextPlugin,
  groupDialogOpen,
  groupDialogName,
  groupDeleteConfirmOpen,
  groupDeleteCandidate,
  loadPluginGroups,
  pluginGroups,
  pluginContextGroups,
  closePluginContextMenu,
  openPluginContextMenu,
  openCreateGroup,
  openRenameGroup,
  saveGroup,
  requestRemoveGroup,
  confirmRemoveGroup,
  movePluginToGroup,
  moveContextPluginToGroup
} = usePluginGroups({ scope, selectedNodeId, currentList });
const { draggedPluginId, dragOverGroupId, endPluginDrag, preparePluginDrag, selectPluginFromList } =
  usePluginDrag({
    closePluginContextMenu,
    movePluginToGroup,
    selectPlugin: (id) => selectPlugin(id)
  });
const {
  pluginRemarks,
  remarksLoading,
  savingRemark,
  remarkDialog,
  loadPluginRemarks,
  editContextPluginRemark,
  savePluginRemark
} = usePluginRemarks({ scope, selectedNodeId, pluginContextPlugin, closePluginContextMenu });

watch(
  [scope, selectedNodeId],
  () => {
    endPluginDrag();
    closePluginContextMenu();
    void loadPluginGroups();
  },
  { immediate: true }
);

const currentId = computed({
  get: () => (scope.value === "panel" ? selectedId.value : nodeSelectedId.value),
  set: (value: string) => {
    if (scope.value === "panel") selectedId.value = value;
    else nodeSelectedId.value = value;
  }
});

const selectPlugin = (id: string) => {
  closePluginContextMenu();
  currentId.value = id;
  sidebarOpen.value = false;
};

const selectedPlugin = computed(() =>
  currentList.value.find((item) => item.id === currentId.value)
);

const settingsPagesTarget = ref<HTMLElement | null>(null);
const {
  schema,
  settingsPage,
  savedValues,
  settingsDirty,
  schemaLoading,
  savingSettings,
  resetCandidate,
  resetConfirmOpen,
  loadSchema,
  saveSettings,
  requestResetContextPluginSettings,
  confirmResetSettings
} = usePluginSettings({
  scope,
  selectedNodeId,
  currentId,
  pluginContextPlugin,
  closePluginContextMenu,
  lastResult,
  recordResult,
  load: (quiet) => load(quiet),
  loadNodePlugins: (quiet) => loadNodePlugins(quiet),
  isDisposed,
  isActionBusy: () => actionBusy.value,
  isActionSubmitting: () => actionSubmitting.value
});

const toggleTooltipOpen = ref(false);
const deleteTooltipOpen = ref(false);
const saveTooltipActive = ref(false);
const saveTooltipOpen = computed({
  get: () =>
    !sidebarOpen.value &&
    !toggleTooltipOpen.value &&
    !deleteTooltipOpen.value &&
    (settingsDirty.value || saveTooltipActive.value),
  set: (value: boolean) => {
    saveTooltipActive.value = value;
  }
});
watch(sidebarOpen, (open) => {
  if (!open) return;
  toggleTooltipOpen.value = false;
  deleteTooltipOpen.value = false;
  saveTooltipActive.value = false;
});
const stateLabels = {
  disabled: "TXT_CODE_PLUGIN_STATE_DISABLED",
  pending: "TXT_CODE_PLUGIN_STATE_PENDING",
  loading: "TXT_CODE_PLUGIN_STATE_LOADING",
  active: "TXT_CODE_PLUGIN_STATE_ACTIVE",
  failed: "TXT_CODE_PLUGIN_LOAD_FAILED",
  unloading: "TXT_CODE_PLUGIN_STATE_UNLOADING",
  "restart-required": "TXT_CODE_PLUGIN_RESTART_REQUIRED"
};
const frontendPlugin = computed(() =>
  scope.value === "panel"
    ? ctx.plugins.loaded.find((item) => item.metadata.id === currentId.value)
    : undefined
);
const unavailableDependencies = (plugin: PluginRecord | NodePluginRecord) => {
  const frontend =
    scope.value === "panel"
      ? ctx.plugins?.loaded.find((item) => item.metadata.id === plugin.id)
      : undefined;
  const missing = (frontend?.metadata.frontendInject ?? []).filter(
    (id) => ctx.plugins.loaded.find((item) => item.metadata.id === id)?.state !== "active"
  );
  return [
    ...new Set([
      ...(plugin.missingDependencies ?? []),
      ...(frontend?.missingServices ?? []),
      ...missing
    ])
  ];
};
const pluginWarning = (plugin: PluginRecord | NodePluginRecord) => {
  if (!plugin.enabled) return false;
  const frontend =
    scope.value === "panel"
      ? ctx.plugins?.loaded.find((item) => item.metadata.id === plugin.id)
      : undefined;
  return (
    plugin.state === "pending" ||
    plugin.state === "failed" ||
    !!plugin.error ||
    frontend?.state === "pending" ||
    frontend?.state === "failed" ||
    !!frontend?.error ||
    unavailableDependencies(plugin).length > 0
  );
};
const missingDependencies = computed(() =>
  selectedPlugin.value ? unavailableDependencies(selectedPlugin.value) : []
);
const {
  pending,
  deletingPlugin,
  actionCandidate,
  actionSubmitting,
  actionBusy,
  actionConfirmOpen,
  nodePickerOpen,
  nodeTargetItems,
  retryFrontend,
  requestAction,
  toggle,
  toggleSelected,
  toggleContextPlugin,
  confirmAction
} = usePluginActions({
  scope,
  selectedNodeId,
  currentId,
  plugins,
  selectedPlugin,
  pluginContextPlugin,
  closePluginContextMenu,
  savingSettings,
  resetCandidate,
  lastResult,
  recordResult,
  load: (quiet) => load(quiet),
  reloadNodePluginsAfterToggle: () => reloadNodePluginsAfterToggle(),
  isDisposed
});

/** Drop page-specific query parameters while preserving the target link's values. */
onBeforeRouteLeave((to) => {
  if (to.path === "/plugins/config") return true;
  const query = { ...to.query };
  const contributed: Record<string, string> = {
    scope: scope.value,
    daemonId: selectedNodeId.value,
    plugin: currentId.value
  };
  let inherited = false;
  for (const [key, value] of Object.entries(contributed)) {
    if (value && query[key] === value) {
      delete query[key];
      inherited = true;
    }
  }
  return inherited ? { path: to.path, query } : true;
});

watch(scope, (value) => {
  if (value === "node" && !nodes.value.length && !nodeError.value) loadNodes();
});

watch([scope, selectedNodeId], () => {
  if (scope.value === "node") void loadNodePlugins();
});

watch(
  () => [
    props.scope ?? route.query.scope,
    props.daemonId ?? route.query.daemonId,
    props.pluginId ?? route.query.plugin
  ],
  ([targetScope, daemonId, pluginId]) => {
    if (typeof pluginId === "string") preferredPluginId.value = pluginId;
    if (targetScope !== "node") {
      if (targetScope === "panel") scope.value = "panel";
      if (typeof pluginId === "string" && plugins.value.some((item) => item.id === pluginId))
        selectedId.value = pluginId;
      return;
    }
    scope.value = "node";
    if (typeof daemonId === "string") selectedNodeId.value = daemonId;
  },
  { immediate: true }
);

watch(
  [currentList, pluginGroups, pluginGroupsLoading],
  () => {
    if (pluginGroupsLoading.value) return;
    const list = currentList.value;
    if (list.some((item) => item.id === currentId.value)) return;
    currentId.value =
      list.find((item) => item.id === preferredPluginId.value)?.id ||
      pluginGroups.value.find((group) => group.plugins.length)?.plugins[0]?.id ||
      "";
  },
  { immediate: true }
);

watch(
  () => [
    selectedPlugin.value?.version,
    selectedPlugin.value?.enabled,
    selectedPlugin.value?.hasSettings
  ],
  () => {
    if (!settingsDirty.value && !savingSettings.value) void loadSchema();
  }
);

watch(
  [scope, currentId, selectedNodeId],
  () => {
    lastResult.value = null;
    toggleTooltipOpen.value = false;
    deleteTooltipOpen.value = false;
    saveTooltipActive.value = false;
    loadSchema();
  },
  { immediate: true }
);

/** Update plugin URLs without navigation; leave the browser URL unchanged for desktop windows. */
let lastSyncedPath = "";
const syncRoute = () => {
  if (route.path !== "/plugins/config" || pluginGroupsLoading.value) return;
  const query: Record<string, string> = { scope: scope.value };
  if (scope.value === "node" && selectedNodeId.value) query.daemonId = selectedNodeId.value;
  if (currentId.value) query.plugin = currentId.value;
  if (currentId.value) preferredPluginId.value = currentId.value;
  const fullPath = router.resolve({ query }).fullPath;
  if (fullPath === lastSyncedPath) return;
  lastSyncedPath = fullPath;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}#${fullPath}`);
};

watch([scope, currentId, selectedNodeId, pluginGroupsLoading], syncRoute);
</script>

<template>
  <div class="plugin-config-page" data-app-surface="transparent" @keydown.esc="sidebarOpen = false">
    <VProgressLinear
      v-if="loading || nodesLoading"
      class="plugin-config-loading"
      color="primary"
      indeterminate
    />

    <Teleport to="body" :disabled="!isPhone">
      <component
        :is="isPhone ? VNavigationDrawer : 'aside'"
        v-bind="navigationProps"
        @keydown.esc="sidebarOpen = false"
      >
        <div class="plugin-config-sidebar" :data-app-surface="isPhone ? 'card' : 'transparent'">
          <div v-if="!props.hideTargetSelect" class="plugin-config-target-select">
            <PluginConfigTargetSelector
              v-model="selectedTargetId"
              :nodes="nodes"
              :loading="nodesLoading"
              @open="loadNodes"
            />
          </div>

          <div class="plugin-config-heading">
            <span>{{ t("TXT_CODE_PLUGIN_LIST") }}</span>
            <VBtn
              icon="mdi-plus"
              size="x-small"
              variant="text"
              :aria-label="t('TXT_CODE_PLUGIN_GROUP_ADD')"
              @click="openCreateGroup"
            />
          </div>
          <PluginConfigList
            :groups="pluginGroups"
            :current-id="currentId"
            :remarks="pluginRemarks"
            :dragged-plugin-id="draggedPluginId"
            :drag-over-group-id="dragOverGroupId"
            :empty="!currentList.length"
            :warning="pluginWarning"
            @select="selectPluginFromList"
            @contextmenu="openPluginContextMenu"
            @pointerdown="preparePluginDrag"
            @rename="openRenameGroup"
            @remove="requestRemoveGroup"
          />
        </div>
      </component>
    </Teleport>

    <div class="plugin-config-content">
      <div class="plugin-config-header">
        <div v-if="selectedPlugin || isPhone" class="plugin-config-title-row">
          <div class="plugin-config-title">
            <VBtn
              v-if="isPhone"
              icon="mdi-menu"
              variant="text"
              :title="t('TXT_CODE_PLUGIN_LIST')"
              :aria-label="t('TXT_CODE_PLUGIN_LIST')"
              :aria-expanded="sidebarOpen"
              @click="sidebarOpen = true"
            />
            <h2>{{ pluginLabel(selectedPlugin?.id) || t("TXT_CODE_PLUGIN_CONFIG") }}</h2>
          </div>
          <div v-if="selectedPlugin" class="plugin-config-meta">
            <VChip
              v-if="selectedPlugin.state"
              size="small"
              :color="selectedPlugin.state === 'active' ? 'success' : 'warning'"
            >
              {{ t(stateLabels[selectedPlugin.state]) }}
            </VChip>
            <span
              v-if="selectedPlugin.version"
              class="plugin-config-version plugin-config-plugin-version"
            >
              {{ t("TXT_CODE_VERSION") }} {{ selectedPlugin.version }}
            </span>
            <div class="plugin-config-actions">
              <VTooltip
                v-model="toggleTooltipOpen"
                :text="
                  t(selectedPlugin.enabled ? 'TXT_CODE_PLUGIN_DISABLE' : 'TXT_CODE_PLUGIN_ENABLE')
                "
                location="top"
              >
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps">
                    <VBtn
                      icon="mdi-power"
                      :color="selectedPlugin.enabled ? 'warning' : 'success'"
                      variant="text"
                      :loading="
                        pending === selectedPlugin.id ||
                        (actionCandidate?.plugin.id === selectedPlugin.id &&
                          actionCandidate.checkingNodes)
                      "
                      :disabled="actionBusy"
                      :aria-label="
                        t(
                          selectedPlugin.enabled
                            ? 'TXT_CODE_PLUGIN_DISABLE'
                            : 'TXT_CODE_PLUGIN_ENABLE'
                        )
                      "
                      @click="toggleSelected(!selectedPlugin.enabled)"
                    />
                  </span>
                </template>
              </VTooltip>
              <VTooltip
                v-if="schema?.fields.some((field) => field.type !== 'link')"
                v-model="saveTooltipOpen"
                :text="
                  t(
                    settingsDirty
                      ? 'TXT_CODE_PLUGIN_SAVE_REMINDER'
                      : 'TXT_CODE_PLUGIN_SAVE_SETTINGS'
                  )
                "
                location="top"
              >
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps">
                    <VBtn
                      icon="mdi-content-save"
                      color="primary"
                      :variant="settingsDirty ? 'flat' : 'text'"
                      :loading="savingSettings"
                      :disabled="schemaLoading"
                      :aria-label="t('TXT_CODE_PLUGIN_SAVE_SETTINGS')"
                      @click="saveSettings"
                    />
                  </span>
                </template>
              </VTooltip>
              <VTooltip
                v-model="deleteTooltipOpen"
                :text="
                  t(
                    selectedPlugin?.removable
                      ? 'TXT_CODE_PLUGIN_DELETE'
                      : 'TXT_CODE_PLUGIN_DELETE_UNAVAILABLE'
                  )
                "
                location="top"
              >
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps">
                    <VBtn
                      icon="mdi-delete"
                      color="error"
                      variant="text"
                      :loading="deletingPlugin"
                      :disabled="!selectedPlugin?.removable || actionBusy"
                      :aria-label="
                        t(
                          selectedPlugin?.removable
                            ? 'TXT_CODE_PLUGIN_DELETE'
                            : 'TXT_CODE_PLUGIN_DELETE_UNAVAILABLE'
                        )
                      "
                      @click="requestAction(selectedPlugin, 'remove')"
                    />
                  </span>
                </template>
              </VTooltip>
            </div>
          </div>
        </div>

        <div ref="settingsPagesTarget" class="plugin-config-pages" />
      </div>

      <div class="plugin-config-body">
        <Empty
          v-if="scope === 'node' && nodeError"
          icon="mdi-alert-circle-outline"
          :title="t('TXT_CODE_PLUGIN_NODE_LIST_FAILED')"
          :description="nodeError"
          :compact="!!selectedPlugin"
        >
          <template #actions>
            <VBtn
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="loading || nodesLoading"
              :disabled="actionBusy"
              @click="selectedNodeId ? loadNodePlugins() : loadNodes()"
              >{{ t("TXT_CODE_COMMON_RETRY") }}</VBtn
            >
          </template>
        </Empty>
        <template v-if="selectedPlugin">
          <VAlert
            v-if="!selectedPlugin.enabled"
            class="plugin-config-alert"
            type="warning"
            variant="tonal"
            :title="t('TXT_CODE_PLUGIN_IS_DISABLED')"
          />
          <VAlert
            v-else-if="selectedPlugin.error"
            class="plugin-config-alert"
            type="error"
            variant="tonal"
            :title="t('TXT_CODE_PLUGIN_LOAD_FAILED')"
            :text="selectedPlugin.error"
          />

          <VAlert
            v-if="selectedPlugin.enabled && missingDependencies.length"
            class="plugin-config-alert"
            type="warning"
            variant="tonal"
            :title="t('TXT_CODE_PLUGIN_DEPENDENCIES_UNAVAILABLE')"
            :text="
              t('TXT_CODE_PLUGIN_MISSING_DEPENDENCIES', {
                dependencies: missingDependencies.map(pluginLabel).join(', ')
              })
            "
          />
          <VAlert
            v-if="lastResult?.application === 'restart-required' || frontendPlugin?.restartRequired"
            class="plugin-config-alert"
            type="warning"
            variant="tonal"
            :text="t('TXT_CODE_PLUGIN_RESTART_REQUIRED')"
          />
          <VAlert
            v-else-if="frontendPlugin?.reloadRequired"
            class="plugin-config-alert"
            type="warning"
            variant="tonal"
            :text="t('TXT_CODE_PLUGIN_REFRESH_REQUIRED')"
          />
          <VAlert
            v-else-if="lastResult?.application === 'pending'"
            class="plugin-config-alert"
            type="info"
            variant="tonal"
            :text="t('TXT_CODE_PLUGIN_SAVED_PENDING')"
          />
          <VAlert
            v-if="frontendPlugin?.error"
            class="plugin-config-alert"
            type="error"
            variant="tonal"
            :title="t('TXT_CODE_PLUGIN_FRONTEND_FAILED')"
            :text="frontendPlugin.error.message"
          />

          <VBtn v-if="frontendPlugin?.error" class="mb-4" variant="text" @click="retryFrontend">{{
            t("TXT_CODE_COMMON_RETRY")
          }}</VBtn>
          <div v-if="schemaLoading" class="plugin-config-schema-loading">
            <VProgressCircular indeterminate />
          </div>
          <div v-else-if="schema && schema.fields.length" class="plugin-config-form">
            <SettingsPages
              :key="`${scope}:${selectedNodeId}:${schema.id}`"
              v-model:page="settingsPage"
              :navigation-target="settingsPagesTarget"
              :fields="schema.fields"
              :values="schema.values"
              :saved-values="savedValues"
              @save="saveSettings"
            />
          </div>
          <Empty v-else icon="mdi-cog-outline" :title="t('TXT_CODE_PLUGIN_NO_CONFIG')" />
        </template>
        <Empty v-else-if="!nodeError" icon="mdi-puzzle-outline" />
      </div>
    </div>

    <VMenu
      v-model="pluginContextMenu.open"
      :target="[pluginContextMenu.x, pluginContextMenu.y]"
      location="bottom start"
    >
      <VList v-if="pluginContextPlugin" min-width="190">
        <VListItem
          :title="
            t(pluginContextPlugin.enabled ? 'TXT_CODE_PLUGIN_DISABLE' : 'TXT_CODE_PLUGIN_ENABLE')
          "
          prepend-icon="mdi-power"
          :base-color="pluginContextPlugin.enabled ? 'warning' : 'success'"
          :disabled="actionBusy || Boolean(pending)"
          @click="toggleContextPlugin"
        />
        <VListItem
          :title="t('TXT_CODE_PLUGIN_REMARK_EDIT')"
          prepend-icon="mdi-note-edit-outline"
          :disabled="remarksLoading || savingRemark"
          @click="editContextPluginRemark"
        />
        <VListItem
          v-if="pluginContextPlugin.canResetSettings"
          :title="t('TXT_CODE_PLUGIN_RESET_SETTINGS')"
          prepend-icon="mdi-restore"
          :disabled="actionBusy"
          @click="requestResetContextPluginSettings"
        />
        <VDivider />
        <VMenu submenu location="end" open-on-click :open-on-hover="false">
          <template #activator="{ props: menuProps }">
            <VListItem
              v-bind="menuProps"
              :title="t('TXT_CODE_PLUGIN_GROUP_MOVE_TO')"
              prepend-icon="mdi-folder-move-outline"
              append-icon="mdi-chevron-right"
              @click.stop
            />
          </template>
          <VList min-width="190">
            <VListItem
              v-for="group in pluginContextGroups"
              :key="group.id"
              :title="group.name"
              :prepend-icon="group.current ? 'mdi-check' : 'mdi-folder-outline'"
              :disabled="group.current"
              @click="moveContextPluginToGroup(group.id)"
            />
          </VList>
        </VMenu>
      </VList>
    </VMenu>

    <VDialog v-model="resetConfirmOpen" :persistent="savingSettings" max-width="460">
      <VCard
        :title="
          t('TXT_CODE_PLUGIN_RESET_SETTINGS_CONFIRM_TITLE', {
            name: pluginLabel(resetCandidate?.id)
          })
        "
        rounded="xl"
      >
        <VCardText>{{ t("TXT_CODE_PLUGIN_RESET_SETTINGS_CONFIRM") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :disabled="savingSettings" @click="resetConfirmOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn color="primary" :loading="savingSettings" @click="confirmResetSettings">
            {{ t("TXT_CODE_PLUGIN_RESET_SETTINGS") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="remarkDialog.open" :persistent="savingRemark" max-width="460">
      <VCard :title="t('TXT_CODE_PLUGIN_REMARK_EDIT')" rounded="xl">
        <VCardText>
          <VTextField
            v-model="remarkDialog.remarks"
            :label="t('TXT_CODE_COMMON_REMARKS')"
            :hint="pluginLabel(remarkDialog.pluginId)"
            persistent-hint
            clearable
            autofocus
            :disabled="savingRemark"
          />
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :disabled="savingRemark" @click="remarkDialog.open = false">
            {{ t("TXT_CODE_COMMON_CANCEL") }}
          </VBtn>
          <VBtn color="primary" :loading="savingRemark" @click="savePluginRemark">
            {{ t("TXT_CODE_COMMON_SAVE") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <PluginActionDialogs
      v-model:confirm-open="actionConfirmOpen"
      v-model:picker-open="nodePickerOpen"
      :candidate="actionCandidate"
      :submitting="actionSubmitting"
      :items="nodeTargetItems"
      @confirm="confirmAction"
    />

    <VDialog v-model="groupDialogOpen" max-width="460">
      <VCard
        :title="t('TXT_CODE_PLUGIN_GROUP_EDIT')"
        class="plugin-config-confirm-card"
        rounded="xl"
      >
        <VCardText>
          <VTextField
            v-model="groupDialogName"
            autofocus
            :label="t('TXT_CODE_PLUGIN_GROUP_NAME')"
            hide-details
            @keyup.enter="saveGroup"
          />
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="groupDialogOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn color="primary" :disabled="!groupDialogName.trim()" @click="saveGroup">
            {{ t("TXT_CODE_PLUGIN_SAVE_SETTINGS") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="groupDeleteConfirmOpen" max-width="460">
      <VCard
        :title="
          t('TXT_CODE_PLUGIN_GROUP_DELETE_CONFIRM_TITLE', {
            name: groupDeleteCandidate?.name || ''
          })
        "
        class="plugin-config-confirm-card"
        rounded="xl"
      >
        <VCardText>{{ t("TXT_CODE_PLUGIN_GROUP_DELETE_CONFIRM") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="groupDeleteConfirmOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn color="error" @click="confirmRemoveGroup">
            {{ t("TXT_CODE_PLUGIN_GROUP_DELETE") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.plugin-config-page {
  position: relative;
  display: flex;
  width: 100%;
  box-sizing: border-box;
  height: min(720px, calc(100vh - 140px));
  min-height: 0;
  overflow: hidden;
  border-radius: 24px;
  background: transparent;
  color: var(--text-color);
}

:global(.desktop-container .plugin-config-page) {
  height: 100%;
}

.plugin-config-navigation {
  flex: 0 0 240px;
  min-width: 0;
  min-height: 0;
}

.plugin-config-navigation :deep(.v-navigation-drawer__content) {
  overflow: hidden;
}

.plugin-config-navigation-mobile {
  max-width: calc(100vw - 48px);
}

.plugin-config-navigation-mobile + :deep(.v-navigation-drawer__scrim) {
  position: fixed;
}

.plugin-config-sidebar {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 24px 16px;
  overflow: hidden;
}

.plugin-config-target-select {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0 0 8px;
  box-sizing: border-box;
}

.plugin-config-target-select :deep(.plugin-config-target-selector) {
  width: 100%;
  min-width: 0;
}

.plugin-config-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin: 12px 10px 8px;
  line-height: 20px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
}

.plugin-config-heading:first-child {
  margin-top: 0;
}

.plugin-config-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  flex: 1;
  padding: 32px;
  padding-top: 20px;
  overflow: hidden;
}

.plugin-config-header {
  flex: 0 0 auto;
  min-width: 0;
}

.plugin-config-pages {
  margin-bottom: 20px;
}

.plugin-config-pages:empty {
  display: none;
}

.plugin-config-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

.plugin-config-title-row {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.plugin-config-title-row:has(+ .plugin-config-pages:not(:empty)) {
  margin-bottom: 6px;
}

.plugin-config-title-row h2 {
  margin: 0;
  font-size: 20px;
}

.plugin-config-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.plugin-config-title > :deep(.v-btn) {
  flex: 0 0 auto;
}

.plugin-config-meta {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.plugin-config-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plugin-config-version {
  font-size: 12px;
  opacity: 0.62;
}

.plugin-config-alert {
  margin-bottom: 20px;
}

.plugin-config-form {
  min-height: 100px;
}

.plugin-config-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
}

.plugin-config-schema-loading {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
}

@media (max-width: 992px) {
  .plugin-config-page {
    flex-direction: column;
    height: calc(100dvh - 200px);
    min-width: 0;
    min-height: 0;
  }

  .plugin-config-sidebar {
    min-width: 0;
    padding: 16px;
  }

  .plugin-config-list :deep(.plugin-config-group-actions) {
    opacity: 1;
    pointer-events: auto;
  }

  .plugin-config-group-actions :deep(.v-btn) {
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
  }

  .plugin-config-group-actions :deep(.v-icon) {
    font-size: 16px;
  }

  .plugin-config-content {
    padding: 16px 16px 20px;
  }

  .plugin-config-body {
    padding-inline: 8px;
  }

  .plugin-config-title-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, auto);
    gap: 8px;
  }

  .plugin-config-title {
    grid-column: 1;
    grid-row: 1;
  }

  .plugin-config-title-row h2,
  .plugin-config-version,
  .plugin-config-alert {
    overflow-wrap: anywhere;
  }

  .plugin-config-meta {
    display: contents;
  }

  .plugin-config-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
    gap: 8px;
  }

  .plugin-config-plugin-version {
    grid-column: 2;
    grid-row: 1;
  }

  .plugin-config-version {
    min-width: 0;
    max-width: 100%;
  }

  .plugin-config-meta :deep(.v-chip) {
    grid-column: 3;
    grid-row: 1;
    max-width: 100%;
    min-height: 24px;
    height: auto;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .plugin-config-meta :deep(.v-chip__content) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .plugin-config-alert :deep(.v-alert__content) {
    min-width: 0;
  }

  .plugin-config-confirm-card :deep(.v-card-title) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .plugin-config-confirm-card :deep(.v-card-actions) {
    flex-wrap: wrap;
  }

  :global(.desktop-container .plugin-config-page) {
    height: 100%;
  }
}
</style>
