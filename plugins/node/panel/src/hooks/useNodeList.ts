import { computed, ref } from "vue";
import { useOverviewInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { usePolling } from "@elementspanel/epanel-plugin-console/hooks/usePolling";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import type { NodeStatus } from "@elementspanel/epanel-plugin-console/types";
import { remoteNodeList } from "../api";
import { useNodeSockets } from "./useNodeSockets";

export function useNodeList() {
  const { execute: fetchNodesApi, isLoading: loading } = remoteNodeList();
  const { execute: fetchNodesSilentApi } = remoteNodeList();
  const { state: allDaemonData } = useOverviewInfo();
  const nodes = ref<NodeStatus[]>([]);
  const searchQuery = ref("");
  const sockets = useNodeSockets({ nodes });
  const { socketStatusMap, testAllSockets } = sockets;
  let latestFetch = 0;
  const nodeCompatMap = computed<Record<string, IPanelNodeCompatibility | undefined>>(() => {
    const map: Record<string, IPanelNodeCompatibility | undefined> = {};
    const remotes = allDaemonData.value?.remote;
    if (remotes) {
      for (const remote of remotes) {
        map[remote.uuid] = remote.compatibility;
      }
    }
    return map;
  });

  let firstRefresh = true;
  usePolling(async () => {
    if (firstRefresh) {
      firstRefresh = false;
      await fetchNodes();
    } else {
      await fetchNodes(true);
    }
  }, 3000);

  const fetchNodes = async (silent = false) => {
    const request = ++latestFetch;
    try {
      const res = await (silent ? fetchNodesSilentApi : fetchNodesApi)({ forceRequest: !silent });
      if (sockets.isDisposed() || request !== latestFetch || !res.value) return;
      for (const previous of nodes.value) {
        const current = res.value.find((node) => node.uuid === previous.uuid);
        sockets.invalidate(previous, current);
      }
      nodes.value = res.value;
      await testAllSockets();
    } catch (error) {
      if (!silent && !sockets.isDisposed() && request === latestFetch) reportErrorMsg(error);
    }
  };

  const filteredNodes = computed(() => {
    if (!searchQuery.value) return nodes.value;
    const q = searchQuery.value.toLowerCase();
    return nodes.value.filter(
      (n) => n.remarks.toLowerCase().includes(q) || n.ip.toLowerCase().includes(q)
    );
  });

  return { loading, nodes, searchQuery, nodeCompatMap, socketStatusMap, fetchNodes, filteredNodes };
}
