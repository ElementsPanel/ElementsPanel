import { t } from "@elementspanel/epanel-plugin-i18n";
import { getValidatorErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { computeNodeName } from "@elementspanel/epanel-plugin-console/tools/nodes";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { pluginMarketList, pluginMarketNodes, type MarketNode, type MarketPlugin } from "../api";
import type PluginMarketUpdates from "../components/PluginMarketUpdates.vue";
import { usePluginIcons } from "./usePluginIcons";
import { installedChange } from "../operations";

export function usePluginMarketList(
  props: { embedded?: boolean; daemonId?: string },
  events: { select?: (pluginId: string) => void; targetChange?: (daemonId: string) => void } = {}
) {
  const selectedDaemonId = ref(props.daemonId ?? "");
  const nodes = ref<MarketNode[]>([]);
  const nodesLoading = ref(false);
  const currentNode = computed(() =>
    nodes.value.find((node) => node.daemonId === selectedDaemonId.value)
  );
  const targetLabel = computed(() =>
    selectedDaemonId.value
      ? currentNode.value
        ? computeNodeName(
            currentNode.value.ip,
            currentNode.value.available,
            currentNode.value.remarks
          )
        : selectedDaemonId.value
      : t("TXT_CODE_PLUGIN_MARKET_CURRENT_PANEL")
  );
  const loading = ref(false);
  // Whether the last refresh failed: an empty list then means "unreachable", not "no plugins".
  const failed = ref(false);
  const failureMessage = ref("");
  const plugins = ref<MarketPlugin[]>([]);
  const keyword = ref<string | null>("");
  const currentPage = ref(1);
  const pageSize = ref(20);
  const activeTab = ref<"browse" | "updates">("browse");
  const updateView = ref<InstanceType<typeof PluginMarketUpdates>>();
  const updatesLoading = ref(false);
  const { icons, load } = usePluginIcons();
  let requestId = 0;
  let nodesRequestId = 0;

  const visiblePlugins = computed(() => {
    const q = (keyword.value ?? "").trim().toLowerCase();
    if (!q) return plugins.value;
    return plugins.value.filter((plugin) =>
      [plugin.displayName, plugin.name, plugin.summary].some((field) =>
        String(field ?? "")
          .toLowerCase()
          .includes(q)
      )
    );
  });

  const totalItems = computed(() =>
    activeTab.value === "updates"
      ? updateView.value?.totalUpdates ?? 0
      : visiblePlugins.value.length
  );
  const totalPages = computed(() =>
    Math.max(1, Math.ceil(totalItems.value / pageSize.value))
  );
  const pagedPlugins = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return visiblePlugins.value.slice(start, start + pageSize.value);
  });

  watch([keyword, pageSize, activeTab], () => {
    currentPage.value = 1;
  });
  watch(totalPages, (pages) => {
    currentPage.value = Math.min(currentPage.value, pages);
  });

  watch(
    pagedPlugins,
    (list) => {
      for (const plugin of list)
        void load(plugin.id, Boolean(plugin.iconUrl), plugin.latestVersion?.version);
    },
    { immediate: true }
  );

  async function refresh() {
    const request = ++requestId;
    loading.value = true;
    try {
      const { execute } = pluginMarketList();
      const daemonId = selectedDaemonId.value;
      const response = await execute({ params: { daemonId }, forceRequest: true, timeout: 60000 });
      if (request === requestId) {
        plugins.value = (response.value ?? []).map((plugin) => ({
          ...plugin,
          targetDaemonId: daemonId
        }));
        failed.value = false;
        failureMessage.value = "";
      }
    } catch (error) {
      if (request === requestId) {
        failed.value = true;
        failureMessage.value = getValidatorErrorMsg(error);
        message.error(failureMessage.value);
      }
    } finally {
      if (request === requestId) loading.value = false;
    }
  }

  async function refreshNodes() {
    const request = ++nodesRequestId;
    nodesLoading.value = true;
    try {
      const response = await pluginMarketNodes().execute({ forceRequest: true });
      if (request === nodesRequestId) nodes.value = response.value ?? [];
    } catch (error) {
      if (request === nodesRequestId) message.error(getValidatorErrorMsg(error));
    } finally {
      if (request === nodesRequestId) nodesLoading.value = false;
    }
  }

  function refreshActive() {
    void refreshNodes();
    if (activeTab.value === "updates") void updateView.value?.refresh();
    else void refresh();
  }

  watch(
    () => props.daemonId,
    (daemonId) => {
      if (daemonId !== undefined) selectedDaemonId.value = daemonId;
    }
  );
  watch(selectedDaemonId, (daemonId) => {
    currentPage.value = 1;
    plugins.value = [];
    failed.value = false;
    events.targetChange?.(daemonId);
    void refresh();
  });

  function selectPlugin(plugin: MarketPlugin) {
    if (props.embedded) events.select?.(plugin.id);
  }

  function onCardKeydown(event: KeyboardEvent, plugin: MarketPlugin) {
    if (event.target !== event.currentTarget) return;
    if (!props.embedded || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    selectPlugin(plugin);
  }

  function updateInstalled(pluginId: string, version: string | undefined) {
    const plugin = plugins.value.find((item) => item.id === pluginId);
    if (plugin) plugin.installedVersion = version;
  }

  watch(installedChange, (change) => {
    if (change && (change.daemonId === undefined || change.daemonId === selectedDaemonId.value))
      void refresh();
  });
  onMounted(() => {
    void refresh();
    void refreshNodes();
  });
  onBeforeUnmount(() => {
    requestId++;
    nodesRequestId++;
  });

  return {
    selectedDaemonId,
    nodes,
    nodesLoading,
    currentNode,
    targetLabel,
    loading,
    failed,
    failureMessage,
    plugins,
    keyword,
    currentPage,
    pageSize,
    activeTab,
    updateView,
    updatesLoading,
    icons,
    visiblePlugins,
    totalItems,
    totalPages,
    pagedPlugins,
    refresh,
    refreshNodes,
    refreshActive,
    selectPlugin,
    onCardKeydown,
    updateInstalled
  };
}
