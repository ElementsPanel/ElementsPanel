import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import {
  pluginSettings,
  nodePluginSettings,
  updatePluginSettings,
  updateNodePluginSettings,
  resetPluginSettings,
  resetNodePluginSettings,
  type PluginRecord,
  type NodePluginRecord,
  type SettingsSchema,
  type PluginChangeResult
} from "../api";
import { notify, notifyError } from "../notifications";
import type { Scope } from "../types";

interface Options {
  scope: Ref<Scope>;
  selectedNodeId: Ref<string>;
  currentId: Ref<string>;
  pluginContextPlugin: Ref<PluginRecord | NodePluginRecord | undefined>;
  closePluginContextMenu: () => void;
  lastResult: Ref<PluginChangeResult | null>;
  recordResult: (result?: PluginChangeResult | boolean) => void;
  load: (quiet?: boolean) => Promise<void>;
  loadNodePlugins: (quiet?: boolean) => Promise<void>;
  isDisposed: () => boolean;
  isActionBusy: () => boolean;
  isActionSubmitting: () => boolean;
}
export function usePluginSettings(options: Options) {
  const {
    scope,
    selectedNodeId,
    currentId,
    pluginContextPlugin,
    closePluginContextMenu,
    lastResult,
    recordResult,
    load,
    loadNodePlugins,
    isDisposed,
    isActionBusy,
    isActionSubmitting
  } = options;

  const schema = ref<SettingsSchema | null>(null);
  const settingsPage = ref("");
  watch([scope, selectedNodeId, currentId], () => {
    settingsPage.value = "";
  });
  const savedSettings = ref("");
  const savedValues = computed<Record<string, unknown> | undefined>(() =>
    savedSettings.value ? JSON.parse(savedSettings.value) : undefined
  );
  const settingsDirty = computed(
    () => !!schema.value && JSON.stringify(schema.value.values) !== savedSettings.value
  );
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
  const savingSettings = ref(false);
  const resetCandidate = ref<{ id: string; scope: Scope; nodeId: string } | null>(null);
  const resetConfirmOpen = computed({
    get: () => Boolean(resetCandidate.value),
    set: (open: boolean) => {
      if (!open && !savingSettings.value) resetCandidate.value = null;
    }
  });
  watch([scope, selectedNodeId], () => {
    if (!savingSettings.value) resetCandidate.value = null;
  });
  const loadSchema = async () => {
    if (isDisposed()) return;
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
        const res = await execute({ params: { id }, forceRequest: true });
        if (request === schemaRequest) schema.value = res.value ?? null;
      } else {
        const { execute } = nodePluginSettings();
        const res = await execute({
          params: { daemonId: selectedNodeId.value, id },
          forceRequest: true
        });
        if (request === schemaRequest) schema.value = res.value ?? null;
      }
    } catch (error: any) {
      // Missing settings are normal; the inventory request reports connection failures.
      if (request === schemaRequest) schema.value = null;
    } finally {
      if (request === schemaRequest) schemaLoading.value = false;
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
      if (
        targetScope === "panel" &&
        (!lastResult.value || lastResult.value.application === "applied")
      ) {
        window.dispatchEvent(
          new CustomEvent("elementspanel:plugin-settings-changed", {
            detail: { id: targetId }
          })
        );
      }
      if (!lastResult.value || lastResult.value.application === "applied")
        notify(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"), "success");
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

  const requestResetContextPluginSettings = () => {
    const plugin = pluginContextPlugin.value;
    closePluginContextMenu();
    if (!plugin?.canResetSettings || isActionBusy()) return;
    resetCandidate.value = { id: plugin.id, scope: scope.value, nodeId: selectedNodeId.value };
  };

  const confirmResetSettings = async () => {
    const candidate = resetCandidate.value;
    if (!candidate || isActionSubmitting()) return;
    const { id: targetId, scope: targetScope, nodeId: targetNode } = candidate;
    savingSettings.value = true;
    try {
      const response =
        targetScope === "panel"
          ? await resetPluginSettings().execute({ params: { id: targetId } })
          : await resetNodePluginSettings().execute({
              params: { daemonId: targetNode, id: targetId }
            });
      const result = response.value;
      if (resetCandidate.value === candidate) resetCandidate.value = null;
      const currentTarget =
        scope.value === targetScope &&
        selectedNodeId.value === targetNode &&
        currentId.value === targetId;
      if (currentTarget) recordResult(result);
      else if (result?.application === "failed")
        notify(result.error || t("TXT_CODE_PLUGIN_LOAD_FAILED"), "error");
      if (!result || result.application === "applied") {
        notify(t("TXT_CODE_PLUGIN_SETTINGS_RESET"), "success");
        if (targetScope === "panel") {
          window.dispatchEvent(
            new CustomEvent("elementspanel:plugin-settings-changed", {
              detail: { id: targetId }
            })
          );
          if (["i18n", "console"].includes(targetId)) {
            window.setTimeout(() => window.location.reload(), 400);
            return;
          }
        }
      } else if (!currentTarget && result.application !== "failed") {
        notify(
          t(
            result.application === "pending"
              ? "TXT_CODE_PLUGIN_SAVED_PENDING"
              : "TXT_CODE_PLUGIN_RESTART_REQUIRED"
          ),
          "success"
        );
      }
      if (scope.value === targetScope && selectedNodeId.value === targetNode) {
        if (targetScope === "panel") await load(true);
        else await loadNodePlugins(true);
        if (
          scope.value === targetScope &&
          selectedNodeId.value === targetNode &&
          currentId.value === targetId
        )
          await loadSchema();
      }
    } catch (error) {
      notifyError(error);
    } finally {
      savingSettings.value = false;
    }
  };

  onUnmounted(() => {
    schemaRequest++;
  });

  return {
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
  };
}
