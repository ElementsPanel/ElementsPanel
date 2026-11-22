import { reactive, ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  getValidatorErrorMsg,
  reportErrorMsg
} from "@elementspanel/epanel-plugin-console/tools/validator";
import type { NodeStatus } from "@elementspanel/epanel-plugin-console/types";
import { useNodeOperations } from "../services/nodeOperations";

interface Options {
  fetchNodes: () => Promise<void>;
}

export function useDesktopNodeEditor(options: Options) {
  const { fetchNodes } = options;

  const operations = useNodeOperations();
  const reconnecting = new Set<string>();
  const showDialog = ref(false);
  const dialogMode = ref<"add" | "edit">("add");
  const editingNode = ref<NodeStatus | null>(null);
  const form = reactive({
    ip: "",
    port: 24444,
    remarks: "",
    apiKey: "",
    prefix: ""
  });
  const formError = ref("");
  const saving = ref(false);

  const showDeleteConfirm = ref(false);
  const deletingNode = ref<NodeStatus | null>(null);

  const openAddDialog = () => {
    dialogMode.value = "add";
    editingNode.value = null;
    form.ip = "";
    form.port = 24444;
    form.remarks = "";
    form.apiKey = "";
    form.prefix = "";
    formError.value = "";
    showDialog.value = true;
  };

  const openEditDialog = (node: NodeStatus) => {
    dialogMode.value = "edit";
    editingNode.value = node;
    form.ip = node.ip;
    form.port = node.port;
    form.remarks = node.remarks;
    form.prefix = node.prefix || "";
    form.apiKey = "";
    formError.value = "";
    showDialog.value = true;
  };

  const closeDialog = () => {
    showDialog.value = false;
    formError.value = "";
  };

  const saveNode = async () => {
    if (saving.value) return;
    formError.value = "";

    if (!form.ip.trim()) {
      formError.value = t("TXT_CODE_DESKTOP_NODES_IP_REQUIRED");
      return;
    }

    if (
      !Number.isInteger(Number(form.port)) ||
      Number(form.port) < 1 ||
      Number(form.port) > 65535
    ) {
      formError.value = t("TXT_CODE_COMMON_THE_PORT_NUMBER_MUST_BE_WITHIN_THE_RANGE_OF_0_65535");
      return;
    }

    if (dialogMode.value === "add" && !form.apiKey.trim()) {
      formError.value = t("TXT_CODE_DESKTOP_NODES_APIKEY_REQUIRED");
      return;
    }

    saving.value = true;
    try {
      if (dialogMode.value === "add") {
        await operations.add({
          ip: form.ip.trim(),
          port: Number(form.port),
          remarks: form.remarks.trim(),
          apiKey: form.apiKey.trim()
        });
      } else if (editingNode.value) {
        const editData: {
          ip: string;
          port: number;
          remarks: string;
          prefix: string;
          apiKey?: string;
        } = {
          ip: form.ip.trim(),
          port: Number(form.port),
          remarks: form.remarks.trim(),
          prefix: form.prefix.trim()
        };
        if (form.apiKey.trim()) {
          editData.apiKey = form.apiKey.trim();
        }
        await operations.edit(editingNode.value.uuid, editData);
        try {
          await operations.connect(editingNode.value.uuid);
        } catch (error) {
          reportErrorMsg(error);
        }
      }
      showDialog.value = false;
      await fetchNodes();
    } catch (error) {
      formError.value = getValidatorErrorMsg(error, t("TXT_CODE_COMMON_OPERATION_FAILED"));
    } finally {
      saving.value = false;
    }
  };

  const confirmDelete = (node: NodeStatus) => {
    deletingNode.value = node;
    showDeleteConfirm.value = true;
  };

  const executeDelete = async () => {
    if (!deletingNode.value || saving.value) return;
    saving.value = true;
    try {
      await operations.remove(deletingNode.value.uuid);
      showDeleteConfirm.value = false;
      deletingNode.value = null;
      await fetchNodes();
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      saving.value = false;
    }
  };

  const cancelDelete = () => {
    showDeleteConfirm.value = false;
    deletingNode.value = null;
  };

  const reconnectNode = async (node: NodeStatus) => {
    if (reconnecting.has(node.uuid)) return;
    reconnecting.add(node.uuid);
    try {
      await operations.connect(node.uuid);
      await fetchNodes();
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      reconnecting.delete(node.uuid);
    }
  };

  return {
    operations,
    reconnecting,
    showDialog,
    dialogMode,
    editingNode,
    form,
    formError,
    saving,
    showDeleteConfirm,
    deletingNode,
    openAddDialog,
    openEditDialog,
    closeDialog,
    saveNode,
    confirmDelete,
    executeDelete,
    cancelDelete,
    reconnectNode
  };
}
