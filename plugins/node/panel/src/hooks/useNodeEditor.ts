import type { ComputedNodeInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  getValidatorErrorMsg,
  isLocalNetworkIP,
  reportErrorMsg
} from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import _ from "lodash";
import { reactive, ref } from "vue";
import { useRemoteNode } from "./useRemoteNode";

export function useNodeEditor() {
  const { addNode, deleteNode, updateNode } = useRemoteNode({ poll: false });
  const editMode = ref(false);
  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> }>();

  const DEFAULT_CONFIG = {
    ip: "",
    port: 24444,
    prefix: "",
    remarks: "Unnamed Node",
    apiKey: ""
  };

  const dialog = reactive({
    status: false,
    loading: false,
    uuid: "",
    data: _.cloneDeep(DEFAULT_CONFIG)
  });

  const ipNeedsMapping = (ip: string) =>
    Boolean(ip && ip.trim() !== "localhost" && isLocalNetworkIP(ip));
  const requiredRule = (value: unknown) =>
    !!String(value ?? "").trim() || t("TXT_CODE_COMMON_FIELD_CANNOT_BE_EMPTY");
  const apiKeyRule = (value: unknown) => editMode.value || requiredRule(value);

  const openDialog = (data?: ComputedNodeInfo, uuid?: string) => {
    if (data && uuid) {
      editMode.value = true;
      dialog.uuid = uuid;
      dialog.data = {
        ..._.cloneDeep(DEFAULT_CONFIG),
        ..._.pick(data, Object.keys(DEFAULT_CONFIG)),
        apiKey: ""
      };
    } else {
      editMode.value = false;
      dialog.data = _.cloneDeep(DEFAULT_CONFIG);
    }
    dialog.status = true;
  };

  const closeDialog = () => {
    dialog.status = false;
    dialog.loading = false;
    dialog.uuid = "";
    dialog.data = _.cloneDeep(DEFAULT_CONFIG);
  };
  const submit = async () => {
    try {
      const result = await formRef.value?.validate();
      if (result && !result.valid) return;
      dialog.loading = true;
      if (editMode.value)
        await updateNode(dialog.uuid, { ...dialog.data, apiKey: dialog.data.apiKey || undefined });
      else await addNode(dialog.data);
      message.success(t("TXT_CODE_COMMON_SAVED"));
      const wasEdit = editMode.value;
      closeDialog();
      if (wasEdit) setTimeout(() => window.location.reload(), 150);
    } catch (error: any) {
      if (error?.errorFields instanceof Array) {
        message.warning(getValidatorErrorMsg(error, t("TXT_CODE_COMMON_PLEASE_COMPLETE_THE_FORM")));
        return;
      }
      reportErrorMsg(error?.message ?? t("TXT_CODE_COMMON_PLEASE_COMPLETE_THE_FORM"));
    } finally {
      dialog.loading = false;
    }
  };
  const remove = async () => {
    Modal.confirm({
      title: t("TXT_CODE_COMMON_PERMANENTLY_DELETE_THIS_DAEMON"),
      onOk: async () => {
        try {
          await deleteNode(dialog.uuid);
          closeDialog();
          message.success(t("TXT_CODE_COMMON_DELETED"));
        } catch (error: any) {
          message.error(error?.message ?? String(error));
        }
      }
    });
  };

  return {
    editMode,
    formRef,
    DEFAULT_CONFIG,
    dialog,
    ipNeedsMapping,
    requiredRule,
    apiKeyRule,
    openDialog,
    closeDialog,
    submit,
    remove
  };
}
