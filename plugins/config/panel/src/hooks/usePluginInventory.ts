import { onMounted, onUnmounted, ref, type Ref } from "vue";
import {
  nodeList,
  nodePluginList,
  pluginList,
  type NodeSummary,
  type NodePluginRecord,
  type PluginRecord
} from "../api";
import { notifyError } from "../notifications";
import type { Scope } from "../types";

interface Options {
  scope: Ref<Scope>;
  selectedNodeId: Ref<string>;
  isBusy: () => boolean;
}

export function usePluginInventory({ scope, selectedNodeId, isBusy }: Options) {
  const loading = ref(true);
  const plugins = ref<PluginRecord[]>([]);

  const nodes = ref<NodeSummary[]>([]);
  const nodesLoading = ref(false);
  const nodePlugins = ref<NodePluginRecord[]>([]);
  const nodeError = ref("");

  let nodePluginsRequest = 0;
  let pluginsRequest = 0;
  let inventoryTimer: ReturnType<typeof setInterval> | undefined;
  let refreshingInventory = false;
  let disposed = false;
  const load = async (quiet = false) => {
    if (disposed) return;
    const request = ++pluginsRequest;
    if (!quiet) loading.value = true;
    try {
      const res = await pluginList().execute({ forceRequest: true });
      if (
        !disposed &&
        request === pluginsRequest &&
        JSON.stringify(plugins.value) !== JSON.stringify(res.value ?? [])
      )
        plugins.value = res.value ?? [];
    } catch (error: any) {
      if (!quiet && !disposed) notifyError(error);
    } finally {
      if (!quiet && request === pluginsRequest) loading.value = false;
    }
  };

  async function loadNodes() {
    if (nodesLoading.value || disposed) return;
    nodesLoading.value = true;
    nodeError.value = "";
    try {
      const { execute } = nodeList();
      const res = await execute({ forceRequest: true });
      if (disposed) return;
      nodes.value = res.value ?? [];
      if (
        scope.value === "node" &&
        !nodes.value.some((item) => item.uuid === selectedNodeId.value)
      ) {
        selectedNodeId.value = nodes.value.find((item) => item.available)?.uuid || "";
      }
    } catch (error: any) {
      if (disposed) return;
      nodes.value = [];
      if (scope.value === "node") selectedNodeId.value = "";
      nodeError.value = error?.message ?? String(error);
    } finally {
      nodesLoading.value = false;
    }
  }

  const loadNodePlugins = async (quiet = false) => {
    if (disposed) return;
    const request = ++nodePluginsRequest;
    if (!quiet) nodePlugins.value = [];
    if (!selectedNodeId.value) return;
    if (!quiet) loading.value = true;
    nodeError.value = "";
    try {
      const { execute } = nodePluginList();
      const res = await execute({ params: { daemonId: selectedNodeId.value }, forceRequest: true });
      if (
        !disposed &&
        request === nodePluginsRequest &&
        JSON.stringify(nodePlugins.value) !== JSON.stringify(res.value ?? [])
      )
        nodePlugins.value = res.value ?? [];
    } catch (error: any) {
      if (request === nodePluginsRequest) nodeError.value = error?.message ?? String(error);
    } finally {
      if (!quiet && request === nodePluginsRequest) loading.value = false;
    }
  };

  const reloadNodePluginsAfterToggle = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (disposed) return;
      await loadNodePlugins();
      if (!nodeError.value) return;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  };

  const refreshInventory = async () => {
    if (disposed || refreshingInventory || loading.value || isBusy()) return;
    refreshingInventory = true;
    try {
      if (scope.value === "panel") await load(true);
      else await loadNodePlugins(true);
    } finally {
      refreshingInventory = false;
    }
  };

  onMounted(() => {
    load();
    window.addEventListener("elementspanel:plugins-changed", refreshInventory);
    inventoryTimer = setInterval(refreshInventory, 4000);
  });
  onUnmounted(() => {
    window.removeEventListener("elementspanel:plugins-changed", refreshInventory);
    clearInterval(inventoryTimer);
    pluginsRequest++;
    disposed = true;
    nodePluginsRequest++;
  });

  return {
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
    isDisposed: () => disposed
  };
}
