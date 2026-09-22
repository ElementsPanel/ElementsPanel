import { useOverviewInfo, type ComputedNodeInfo } from "@/hooks/useOverviewInfo";
import { computed, ref, watch } from "vue";
import {
  addNode as addNodeApi,
  connectNode,
  deleteNode as deleteNodeApi,
  editNode as editNodeApi
} from "../api";

export interface RemoteNodeDetail {
  ip: string;
  port: number;
  prefix: string;
  remarks: string;
  apiKey?: string;
  language: string;
  uploadSpeedRate: number;
  downloadSpeedRate: number;
  portRangeStart: number;
  portRangeEnd: number;
  portAssignInterval: number;
  enableSoftShutdown: boolean;
  softShutdownSkipDocker: boolean;
  softShutdownWaitSeconds: number;
}

export function useRemoteNode(options: { poll?: boolean } = {}) {
  const operationForm = ref({ name: "", current: 1, pageSize: 8, total: 0 });
  const ALL = "all";
  const currentStatus = ref<any>(ALL);
  const { state, refresh, isLoading: refreshLoading } = useOverviewInfo(options);

  const filterByName = (node: ComputedNodeInfo) =>
    operationForm.value.name !== ""
      ? node.remarks.toLowerCase().includes(operationForm.value.name.toLowerCase())
      : true;

  const filteredNodes = computed(
    () =>
      state.value?.remote?.filter(
        (node) =>
          (currentStatus.value === ALL || node.available === currentStatus.value) &&
          filterByName(node)
      ) || []
  );

  watch(
    () => [filteredNodes.value.length, operationForm.value.pageSize, operationForm.value.current],
    ([total, pageSize, current]) => {
      operationForm.value.total = total;
      const lastPage = Math.max(1, Math.ceil(total / pageSize));
      operationForm.value.current = Math.min(Math.max(1, current), lastPage);
    },
    { immediate: true }
  );

  const remoteNodes = computed(() => {
    const startIndex = (operationForm.value.current - 1) * operationForm.value.pageSize;
    return filteredNodes.value.slice(startIndex, startIndex + operationForm.value.pageSize);
  });

  const addNode = async (data: any) => {
    await addNodeApi().execute({ data });
    await refresh(true);
  };

  const deleteNode = async (uuid: string) => {
    await deleteNodeApi().execute({ params: { uuid } });
    await refresh(true);
  };

  const updateNode = async (uuid: string, data: any) => {
    const { execute } = editNodeApi();
    const { execute: tryConnectNode } = connectNode();
    await execute({ params: { uuid }, data });
    await tryConnectNode({ params: { uuid } });
    await refresh(true);
  };

  return {
    response: state,
    remoteNodes,
    operationForm,
    currentStatus,
    refreshLoading,
    refresh,
    addNode,
    deleteNode,
    updateNode
  };
}
