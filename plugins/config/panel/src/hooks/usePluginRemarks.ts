import { t } from "@elementspanel/epanel-plugin-i18n";
import { onUnmounted, ref, watch, type Ref } from "vue";
import {
  pluginRemarkList,
  updatePluginRemark,
  type PluginRecord,
  type NodePluginRecord
} from "../api";
import { notify, notifyError } from "../notifications";
import type { Scope } from "../types";

interface Options {
  scope: Ref<Scope>;
  selectedNodeId: Ref<string>;
  pluginContextPlugin: Ref<PluginRecord | NodePluginRecord | undefined>;
  closePluginContextMenu: () => void;
}
export function usePluginRemarks(options: Options) {
  const { scope, selectedNodeId, pluginContextPlugin, closePluginContextMenu } = options;

  const pluginRemarks = ref(new Map<string, string>());
  const remarksLoading = ref(false);
  const savingRemark = ref(false);
  const remarkDialog = ref({
    open: false,
    pluginId: "",
    remarks: "",
    scope: "panel" as Scope,
    nodeId: ""
  });
  let remarksRequest = 0;

  const loadPluginRemarks = async () => {
    const request = ++remarksRequest;
    pluginRemarks.value = new Map();
    if (scope.value === "node" && !selectedNodeId.value) {
      remarksLoading.value = false;
      return;
    }
    remarksLoading.value = true;
    try {
      const stored = (
        await pluginRemarkList().execute({
          params: scope.value === "node" ? { daemonId: selectedNodeId.value } : undefined,
          forceRequest: true
        })
      ).value;
      if (request === remarksRequest) {
        pluginRemarks.value = new Map((stored ?? []).map((entry) => [entry.id, entry.remarks]));
      }
    } catch (error) {
      if (request === remarksRequest) notifyError(error);
    } finally {
      if (request === remarksRequest) remarksLoading.value = false;
    }
  };

  const editContextPluginRemark = () => {
    const plugin = pluginContextPlugin.value;
    closePluginContextMenu();
    if (!plugin || remarksLoading.value || savingRemark.value) return;
    remarkDialog.value = {
      open: true,
      pluginId: plugin.id,
      remarks: (pluginRemarks.value.get(plugin.id) ?? "").replace(/[\r\n]+/g, " "),
      scope: scope.value,
      nodeId: selectedNodeId.value
    };
  };

  const savePluginRemark = async () => {
    const dialog = remarkDialog.value;
    if (!dialog.pluginId || savingRemark.value) return;
    const remarks = String(dialog.remarks ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim();
    savingRemark.value = true;
    try {
      await updatePluginRemark().execute({
        params: dialog.scope === "node" ? { daemonId: dialog.nodeId } : undefined,
        data: { id: dialog.pluginId, remarks }
      });
      if (scope.value === dialog.scope && selectedNodeId.value === dialog.nodeId) {
        if (remarks) pluginRemarks.value.set(dialog.pluginId, remarks);
        else pluginRemarks.value.delete(dialog.pluginId);
      }
      if (remarkDialog.value === dialog) remarkDialog.value.open = false;
      notify(t("TXT_CODE_COMMON_SAVED"), "success");
    } catch (error) {
      notifyError(error);
    } finally {
      savingRemark.value = false;
    }
  };

  watch(
    [scope, selectedNodeId],
    () => {
      remarkDialog.value.open = false;
      void loadPluginRemarks();
    },
    { immediate: true }
  );

  onUnmounted(() => {
    remarksRequest++;
  });

  return {
    pluginRemarks,
    remarksLoading,
    savingRemark,
    remarkDialog,
    loadPluginRemarks,
    editContextPluginRemark,
    savePluginRemark
  };
}
