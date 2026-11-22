import { computed, onUnmounted, reactive, ref, shallowRef, watch } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { usePluginService } from "@elements-panel/sdk";
import {
  remoteInstances,
  remoteNodeList
} from "@elementspanel/epanel-plugin-console/services/apis";
import { computeNodeName } from "@elementspanel/epanel-plugin-console/tools/nodes";
import { notifyDesktop } from "@elementspanel/epanel-plugin-console/tools/desktopNotice";
import type { NodeStatus } from "@elementspanel/epanel-plugin-console/types";
import type { BaseUserInfo, UserInstance } from "@elementspanel/epanel-plugin-console/types/user";
import { useUserGrants } from "./useUserGrants";

interface Options {
  fetchUsers: () => Promise<void>;
}

export function useUserAssignments(options: Options) {
  const { fetchUsers } = options;

  const showAssignDialog = ref(false);
  const assignTargetUser = ref<BaseUserInfo | null>(null);
  const grants = useUserGrants();
  const assignedInstances = grants.instances;
  const assignSaving = ref(false);

  const instanceService = computed(() => usePluginService("instance"));
  const nodeService = computed(() => usePluginService("node"));
  const canAssignInstances = computed(() => !!instanceService.value && !!nodeService.value);
  // Only create domain requests while the optional resource-assignment UI is open.
  const nodeRequest = shallowRef<ReturnType<typeof remoteNodeList>>();
  const instanceRequest = shallowRef<ReturnType<typeof remoteInstances>>();
  const nodes = computed(() => nodeRequest.value?.state.value);
  const instances = computed(() => instanceRequest.value?.state.value);
  const instancesLoading = computed(() => instanceRequest.value?.isLoading.value ?? false);
  let assignmentRequest = 0;
  const currentRemoteNode = ref<NodeStatus>();
  const currentRemoteNodeId = ref("");
  const assignNodeItems = computed(() =>
    (nodes.value || []).map((node) => ({
      title: computeNodeName(node.ip, node.available, node.remarks),
      value: node.uuid,
      disabled: !node.available
    }))
  );
  const assignForm = reactive({
    instanceName: "",
    currentPage: 1,
    pageSize: 10,
    status: ""
  });

  const openAssignDialog = async (user: BaseUserInfo) => {
    if (!canAssignInstances.value) return;
    const request = ++assignmentRequest;
    nodeRequest.value = remoteNodeList();
    instanceRequest.value = remoteInstances();
    assignTargetUser.value = user;
    try {
      await grants.load(user.uuid, {
        map: (items) =>
          items.map((inst) => ({
            instanceUuid: inst.instanceUuid,
            daemonId: inst.daemonId,
            nickname: inst.nickname || inst.config?.nickname || t("TXT_CODE_DESKTOP_IM_UNNAMED"),
            status: inst.status ?? 0,
            hostIp: inst.hostIp || ""
          }))
      });
      if (request !== assignmentRequest) return;
    } catch {
      if (request !== assignmentRequest) return;
      assignedInstances.value = user.instances ? [...user.instances] : [];
    }
    assignForm.instanceName = "";
    assignForm.currentPage = 1;
    assignForm.status = "";
    showAssignDialog.value = true;

    await initAssignNodes();
  };

  const closeAssignDialog = () => {
    assignmentRequest++;
    showAssignDialog.value = false;
    assignTargetUser.value = null;
    grants.clear();
    nodeRequest.value = undefined;
    instanceRequest.value = undefined;
    currentRemoteNode.value = undefined;
    currentRemoteNodeId.value = "";
  };

  watch([instanceService, nodeService], closeAssignDialog, { flush: "sync" });
  onUnmounted(closeAssignDialog);

  const initAssignNodes = async () => {
    const request = assignmentRequest;
    await nodeRequest.value?.execute();
    if (request !== assignmentRequest) return;
    if (nodes?.value?.length) {
      nodes.value.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
      currentRemoteNode.value = nodes.value[0];
      currentRemoteNodeId.value = nodes.value[0].uuid;
      await loadRemoteInstances();
    }
  };

  const loadRemoteInstances = async () => {
    if (!currentRemoteNode.value) return;
    try {
      await instanceRequest.value?.execute({
        params: {
          daemonId: currentRemoteNode.value.uuid,
          page: assignForm.currentPage,
          page_size: assignForm.pageSize,
          instance_name: assignForm.instanceName.trim(),
          status: assignForm.status
        }
      });
    } catch {
      // Keep the existing assignments when fetching fails.
    }
  };

  const handleAssignNodeChange = async (nodeId: string) => {
    const node = nodes.value?.find((item) => item.uuid === nodeId);
    if (!node) return;
    currentRemoteNode.value = node;
    currentRemoteNodeId.value = node.uuid;
    assignForm.currentPage = 1;
    await loadRemoteInstances();
  };

  const handleAssignSearch = async () => {
    assignForm.currentPage = 1;
    await loadRemoteInstances();
  };

  const isInstanceAssigned = (instanceUuid: string): boolean => {
    return assignedInstances.value.some((i) => i.instanceUuid === instanceUuid);
  };

  const addAssignedInstance = (instance: UserInstance) => {
    if (!isInstanceAssigned(instance.instanceUuid)) {
      assignedInstances.value.push(instance);
    }
  };

  const removeAssignedInstance = (instanceUuid: string) => {
    assignedInstances.value = assignedInstances.value.filter(
      (i) => i.instanceUuid !== instanceUuid
    );
  };

  const saveAssignedInstances = async () => {
    if (!assignTargetUser.value || !canAssignInstances.value) return;
    assignSaving.value = true;
    try {
      await grants.save(assignTargetUser.value.uuid);
      notifyDesktop(t("TXT_CODE_DESKTOP_USERS_ASSIGN_SUCCESS"), "success");
      showAssignDialog.value = false;
      assignTargetUser.value = null;
      assignedInstances.value = [];
      fetchUsers();
    } catch (e: any) {
      notifyDesktop(e?.message || "Error", "error");
    } finally {
      assignSaving.value = false;
    }
  };

  return {
    showAssignDialog,
    assignTargetUser,
    assignedInstances,
    assignSaving,
    instanceService,
    nodeService,
    canAssignInstances,
    nodeRequest,
    instanceRequest,
    nodes,
    instances,
    instancesLoading,
    currentRemoteNode,
    currentRemoteNodeId,
    assignNodeItems,
    assignForm,
    openAssignDialog,
    closeAssignDialog,
    initAssignNodes,
    loadRemoteInstances,
    handleAssignNodeChange,
    handleAssignSearch,
    isInstanceAssigned,
    addAssignedInstance,
    removeAssignedInstance,
    saveAssignedInstances
  };
}
