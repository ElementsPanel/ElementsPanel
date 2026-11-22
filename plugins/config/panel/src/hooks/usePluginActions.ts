import { t } from "@elementspanel/epanel-plugin-i18n";
import { ctx, usePluginService, type FrontendPluginMarketService } from "@elements-panel/sdk";
import { getValidatorErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { computed, ref, type Ref } from "vue";
import {
  nodeList,
  nodePluginList,
  setPluginEnabled,
  setNodePluginEnabled,
  removePlugin,
  removeNodePlugin,
  type PluginRecord,
  type NodePluginRecord,
  type PluginChangeResult
} from "../api";
import { nodeLabel } from "../labels";
import { notify, notifyError } from "../notifications";
import type { Scope, PluginAction, PluginActionCandidate } from "../types";

interface Options {
  scope: Ref<Scope>;
  selectedNodeId: Ref<string>;
  currentId: Ref<string>;
  plugins: Ref<PluginRecord[]>;
  selectedPlugin: Ref<PluginRecord | NodePluginRecord | undefined>;
  pluginContextPlugin: Ref<PluginRecord | NodePluginRecord | undefined>;
  closePluginContextMenu: () => void;
  savingSettings: Ref<boolean>;
  resetCandidate: Ref<{ id: string; scope: Scope; nodeId: string } | null>;
  lastResult: Ref<PluginChangeResult | null>;
  recordResult: (result?: PluginChangeResult | boolean) => void;
  load: (quiet?: boolean) => Promise<void>;
  reloadNodePluginsAfterToggle: () => Promise<void>;
  isDisposed: () => boolean;
}
export function usePluginActions(options: Options) {
  const {
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
    load,
    reloadNodePluginsAfterToggle,
    isDisposed
  } = options;

  const pending = ref("");
  const deletingPlugin = ref(false);
  const actionCandidate = ref<PluginActionCandidate | null>(null);
  const actionSubmitting = computed(() =>
    Boolean(pending.value || deletingPlugin.value || savingSettings.value)
  );
  const actionBusy = computed(
    () => actionSubmitting.value || Boolean(actionCandidate.value || resetCandidate.value)
  );
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
  const nodeTargetItems = computed(() =>
    (actionCandidate.value?.nodeTargets ?? []).map((target) => ({
      value: target.node.uuid,
      title: nodeLabel(target.node),
      subtitle: target.node.remarks ? `${target.node.ip}:${target.node.port}` : undefined,
      disabled: actionCandidate.value?.action === "remove" && !target.plugin.removable,
      hint:
        actionCandidate.value?.action === "remove" && !target.plugin.removable
          ? t("TXT_CODE_PLUGIN_DELETE_UNAVAILABLE")
          : undefined
    }))
  );
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

  /** Re-read inventories to include plugins installed outside the market. */
  const checkNodePlugins = async (candidate: PluginActionCandidate) => {
    if (
      candidate.scope !== "panel" ||
      !plugins.value.some((plugin) => plugin.id === "node" && plugin.enabled && plugin.running)
    )
      return;

    candidate.checkingNodes = true;
    try {
      const list = (await nodeList().execute()).value ?? [];
      if (isDisposed() || actionCandidate.value !== candidate) return;
      const results = await Promise.allSettled(
        list.map(async (node) => {
          if (!node.available) throw new Error(t("TXT_CODE_PLUGIN_NODE_OFFLINE"));
          const inventory = (await nodePluginList().execute({ params: { daemonId: node.uuid } }))
            .value;
          if (!Array.isArray(inventory)) throw new Error(t("TXT_CODE_PLUGIN_NODE_LIST_FAILED"));
          return inventory.find((plugin) => plugin.id === candidate.plugin.id);
        })
      );
      if (isDisposed() || actionCandidate.value !== candidate) return;
      const unchecked: string[] = [];
      results.forEach((result, index) => {
        const node = list[index];
        if (result.status === "rejected") {
          unchecked.push(nodeLabel(node));
        } else if (
          result.value &&
          (candidate.action === "remove" ||
            result.value.enabled !== (candidate.action === "enable"))
        ) {
          candidate.nodeTargets.push({ node, plugin: result.value });
        }
      });
      if (unchecked.length)
        candidate.nodeCheckError = t("TXT_CODE_PLUGIN_NODE_CHECK_FAILED", {
          nodes: unchecked.join(", ")
        });
    } catch (error) {
      if (!isDisposed() && actionCandidate.value === candidate)
        candidate.nodeCheckError = getValidatorErrorMsg(
          error,
          t("TXT_CODE_PLUGIN_NODE_LIST_FAILED")
        );
    } finally {
      candidate.checkingNodes = false;
    }
  };

  const requestAction = (plugin: PluginRecord | NodePluginRecord, action: PluginAction) => {
    if (isDisposed() || actionBusy.value || (action === "remove" && !plugin.removable)) return;
    actionCandidate.value = {
      action,
      step: action === "enable" ? "checking" : "confirm",
      scope: scope.value,
      plugin: { ...plugin },
      nodeId: selectedNodeId.value,
      checkingNodes: false,
      nodeTargets: [],
      selectedNodeIds: [],
      nodeCheckError: "",
      removeConfig: false
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
          await removeNodePlugin().execute({
            params: {
              daemonId: node.uuid,
              id: plugin.id,
              ...(candidate.removeConfig ? { removeConfig: true } : {})
            },
            timeout: 11 * 60 * 1000
          });
          candidate.nodeTargets = candidate.nodeTargets.filter(
            (target) => target.node.uuid !== node.uuid
          );
        } else {
          const result = (
            await setNodePluginEnabled().execute({
              params: { daemonId: node.uuid },
              data: { id: plugin.id, enabled: candidate.action === "enable" }
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
        // Skip successful node changes when retrying a panel failure.
        candidate.selectedNodeIds = candidate.selectedNodeIds.filter((id) => id !== node.uuid);
      } catch (error) {
        failures.push(
          `${nodeLabel(node)}: ${getValidatorErrorMsg(
            error,
            t("TXT_CODE_COMMON_OPERATION_FAILED")
          )}`
        );
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

  const toggle = (plugin: PluginRecord | NodePluginRecord, enabled: boolean) => {
    if (isDisposed() || actionBusy.value) return;
    if (enabled && scope.value === "node")
      return applyNode(plugin as NodePluginRecord, true, selectedNodeId.value);
    requestAction(plugin, enabled ? "enable" : "disable");
    if (enabled) return confirmAction();
  };

  const toggleSelected = (enabled: boolean) => {
    if (selectedPlugin.value) toggle(selectedPlugin.value, enabled);
  };

  const toggleContextPlugin = () => {
    const plugin = pluginContextPlugin.value;
    closePluginContextMenu();
    if (plugin && !pending.value) return toggle(plugin, !plugin.enabled);
  };

  const confirmToggle = async () => {
    const candidate = actionCandidate.value;
    if (
      !candidate ||
      candidate.action === "remove" ||
      candidate.checkingNodes ||
      actionSubmitting.value
    )
      return;
    const enabled = candidate.action === "enable";
    if (candidate.scope === "panel")
      await apply(candidate.plugin as PluginRecord, enabled, candidate);
    else await applyNode(candidate.plugin as NodePluginRecord, enabled, candidate.nodeId);
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
    const finishDependencyChange =
      usePluginService<FrontendPluginMarketService>("pluginMarket")?.beginDependencyChange();
    deletingPlugin.value = true;
    try {
      let nodesSucceeded = true;
      if (candidate.scope === "panel") {
        nodesSucceeded = await syncNodePlugins(candidate);
        const { execute } = removePlugin();
        await execute({
          params: {
            id: candidate.plugin.id,
            ...(candidate.removeConfig ? { removeConfig: true } : {})
          },
          timeout: 11 * 60 * 1000
        });
        await ctx.plugins
          .refresh()
          .catch((error) => console.error("Failed to refresh plugins:", error));
        await load();
      } else {
        const { execute } = removeNodePlugin();
        await execute({
          params: {
            daemonId: candidate.nodeId,
            id: candidate.plugin.id,
            ...(candidate.removeConfig ? { removeConfig: true } : {})
          },
          timeout: 11 * 60 * 1000
        });
        await reloadNodePluginsAfterToggle();
      }
      actionCandidate.value = null;
      if (nodesSucceeded) notify(t("TXT_CODE_PLUGIN_DELETED"), "success");
    } catch (error) {
      notifyError(error);
    } finally {
      deletingPlugin.value = false;
      finishDependencyChange?.();
    }
  };

  const confirmAction = async () => {
    const candidate = actionCandidate.value;
    if (!candidate || candidate.checkingNodes || actionSubmitting.value) return;
    if (candidate.step !== "nodes") {
      await checkNodePlugins(candidate);
      if (isDisposed() || actionCandidate.value !== candidate) return;
      if (candidate.nodeTargets.length || candidate.nodeCheckError) {
        candidate.selectedNodeIds = candidate.nodeTargets
          .filter(({ plugin }) => candidate.action !== "remove" || plugin.removable)
          .map(({ node }) => node.uuid);
        candidate.step = "nodes";
        return;
      }
    }
    return candidate.action === "remove" ? confirmRemove() : confirmToggle();
  };

  return {
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
  };
}
