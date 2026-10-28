<script setup lang="ts">
import { t } from "@/lang/i18n";
import { useScreen } from "@/hooks/useScreen";
import { ctx } from "@/plugin/context";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import {
  VAlert,
  VBtn,
  VBtnToggle,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VChip,
  VDialog,
  VLayout,
  VList,
  VListItem,
  VListSubheader,
  VNavigationDrawer,
  VProgressCircular,
  VProgressLinear,
  VSelect,
  VTextField,
  VSpacer,
  VTooltip
} from "vuetify/components";
import {
  nodeList,
  nodePluginGroupList,
  nodePluginList,
  nodePluginSettings,
  pluginList,
  pluginGroupList,
  pluginSettings,
  removePlugin,
  removeNodePlugin,
  setNodePluginEnabled,
  setPluginEnabled,
  updateNodePluginSettings,
  updateNodePluginGroupList,
  updatePluginSettings,
  updatePluginGroupList,
  type NodePluginRecord,
  type NodeSummary,
  type PluginRecord,
  type PluginGroup,
  type PluginChangeResult,
  type SettingsSchema
} from "./api";
import SchemaForm from "./SchemaForm.vue";

// The panel reports installed plugins after applying the user override layer; a
// disabled plugin has to stay listed for the enable button to turn it back on.
//
// The form beside the list is not a component any plugin shipped: a plugin
// describes its configuration on its backend, and this page renders that
// description. That is the only reason a daemon plugin can have a settings form
// at all 鈥?the browser holds no copy of a daemon plugin.

type Scope = "panel" | "node";
type PluginAction = "disable" | "remove";

interface NodePluginTarget {
  node: NodeSummary;
  plugin: NodePluginRecord;
}

interface PluginActionCandidate {
  action: PluginAction;
  step: "confirm" | "nodes";
  scope: Scope;
  plugin: PluginRecord | NodePluginRecord;
  nodeId: string;
  checkingNodes: boolean;
  nodeTargets: NodePluginTarget[];
  selectedNodeIds: string[];
  nodeCheckError: string;
}

const props = defineProps<{ scope?: Scope; daemonId?: string }>();
const { isPhone } = useScreen();
const sidebarOpen = ref(false);
const navigationProps = computed(() =>
  isPhone.value
    ? {
        class: "plugin-config-navigation",
        modelValue: sidebarOpen.value,
        "onUpdate:modelValue": (value: boolean) => { sidebarOpen.value = value; },
        absolute: true,
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
/** The plugin named by the URL, used once its list has actually arrived. */
const preferredPluginId = ref(String(route.query.plugin ?? ""));

const loading = ref(true);
const pending = ref<string>("");
const plugins = ref<PluginRecord[]>([]);
const selectedId = ref("");

const nodes = ref<NodeSummary[]>([]);
const selectedNodeId = ref("");
const nodePlugins = ref<NodePluginRecord[]>([]);
const nodeSelectedId = ref("");
/** Why the node scope has nothing to show, when it has nothing to show. */
const nodeError = ref("");

const nodeLabel = (node: NodeSummary) =>
  `${node.remarks || `${node.ip}:${node.port}`}${
    node.available ? "" : ` (${t("TXT_CODE_PLUGIN_NODE_OFFLINE")})`
  }`;

const PLUGIN_NAME_PREFIX = "epanel-plugin-";
/** Show plugin package names without the ePanel package prefix. */
const pluginLabel = (id?: string) => {
  if (!id) return "";
  const slash = id.indexOf("/");
  const name = id.startsWith("@") && slash >= 0 ? id.slice(slash + 1) : id;
  return name.startsWith(PLUGIN_NAME_PREFIX) ? name.slice(PLUGIN_NAME_PREFIX.length) : id;
};

const nodeItems = computed(() =>
  nodes.value.map((node) => ({ title: nodeLabel(node), value: node.uuid }))
);

const currentList = computed<Array<PluginRecord | NodePluginRecord>>(() =>
  scope.value === "panel" ? plugins.value : nodePlugins.value
);

interface PluginGroupView extends PluginGroup {
  plugins: Array<PluginRecord | NodePluginRecord>;
  unassigned: boolean;
}

const UNASSIGNED_GROUP_ID = "__unassigned__";
const pluginGroupsState = ref<PluginGroup[]>([]);
const draggedPluginId = ref("");
const dragOverGroupId = ref("");
let dragPreview: HTMLElement | null = null;
const groupDialogOpen = ref(false);
const groupDialogMode = ref<"create" | "rename">("create");
const groupDialogName = ref("");
const editingGroupId = ref("");
const groupDeleteConfirmOpen = ref(false);
const groupDeleteCandidate = ref<PluginGroupView | null>(null);

let groupsRequest = 0;

const loadPluginGroups = async () => {
  const request = ++groupsRequest;
  pluginGroupsState.value = [];
  if (scope.value === "node" && !selectedNodeId.value) return;
  try {
    const stored =
      scope.value === "panel"
        ? (await pluginGroupList().execute()).value
        : (
            await nodePluginGroupList().execute({
              params: { daemonId: selectedNodeId.value }
            })
          ).value;
    if (request === groupsRequest) pluginGroupsState.value = Array.isArray(stored) ? stored : [];
  } catch (error) {
    if (request !== groupsRequest) return;
    pluginGroupsState.value = [];
    console.error("Failed to load plugin groups:", error);
  }
};

const savePluginGroups = async () => {
  const groups = pluginGroupsState.value.map((group) => ({
    id: group.id,
    name: group.name,
    pluginIds: [...group.pluginIds]
  }));
  try {
    if (scope.value === "panel") {
      await updatePluginGroupList().execute({ data: { groups } });
    } else if (selectedNodeId.value) {
      await updateNodePluginGroupList().execute({
        params: { daemonId: selectedNodeId.value },
        data: { groups }
      });
    }
  } catch (error) {
    notifyError(error);
  }
};

const pluginGroups = computed<PluginGroupView[]>(() => {
  const assigned = new Set<string>();
  const groups: PluginGroupView[] = pluginGroupsState.value.map((group) => {
    const plugins = currentList.value.filter(
      (plugin) => group.pluginIds.includes(plugin.id) && !assigned.has(plugin.id)
    );
    plugins.forEach((plugin) => assigned.add(plugin.id));
    return { ...group, plugins, unassigned: false };
  });
  const unassigned = currentList.value.filter((plugin) => !assigned.has(plugin.id));
  if (unassigned.length || !groups.length) {
    groups.push({
      id: UNASSIGNED_GROUP_ID,
      name: t("TXT_CODE_PLUGIN_GROUP_UNASSIGNED"),
      pluginIds: [],
      plugins: unassigned,
      unassigned: true
    });
  }
  return groups;
});

const createGroupId = () =>
  `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const openCreateGroup = () => {
  groupDialogMode.value = "create";
  groupDialogName.value = "";
  editingGroupId.value = "";
  groupDialogOpen.value = true;
};

const openRenameGroup = (group: PluginGroupView) => {
  if (group.unassigned) return;
  groupDialogMode.value = "rename";
  groupDialogName.value = group.name;
  editingGroupId.value = group.id;
  groupDialogOpen.value = true;
};

const saveGroup = () => {
  const name = groupDialogName.value.trim();
  if (!name) return;
  if (groupDialogMode.value === "create") {
    pluginGroupsState.value.push({ id: createGroupId(), name, pluginIds: [] });
  } else {
    const group = pluginGroupsState.value.find((item) => item.id === editingGroupId.value);
    if (group) group.name = name;
  }
  void savePluginGroups();
  groupDialogOpen.value = false;
};

const requestRemoveGroup = (group: PluginGroupView) => {
  if (group.unassigned) return;
  groupDeleteCandidate.value = group;
  groupDeleteConfirmOpen.value = true;
};

const confirmRemoveGroup = () => {
  const group = groupDeleteCandidate.value;
  if (!group) return;
  pluginGroupsState.value = pluginGroupsState.value.filter((item) => item.id !== group.id);
  void savePluginGroups();
  groupDeleteConfirmOpen.value = false;
  groupDeleteCandidate.value = null;
};

watch(groupDeleteConfirmOpen, (open) => {
  if (!open) groupDeleteCandidate.value = null;
});

const movePluginToGroup = (pluginId: string, groupId: string) => {
  for (const group of pluginGroupsState.value) {
    group.pluginIds = group.pluginIds.filter((id) => id !== pluginId);
  }
  if (groupId !== UNASSIGNED_GROUP_ID) {
    pluginGroupsState.value.find((group) => group.id === groupId)?.pluginIds.push(pluginId);
  }
  void savePluginGroups();
};

const clearDragPreview = () => {
  dragPreview?.remove();
  dragPreview = null;
};

const startPluginDrag = (pluginId: string, event?: DragEvent) => {
  draggedPluginId.value = pluginId;
  if (!event?.dataTransfer) return;
  event.dataTransfer.setData("text/plain", pluginId);
  event.dataTransfer.effectAllowed = "move";

  // Vuetify list items contain overlays and nested layout elements. Chromium
  // may use that whole rendered tree as the native drag image, which produces
  // a distorted preview. Use a small, plain element instead.
  clearDragPreview();
  dragPreview = document.createElement("span");
  dragPreview.textContent = pluginId;
  Object.assign(dragPreview.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "4px 10px",
    borderRadius: "14px",
    background: "rgb(var(--v-theme-surface, 255 255 255))",
    color: "rgb(var(--v-theme-on-surface, 0 0 0))",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
    font: "12px sans-serif",
    whiteSpace: "nowrap"
  });
  document.body.appendChild(dragPreview);
  event.dataTransfer.setDragImage(dragPreview, 12, 14);
};

const dropPlugin = (groupId: string) => {
  if (draggedPluginId.value) movePluginToGroup(draggedPluginId.value, groupId);
  draggedPluginId.value = "";
  dragOverGroupId.value = "";
};

const endPluginDrag = () => {
  draggedPluginId.value = "";
  dragOverGroupId.value = "";
  clearDragPreview();
};

watch([scope, selectedNodeId], () => void loadPluginGroups(), { immediate: true });

const currentId = computed({
  get: () => (scope.value === "panel" ? selectedId.value : nodeSelectedId.value),
  set: (value: string) => {
    if (scope.value === "panel") selectedId.value = value;
    else nodeSelectedId.value = value;
  }
});

const selectPlugin = (id: string) => {
  currentId.value = id;
  sidebarOpen.value = false;
};

const selectedPlugin = computed(() =>
  currentList.value.find((item) => item.id === currentId.value)
);

/** The selected plugin's declared form, or null when it declared none. */
const schema = ref<SettingsSchema | null>(null);
const savedSettings = ref("");
const settingsDirty = computed(
  () => !!schema.value && JSON.stringify(schema.value.values) !== savedSettings.value
);
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
// Take a baseline when a form loads, without treating nested field edits as a new baseline.
watch(
  schema,
  (value) => {
    savedSettings.value = value ? JSON.stringify(value.values) : "";
  },
  { flush: "sync" }
);
const schemaLoading = ref(false);
let schemaRequest = 0;
let nodePluginsRequest = 0;
let disposed = false;
const savingSettings = ref(false);
const lastResult = ref<PluginChangeResult | null>(null);
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
const recordResult = (result?: PluginChangeResult | boolean) => {
  lastResult.value = result && typeof result === "object" ? result : null;
  if (lastResult.value?.application === "failed")
    notify(lastResult.value.error || t("TXT_CODE_PLUGIN_LOAD_FAILED"), "error");
};
const deletingPlugin = ref(false);
const actionCandidate = ref<PluginActionCandidate | null>(null);
const actionSubmitting = computed(() => Boolean(pending.value || deletingPlugin.value));
const actionBusy = computed(() => actionSubmitting.value || Boolean(actionCandidate.value));
const actionConfirmOpen = computed({
  get: () => actionCandidate.value?.step === "confirm",
  set: (open: boolean) => {
    if (!open && actionCandidate.value?.step === "confirm" && !actionSubmitting.value)
      actionCandidate.value = null;
  }
});
const nodePickerOpen = computed({
  get: () => actionCandidate.value?.step === "nodes",
  set: (open: boolean) => {
    if (!open && actionCandidate.value?.step === "nodes" && !actionSubmitting.value)
      actionCandidate.value = null;
  }
});
const notify = (text: string, color: "success" | "error") => {
  if (color === "error") message.error(text);
  else message.success(text);
};

const notifyError = (error: unknown) => {
  console.error("Plugin configuration error:", error);
  notify(getValidatorErrorMsg(error, t("TXT_CODE_6a365d01")), "error");
};

const loadSchema = async () => {
  if (disposed) return;
  const request = ++schemaRequest;
  schema.value = null;
  schemaLoading.value = false;
  const id = currentId.value;
  if (!id) return;
  if (scope.value === "node" && !selectedNodeId.value) return;
  schemaLoading.value = true;
  try {
    if (scope.value === "panel") {
      const { execute } = pluginSettings();
      const res = await execute({ params: { id } });
      if (request === schemaRequest) schema.value = res.value ?? null;
    } else {
      const { execute } = nodePluginSettings();
      const res = await execute({ params: { daemonId: selectedNodeId.value, id } });
      if (request === schemaRequest) schema.value = res.value ?? null;
    }
  } catch (error: any) {
    // A plugin that declared nothing is the common case; a real failure is
    // reported by the list above, which uses the same connection.
    if (request === schemaRequest) schema.value = null;
  } finally {
    if (request === schemaRequest) schemaLoading.value = false;
  }
};

const retryFrontend = async () => {
  if (!currentId.value || pending.value) return;
  pending.value = currentId.value;
  try {
    await ctx.plugins.reload(currentId.value);
  } catch (error) {
    notifyError(error);
  } finally {
    pending.value = "";
  }
};

const saveSettings = async () => {
  if (!schema.value || savingSettings.value) return;
  const targetSchema = schema.value;
  const targetScope = scope.value;
  const targetNode = selectedNodeId.value;
  const targetId = targetSchema.id;
  const submittedSettings = JSON.stringify(targetSchema.values);
  savingSettings.value = true;
  const reloadPanel = targetScope === "panel" && ["i18n", "console"].includes(targetId);
  try {
    const values = JSON.parse(submittedSettings) as Record<string, unknown>;
    if (targetScope === "panel") {
      const { execute } = updatePluginSettings();
      recordResult((await execute({ params: { id: targetId }, data: values })).value);
    } else {
      const { execute } = updateNodePluginSettings();
      recordResult(
        (
          await execute({
            params: { daemonId: targetNode, id: targetId },
            data: values
          })
        ).value
      );
    }
    if (!lastResult.value || lastResult.value.application === "applied")
      notify(t("TXT_CODE_d3de39b4"), "success");
    const editedDuringSave = JSON.stringify(targetSchema.values) !== submittedSettings;
    if (schema.value === targetSchema) savedSettings.value = submittedSettings;
    if (reloadPanel && !editedDuringSave) {
      window.setTimeout(() => window.location.reload(), 400);
      return;
    }
    if (
      scope.value === targetScope &&
      selectedNodeId.value === targetNode &&
      currentId.value === targetId &&
      schema.value === targetSchema &&
      !editedDuringSave
    ) {
      await loadSchema();
    }
  } catch (error: any) {
    notifyError(error);
  } finally {
    savingSettings.value = false;
  }
};

const load = async () => {
  loading.value = true;
  try {
    const { execute } = pluginList();
    const res = await execute();
    plugins.value = res.value ?? [];
  } catch (error: any) {
    notifyError(error);
  } finally {
    loading.value = false;
  }
};

/**
 * The node routes exist only while `plugins/node` does, so a failure here is the
 * expected answer on a panel without it rather than something to shout about.
 */
const loadNodes = async () => {
  loading.value = true;
  nodeError.value = "";
  try {
    const { execute } = nodeList();
    const res = await execute();
    nodes.value = res.value ?? [];
    if (!nodes.value.some((item) => item.uuid === selectedNodeId.value)) {
      selectedNodeId.value = nodes.value.find((item) => item.available)?.uuid || "";
    }
  } catch (error: any) {
    nodes.value = [];
    selectedNodeId.value = "";
    nodeError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
};

const loadNodePlugins = async () => {
  if (disposed) return;
  const request = ++nodePluginsRequest;
  nodePlugins.value = [];
  if (!selectedNodeId.value) return;
  loading.value = true;
  nodeError.value = "";
  try {
    const { execute } = nodePluginList();
    const res = await execute({ params: { daemonId: selectedNodeId.value } });
    if (request === nodePluginsRequest) nodePlugins.value = res.value ?? [];
  } catch (error: any) {
    if (request === nodePluginsRequest) nodeError.value = error?.message ?? String(error);
  } finally {
    if (request === nodePluginsRequest) loading.value = false;
  }
};

/**
 * Toggling a plugin reconnects the node, because that is what makes a daemon
 * rebind its protocol events. The list is therefore re-read with a few retries:
 * the first attempt often lands while the socket is still coming back up.
 */
const reloadNodePluginsAfterToggle = async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (disposed) return;
    await loadNodePlugins();
    if (!nodeError.value) return;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
};

onMounted(() => {
  load();
  window.addEventListener("elementspanel:plugins-changed", load);
});
onUnmounted(() => {
  window.removeEventListener("elementspanel:plugins-changed", load);
  disposed = true;
  schemaRequest++;
  nodePluginsRequest++;
});

/**
 * Leaving must not drag this page's parameters into the next one. The shared
 * `toPage()` helper copies the current query along, and `scope`, `daemonId` and
 * `plugin` describe a plugin tab, not the page being opened — an instance page
 * would otherwise inherit a daemon it was never opened for. Only the values this
 * page contributed are dropped, so a link that asks for a key by another value
 * still gets it.
 */
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

watch(selectedNodeId, () => loadNodePlugins());

watch(
  () => [props.scope ?? route.query.scope, props.daemonId ?? route.query.daemonId, route.query.plugin],
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
  plugins,
  (value) => {
    if (!value.some((item) => item.id === selectedId.value)) {
      selectedId.value =
        value.find((item) => item.id === preferredPluginId.value)?.id || value[0]?.id || "";
    }
  },
  { immediate: true }
);

watch(nodePlugins, (value) => {
  if (!value.some((item) => item.id === nodeSelectedId.value)) {
    nodeSelectedId.value =
      value.find((item) => item.id === preferredPluginId.value)?.id || value[0]?.id || "";
  }
});

// Whatever is selected, its form comes from the backend that declared it.
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

/**
 * The address bar follows the open plugin, so a tab can be copied out of it and
 * reopened: `/plugins/config?scope=panel&plugin=<id>`, or with `daemonId` added
 * when the plugin belongs to a daemon.
 *
 * The rewrite deliberately skips the router. A router navigation runs the global
 * guard, which starts the top progress bar and leaves it on screen for a second
 * on every selection. A desktop window hosts this page inside the desktop route,
 * where the address bar belongs to the desktop, so nothing is written there.
 */
let lastSyncedPath = "";
const syncRoute = () => {
  if (route.path !== "/plugins/config") return;
  const query: Record<string, string> = { scope: scope.value };
  if (scope.value === "node" && selectedNodeId.value) query.daemonId = selectedNodeId.value;
  if (currentId.value) query.plugin = currentId.value;
  preferredPluginId.value = currentId.value;
  const fullPath = router.resolve({ query }).fullPath;
  if (fullPath === lastSyncedPath) return;
  lastSyncedPath = fullPath;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}#${fullPath}`);
};

watch([scope, currentId, selectedNodeId], syncRoute);

/** Read live inventories: node plugins may have been installed outside the market. */
const checkNodePlugins = async (candidate: PluginActionCandidate) => {
  if (
    candidate.scope !== "panel" ||
    !plugins.value.some((plugin) => plugin.id === "node" && plugin.enabled && plugin.running)
  )
    return;

  candidate.checkingNodes = true;
  try {
    const list = (await nodeList().execute()).value ?? [];
    if (disposed || actionCandidate.value !== candidate) return;
    const results = await Promise.allSettled(
      list.map(async (node) => {
        if (!node.available) throw new Error(t("TXT_CODE_PLUGIN_NODE_OFFLINE"));
        const inventory = (await nodePluginList().execute({ params: { daemonId: node.uuid } })).value;
        if (!Array.isArray(inventory)) throw new Error(t("TXT_CODE_PLUGIN_NODE_LIST_FAILED"));
        return inventory.find((plugin) => plugin.id === candidate.plugin.id);
      })
    );
    if (disposed || actionCandidate.value !== candidate) return;
    const unchecked: string[] = [];
    results.forEach((result, index) => {
      const node = list[index];
      if (result.status === "rejected") {
        unchecked.push(nodeLabel(node));
      } else if (result.value && (candidate.action === "remove" || result.value.enabled)) {
        candidate.nodeTargets.push({ node, plugin: result.value });
      }
    });
    if (unchecked.length)
      candidate.nodeCheckError = t("TXT_CODE_PLUGIN_NODE_CHECK_FAILED", {
        nodes: unchecked.join(", ")
      });
  } catch (error) {
    if (!disposed && actionCandidate.value === candidate)
      candidate.nodeCheckError = getValidatorErrorMsg(error, t("TXT_CODE_PLUGIN_NODE_LIST_FAILED"));
  } finally {
    candidate.checkingNodes = false;
  }
};

const requestAction = (plugin: PluginRecord | NodePluginRecord, action: PluginAction) => {
  if (disposed || actionBusy.value || (action === "remove" && !plugin.removable)) return;
  actionCandidate.value = {
    action,
    step: "confirm",
    scope: scope.value,
    plugin: { ...plugin },
    nodeId: selectedNodeId.value,
    checkingNodes: false,
    nodeTargets: [],
    selectedNodeIds: [],
    nodeCheckError: ""
  };
};

/** Finish node changes before the panel can unload its remote connection service. */
const syncNodePlugins = async (candidate: PluginActionCandidate) => {
  const targets = candidate.nodeTargets.filter(
    ({ node, plugin }) =>
      candidate.selectedNodeIds.includes(node.uuid) &&
      (candidate.action !== "remove" || plugin.removable)
  );
  const failures: string[] = [];
  for (const { node, plugin } of targets) {
    try {
      if (candidate.action === "remove") {
        await removeNodePlugin().execute({ params: { daemonId: node.uuid, id: plugin.id } });
        candidate.nodeTargets = candidate.nodeTargets.filter((target) => target.node.uuid !== node.uuid);
      } else {
        const result = (
          await setNodePluginEnabled().execute({
            params: { daemonId: node.uuid },
            data: { id: plugin.id, enabled: false }
          })
        ).value?.result;
        if (result && result.application !== "applied")
          throw new Error(
            result.error ||
              t(
                result.application === "restart-required"
                  ? "TXT_CODE_PLUGIN_RESTART_REQUIRED"
                  : result.application === "pending"
                  ? "TXT_CODE_PLUGIN_SAVED_PENDING"
                  : "TXT_CODE_PLUGIN_LOAD_FAILED"
              )
          );
      }
      // A panel failure can leave the dialog open for a retry. Do not repeat
      // successful removals against plugins that no longer exist on that node.
      candidate.selectedNodeIds = candidate.selectedNodeIds.filter((id) => id !== node.uuid);
    } catch (error) {
      failures.push(`${nodeLabel(node)}: ${getValidatorErrorMsg(error, t("TXT_CODE_6a365d01"))}`);
    }
  }
  if (failures.length)
    notify(t("TXT_CODE_PLUGIN_NODE_ACTION_FAILED", { nodes: failures.join("; ") }), "error");
  return failures.length === 0;
};

const apply = async (
  plugin: PluginRecord,
  enabled: boolean,
  candidate?: PluginActionCandidate
) => {
  pending.value = plugin.id;
  try {
    const nodesSucceeded = candidate ? await syncNodePlugins(candidate) : true;
    const { execute } = setPluginEnabled();
    recordResult((await execute({ data: { id: plugin.id, enabled } })).value?.result);
    // The panel has already applied the change to its own half. The browser
    // reconciles itself against the manifest, which now reflects the switch, so
    // the plugin's routes, cards and menus appear or disappear with it.
    await ctx.plugins.refresh();
    await load();
    if (nodesSucceeded && (!lastResult.value || lastResult.value.application === "applied"))
      notify(t(enabled ? "TXT_CODE_PLUGIN_ENABLED" : "TXT_CODE_PLUGIN_DISABLED"), "success");
  } catch (error: any) {
    notifyError(error);
    await load();
  } finally {
    pending.value = "";
  }
};

/**
 * The daemon applies the switch itself and answers with the updated record, so
 * there is nothing for the browser to reconcile 鈥?only the list to re-read.
 */
const applyNode = async (
  plugin: NodePluginRecord,
  enabled: boolean,
  daemonId = selectedNodeId.value
) => {
  pending.value = plugin.id;
  try {
    const { execute } = setNodePluginEnabled();
    recordResult(
      (
        await execute({
          params: { daemonId },
          data: { id: plugin.id, enabled }
        })
      ).value?.result
    );
    if (!lastResult.value || lastResult.value.application === "applied")
      notify(t(enabled ? "TXT_CODE_PLUGIN_ENABLED" : "TXT_CODE_PLUGIN_DISABLED"), "success");
  } catch (error: any) {
    notifyError(error);
  } finally {
    pending.value = "";
    await reloadNodePluginsAfterToggle();
  }
};

/**
 * Enabling is immediate; disabling asks first, because it removes whatever the
 * plugin contributed 鈥?including, for some plugins, authentication itself.
 */
const toggle = (plugin: PluginRecord | NodePluginRecord, enabled: boolean) => {
  if (actionBusy.value) return;
  const targetScope = scope.value;
  const nodeId = selectedNodeId.value;
  const commit = () =>
    targetScope === "panel"
      ? apply(plugin as PluginRecord, enabled)
      : applyNode(plugin as NodePluginRecord, enabled, nodeId);
  if (enabled) return commit();
  requestAction(plugin, "disable");
};

const toggleSelected = (enabled: boolean) => {
  if (selectedPlugin.value) toggle(selectedPlugin.value, enabled);
};

const confirmDisable = async () => {
  const candidate = actionCandidate.value;
  if (
    !candidate ||
    candidate.action !== "disable" ||
    candidate.checkingNodes ||
    actionSubmitting.value
  )
    return;
  if (candidate.scope === "panel")
    await apply(candidate.plugin as PluginRecord, false, candidate);
  else await applyNode(candidate.plugin as NodePluginRecord, false, candidate.nodeId);
  actionCandidate.value = null;
};

const confirmRemove = async () => {
  const candidate = actionCandidate.value;
  if (
    !candidate ||
    candidate.action !== "remove" ||
    !candidate.plugin.removable ||
    candidate.checkingNodes ||
    actionSubmitting.value
  )
    return;
  deletingPlugin.value = true;
  try {
    let nodesSucceeded = true;
    if (candidate.scope === "panel") {
      nodesSucceeded = await syncNodePlugins(candidate);
      const { execute } = removePlugin();
      await execute({ params: { id: candidate.plugin.id } });
      await ctx.plugins.refresh();
      await load();
    } else {
      const { execute } = removeNodePlugin();
      await execute({
        params: { daemonId: candidate.nodeId, id: candidate.plugin.id }
      });
      await reloadNodePluginsAfterToggle();
    }
    actionCandidate.value = null;
    if (nodesSucceeded) notify(t("TXT_CODE_PLUGIN_DELETED"), "success");
  } catch (error) {
    notifyError(error);
  } finally {
    deletingPlugin.value = false;
  }
};

const confirmAction = async () => {
  const candidate = actionCandidate.value;
  if (!candidate || candidate.checkingNodes || actionSubmitting.value) return;
  if (candidate.step === "confirm") {
    await checkNodePlugins(candidate);
    if (disposed || actionCandidate.value !== candidate) return;
    if (candidate.nodeTargets.length || candidate.nodeCheckError) {
      candidate.selectedNodeIds = candidate.nodeTargets
        .filter(({ plugin }) => candidate.action !== "remove" || plugin.removable)
        .map(({ node }) => node.uuid);
      candidate.step = "nodes";
      return;
    }
  }
  return candidate.action === "remove" ? confirmRemove() : confirmDisable();
};
</script>

<template>
  <VLayout class="plugin-config-page" @keydown.esc="sidebarOpen = false">
    <VProgressLinear v-if="loading" class="plugin-config-loading" color="primary" indeterminate />

    <component :is="isPhone ? VNavigationDrawer : 'aside'" v-bind="navigationProps">
      <div class="plugin-config-sidebar">
        <div v-if="isPhone" class="plugin-config-sidebar-title">
          <span>{{ t("TXT_CODE_PLUGIN_CONFIG") }}</span>
          <VBtn
            icon="mdi-close"
            size="small"
            variant="text"
            :aria-label="t('TXT_CODE_b1dedda3')"
            @click="sidebarOpen = false"
          />
        </div>
        <VBtnToggle v-model="scope" class="plugin-config-scope" mandatory>
          <VBtn value="panel" size="small" variant="text">{{
            t("TXT_CODE_PLUGIN_SCOPE_PANEL")
          }}</VBtn>
          <VBtn value="node" size="small" variant="text">{{ t("TXT_CODE_PLUGIN_SCOPE_NODE") }}</VBtn>
        </VBtnToggle>

        <VSelect
          v-if="scope === 'node'"
          v-model="selectedNodeId"
          class="plugin-config-node-select"
          :items="nodeItems"
          :loading="loading"
          :placeholder="t('TXT_CODE_PLUGIN_NODE_SELECT')"
          hide-details
        />

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
        <VList class="plugin-config-list" density="compact">
          <template v-for="group in pluginGroups" :key="group.id">
            <VListSubheader
              class="plugin-config-group-heading"
              :class="{ 'plugin-config-group-heading-over': dragOverGroupId === group.id }"
              @dragover.prevent="dragOverGroupId = group.id"
              @dragleave="dragOverGroupId = ''"
              @drop.prevent="dropPlugin(group.id)"
            >
              <span>{{ group.name }}</span>
              <span v-if="!group.unassigned" class="plugin-config-group-actions">
                <VBtn
                  icon="mdi-pencil-outline"
                  size="x-small"
                  variant="text"
                  :aria-label="t('TXT_CODE_PLUGIN_GROUP_RENAME')"
                  @click.stop="openRenameGroup(group)"
                />
                <VBtn
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  :aria-label="t('TXT_CODE_PLUGIN_GROUP_DELETE')"
                  @click.stop="requestRemoveGroup(group)"
                />
              </span>
            </VListSubheader>
            <VListItem
              v-for="plugin in group.plugins"
              :key="plugin.id"
              draggable="true"
              :active="plugin.id === currentId"
              :class="{ 'plugin-config-item-off': !plugin.enabled }"
              :title="pluginLabel(plugin.id)"
              @click="selectPlugin(plugin.id)"
              @dragstart="startPluginDrag(plugin.id, $event)"
              @dragend="endPluginDrag"
            >
              <template #append>
                <span
                  class="plugin-config-item-dot"
                  :class="{
                    'plugin-config-item-dot-off':
                      !plugin.enabled || (plugin.state && plugin.state !== 'active')
                  }"
                ></span>
              </template>
            </VListItem>
          </template>
          <div v-if="!currentList.length" class="plugin-config-empty">
            {{ t("TXT_CODE_NO_DATA") }}
          </div>
        </VList>

      </div>
    </component>

    <div class="plugin-config-content">
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
              :text="t(selectedPlugin.enabled ? 'TXT_CODE_PLUGIN_DISABLE' : 'TXT_CODE_PLUGIN_ENABLE')"
              location="top"
            >
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps">
                  <VBtn
                    icon="mdi-power"
                    :color="selectedPlugin.enabled ? 'warning' : 'success'"
                    variant="text"
                    :loading="pending === selectedPlugin.id"
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
                t(settingsDirty ? 'TXT_CODE_PLUGIN_SAVE_REMINDER' : 'TXT_CODE_PLUGIN_SAVE_SETTINGS')
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

      <div class="plugin-config-body">
        <VAlert
          v-if="scope === 'node' && nodeError"
          class="plugin-config-alert"
          type="warning"
          variant="tonal"
          :title="t('TXT_CODE_PLUGIN_NODE_LIST_FAILED')"
          :text="nodeError"
        />
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
            t("TXT_CODE_9277af78")
          }}</VBtn>
          <div v-if="schemaLoading" class="plugin-config-schema-loading">
            <VProgressCircular color="primary" indeterminate size="28" />
          </div>
          <div v-else-if="schema && schema.fields.length" class="plugin-config-form">
            <SchemaForm :fields="schema.fields" :values="schema.values" @save="saveSettings" />
          </div>
          <div v-else class="plugin-config-no-config">
            {{ t("TXT_CODE_PLUGIN_NO_CONFIG") }}
          </div>
        </template>
        <div v-else-if="!nodeError" class="plugin-config-no-config">{{ t("TXT_CODE_NO_DATA") }}</div>
      </div>
    </div>

    <VDialog v-model="actionConfirmOpen" :persistent="actionSubmitting" max-width="460">
      <VCard
        :title="
          t(
            actionCandidate?.action === 'remove'
              ? 'TXT_CODE_PLUGIN_DELETE_CONFIRM_TITLE'
              : 'TXT_CODE_PLUGIN_DISABLE_CONFIRM_TITLE',
            { name: pluginLabel(actionCandidate?.plugin.id) }
          )
        "
        class="plugin-config-confirm-card"
        rounded="xl"
      >
        <VCardText>
          {{
            t(
              actionCandidate?.action === "remove"
                ? "TXT_CODE_PLUGIN_DELETE_CONFIRM"
                : "TXT_CODE_PLUGIN_DISABLE_CONFIRM"
            )
          }}
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :disabled="actionSubmitting" @click="actionConfirmOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn
            color="error"
            :prepend-icon="actionCandidate?.action === 'remove' ? 'mdi-delete' : undefined"
            :loading="actionSubmitting || actionCandidate?.checkingNodes"
            :disabled="actionCandidate?.checkingNodes"
            @click="confirmAction"
          >
            {{
              t(
                actionCandidate?.action === "remove"
                  ? "TXT_CODE_PLUGIN_DELETE"
                  : "TXT_CODE_PLUGIN_DISABLE"
              )
            }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="nodePickerOpen" :persistent="actionSubmitting" max-width="480">
      <VCard :title="t('TXT_CODE_PLUGIN_NODE_SELECT')">
        <VCardText v-if="actionCandidate">
          <div v-if="actionCandidate.nodeTargets.length" class="mb-2">
            {{
              t(
                actionCandidate.action === "remove"
                  ? "TXT_CODE_PLUGIN_NODE_DELETE_CONFIRM"
                  : "TXT_CODE_PLUGIN_NODE_DISABLE_CONFIRM"
              )
            }}
          </div>
          <VAlert
            v-if="actionCandidate.nodeCheckError"
            class="mb-2"
            type="warning"
            variant="tonal"
            :text="actionCandidate.nodeCheckError"
          />
          <VCheckbox
            v-for="target in actionCandidate.nodeTargets"
            :key="target.node.uuid"
            v-model="actionCandidate.selectedNodeIds"
            :value="target.node.uuid"
            :label="nodeLabel(target.node)"
            :disabled="
              actionSubmitting ||
              (actionCandidate.action === 'remove' && !target.plugin.removable)
            "
            :messages="
              actionCandidate.action === 'remove' && !target.plugin.removable
                ? t('TXT_CODE_PLUGIN_DELETE_UNAVAILABLE')
                : undefined
            "
            :hide-details="actionCandidate.action !== 'remove' || target.plugin.removable"
            density="compact"
          />
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :disabled="actionSubmitting" @click="nodePickerOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn color="primary" :loading="actionSubmitting" @click="confirmAction">
            {{ t("TXT_CODE_d507abff") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

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
  </VLayout>
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
  background: var(--background-color-white);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--text-color);
}

:global(.desktop-container .plugin-config-page) {
  --plugin-config-surface-color: #ffffff;

  height: 100%;
  background: var(--plugin-config-surface-color);
}

:global(.app-dark-theme .desktop-container .plugin-config-page) {
  --plugin-config-surface-color: #1f1f27;
}

.plugin-config-navigation {
  flex: 0 0 240px;
  min-height: 0;
}

.plugin-config-navigation :deep(.v-navigation-drawer__content) {
  overflow: hidden;
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
  background: var(--background-color-white);
}

.plugin-config-sidebar-title {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-weight: 600;
}

:global(.desktop-container .plugin-config-sidebar),
:global(.desktop-container .plugin-config-content) {
  background: var(--plugin-config-surface-color);
}

.plugin-config-scope {
  display: flex;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 10px 12px;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.plugin-config-scope :deep(.v-btn) {
  flex: 1;
  min-height: 32px;
  border-radius: 24px;
  color: var(--text-color) !important;
  text-align: center;
}

:global(.app-dark-theme) .plugin-config-scope :deep(.v-btn) {
  color: #fff !important;
}

.plugin-config-scope :deep(.v-btn--active) {
  background: rgb(var(--v-theme-primary));
  color: #fff !important;
}

.plugin-config-node-select {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0 0 8px;
  box-sizing: border-box;
}

.plugin-config-node-select :deep(.v-input__control),
.plugin-config-node-select :deep(.v-field) {
  width: 100%;
  min-width: 0;
}

.plugin-config-node-select :deep(.v-field__input) {
  min-width: 0;
  overflow: hidden;
}

.plugin-config-node-select :deep(.v-select__selection-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.plugin-config-list {
  min-height: 0;
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-gutter: auto;
  background: transparent;
  padding: 0 10px 4px;
}

.plugin-config-list :deep(.v-list-item) {
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
  color: var(--text-color);
  font-size: 11px;
  font-weight: 600;
  opacity: 0.55;
}

.plugin-config-list :deep(.plugin-config-group-heading-over) {
  border-radius: 8px;
  background: rgba(22, 119, 255, 0.12);
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
  color: var(--text-color);
  opacity: 0.62;
}

.plugin-config-group-actions :deep(.v-icon) {
  font-size: 12px;
}

.plugin-config-group-actions :deep(.v-btn:hover) {
  opacity: 1;
}

.plugin-config-list :deep(.v-list-item[draggable="true"]) {
  cursor: grab;
}

.plugin-config-list :deep(.v-list-item[draggable="true"]:active) {
  cursor: grabbing;
}

.plugin-config-list :deep(.v-list-item__content) {
  min-width: 0;
  overflow: hidden;
}

.plugin-config-list :deep(.v-list-item-title) {
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

.plugin-config-empty,
.plugin-config-no-config {
  padding: 28px 12px;
  color: var(--text-color);
  font-size: 13px;
  opacity: 0.62;
  text-align: center;
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

.plugin-config-title-row h2 {
  margin: 0;
  color: var(--text-color);
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
  color: var(--text-color);
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

  .plugin-config-scope {
    flex: none;
    height: auto;
    padding: 0 0 12px;
  }

  .plugin-config-scope :deep(.v-btn) {
    min-width: 0;
    min-height: 44px;
    height: auto;
    padding: 8px;
  }

  .plugin-config-scope :deep(.v-btn__content) {
    white-space: normal;
    overflow-wrap: anywhere;
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
