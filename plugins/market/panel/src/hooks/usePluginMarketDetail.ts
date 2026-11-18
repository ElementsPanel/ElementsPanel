import { getCurrentLang, t } from "@elementspanel/epanel-plugin-i18n";
import { markdownToHTML } from "@elementspanel/epanel-plugin-console/tools/safe";
import { getValidatorErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { pluginMarketDetail, type MarketPluginDetail } from "../api";
import { usePluginIcons } from "./usePluginIcons";
import { installedChange } from "../operations";

export function usePluginMarketDetail(
  props: { pluginId: string; daemonId?: string },
  onInstalled: (pluginId: string, version: string | undefined) => void
) {
  const plugin = ref<MarketPluginDetail>();
  const loading = ref(false);
  const busy = ref(false);
  const error = ref("");
  const activeTab = ref<"readme" | "versions" | "updates">("readme");
  let requestId = 0;
  // Keep every action for this plugin disabled until the active action settles.
  let running = 0;
  let refreshPending = false;

  const { icons, load } = usePluginIcons();
  const icon = computed(() => (plugin.value ? icons.value[plugin.value.id] : undefined));

  const readme = computed(() =>
    markdownToHTML(plugin.value?.readme || plugin.value?.description || "")
  );
  // Parse release notes once per loaded plugin.
  const changelogs = computed(() =>
    (plugin.value?.versions ?? []).map((version) => ({
      version,
      html: markdownToHTML(version.changelog || "")
    }))
  );

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString(getCurrentLang().replace("_", "-"));
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /** Keep the current plugin visible during refresh; clear it only when selecting another plugin. */
  async function refresh() {
    if (busy.value && plugin.value?.id === props.pluginId) return;
    const currentRequest = ++requestId;
    loading.value = true;
    error.value = "";
    if (plugin.value?.id !== props.pluginId) plugin.value = undefined;
    running = 0;
    busy.value = false;
    try {
      const { execute } = pluginMarketDetail();
      const response = await execute({
        params: {
          pluginId: props.pluginId,
          ...(props.daemonId !== undefined ? { daemonId: props.daemonId } : {})
        },
        forceRequest: true
      });
      if (currentRequest !== requestId) return;
      if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_NOT_FOUND"));
      plugin.value = response.value;
      void load(
        response.value.id,
        Boolean(response.value.iconUrl),
        response.value.selectedVersion.version
      );
    } catch (err) {
      if (currentRequest === requestId) error.value = getValidatorErrorMsg(err);
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function trackBusy(value: boolean) {
    running = Math.max(0, running + (value ? 1 : -1));
    busy.value = running > 0;
  }

  function updateInstalled(pluginId: string, version: string | undefined) {
    if (plugin.value?.id === pluginId) plugin.value.installedVersion = version;
    onInstalled(pluginId, version);
  }
  watch(installedChange, (change) => {
    if (!change || change.pluginId !== props.pluginId) return;
    if (props.daemonId === undefined) updateInstalled(change.pluginId, change.version);
    else if (change.daemonId === undefined || change.daemonId === props.daemonId) {
      if (busy.value) refreshPending = true;
      else void refresh();
    }
  });
  watch(busy, (value) => {
    if (!value && refreshPending) {
      refreshPending = false;
      void refresh();
    }
  });

  watch(
    () => [props.pluginId, props.daemonId],
    () => {
      plugin.value = undefined;
      refreshPending = false;
      void refresh();
    },
    { immediate: true }
  );
  watch(
    () => props.pluginId,
    () => {
      activeTab.value = "readme";
    }
  );
  onBeforeUnmount(() => requestId++);

  return {
    plugin,
    loading,
    busy,
    error,
    activeTab,
    icons,
    icon,
    readme,
    changelogs,
    formatDate,
    formatSize,
    refresh,
    trackBusy,
    updateInstalled
  };
}
