import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, nextTick, onUnmounted, ref, watch, type Ref } from "vue";
import {
  pluginGroupList,
  nodePluginGroupList,
  updatePluginGroupList,
  updateNodePluginGroupList,
  type PluginGroup,
  type PluginRecord,
  type NodePluginRecord
} from "../api";
import { notifyError } from "../notifications";
import type { Scope, PluginGroupView } from "../types";

interface Options {
  scope: Ref<Scope>;
  selectedNodeId: Ref<string>;
  currentList: Ref<Array<PluginRecord | NodePluginRecord>>;
}
export function usePluginGroups(options: Options) {
  const { scope, selectedNodeId, currentList } = options;

  const UNASSIGNED_GROUP_ID = "__unassigned__";
  const pluginGroupsState = ref<PluginGroup[]>([]);
  const pluginGroupsLoading = ref(true);
  const pluginContextMenu = ref({ open: false, x: 0, y: 0, pluginId: "" });
  const pluginContextPlugin = computed(() =>
    currentList.value.find((plugin) => plugin.id === pluginContextMenu.value.pluginId)
  );
  const groupDialogOpen = ref(false);
  const groupDialogMode = ref<"create" | "rename">("create");
  const groupDialogName = ref("");
  const editingGroupId = ref("");
  const groupDeleteConfirmOpen = ref(false);
  const groupDeleteCandidate = ref<PluginGroupView | null>(null);

  let groupsRequest = 0;

  const loadPluginGroups = async () => {
    const request = ++groupsRequest;
    pluginGroupsLoading.value = true;
    pluginGroupsState.value = [];
    if (scope.value === "node" && !selectedNodeId.value) {
      pluginGroupsLoading.value = false;
      return;
    }
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
    } finally {
      if (request === groupsRequest) pluginGroupsLoading.value = false;
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

  const pluginContextGroups = computed(() => {
    const currentGroupId =
      pluginGroups.value.find((group) =>
        group.plugins.some((plugin) => plugin.id === pluginContextMenu.value.pluginId)
      )?.id ?? UNASSIGNED_GROUP_ID;
    return [
      ...pluginGroupsState.value.map((group) => ({ id: group.id, name: group.name })),
      { id: UNASSIGNED_GROUP_ID, name: t("TXT_CODE_PLUGIN_GROUP_UNASSIGNED") }
    ].map((group) => ({ ...group, current: group.id === currentGroupId }));
  });

  const closePluginContextMenu = () => {
    pluginContextMenu.value.open = false;
    pluginContextMenu.value.pluginId = "";
  };

  const openPluginContextMenu = async (pluginId: string, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    pluginContextMenu.value = { open: false, x: event.clientX, y: event.clientY, pluginId };
    await nextTick();
    if (
      pluginContextMenu.value.pluginId === pluginId &&
      currentList.value.some((plugin) => plugin.id === pluginId)
    ) {
      pluginContextMenu.value.open = true;
    }
  };

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

  const moveContextPluginToGroup = (groupId: string) => {
    const pluginId = pluginContextMenu.value.pluginId;
    const group = pluginContextGroups.value.find((item) => item.id === groupId);
    closePluginContextMenu();
    if (!group || group.current || !currentList.value.some((plugin) => plugin.id === pluginId))
      return;
    movePluginToGroup(pluginId, groupId);
  };

  onUnmounted(() => {
    groupsRequest++;
  });

  return {
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
  };
}
