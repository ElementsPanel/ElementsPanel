import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type { FileTarget } from "../types";
import { reactive, type Ref } from "vue";
import {
  number2permission,
  permission2number
} from "@elementspanel/epanel-plugin-console/tools/permission";
import type { DataType, Permission } from "@elementspanel/epanel-plugin-console/types/fileManager";
import {
  changePermission as changePermissionApi,
  changePermissionBatch as changePermissionBatchApi
} from "../api";
import type { OpenFileDialog } from "../types";

interface Options extends FileTarget {
  currentPath: Ref<string>;
  selectionData: Ref<DataType[] | undefined>;
  isMultiple: Ref<boolean | undefined>;
  openDialog: OpenFileDialog;
  getFileList: (throwErr?: boolean, initPath?: string) => Promise<boolean>;
}

export function useFilePermissions(options: Options) {
  const { instanceId, daemonId, currentPath, selectionData, isMultiple, openDialog, getFileList } =
    options;

  const permission = reactive<Permission>({
    data: {
      owner: [],
      usergroup: [],
      everyone: []
    },
    deep: false,
    loading: false,
    item: [
      {
        key: t("TXT_CODE_COMMON_OWNER"),
        role: "owner"
      },
      {
        key: t("TXT_CODE_COMMON_USER_GROUP"),
        role: "usergroup"
      },
      {
        key: t("TXT_CODE_COMMON_ANYONE"),
        role: "everyone"
      }
    ]
  });

  const changePermission = async (name: string, mode: number) => {
    permission.loading = true;
    permission.data = number2permission(mode);
    permission.loading = false;
    const result = await openDialog(t("TXT_CODE_COMMON_CHANGE_PERMISSIONS"), "", "", "permission", {
      maxWidth: "400px"
    });
    if (result === undefined) return;
    try {
      const chmod = permission2number(
        permission.data.owner,
        permission.data.usergroup,
        permission.data.everyone
      );
      if (isMultiple.value) {
        if (!selectionData.value || selectionData.value.length === 0)
          return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_SELECT_A_FILE_FIRST"));
        const { state, execute } = changePermissionBatchApi();
        await execute({
          params: {
            daemonId: daemonId || "",
            uuid: instanceId || ""
          },
          data: {
            chmod,
            deep: permission.deep,
            targets: selectionData.value.map((item) => currentPath.value + item.name)
          }
        });
        const summary = state.value;
        if (!summary || summary.failed === 0) {
          message.success(t("TXT_CODE_COMMON_PERMISSION_CHANGED"));
        } else if (summary.success === 0) {
          message.error(
            t("TXT_CODE_COMMON_FAILED_TO_CHANGE_PERMISSIONS_FOR_ITEMS", { total: summary.total })
          );
        } else {
          message.warning(
            t("TXT_CODE_COMMON_PERMISSIONS_UPDATED_SUCCEEDED_FAILED", {
              success: summary.success,
              failed: summary.failed
            })
          );
        }
      } else {
        const { execute } = changePermissionApi();
        await execute({
          params: {
            daemonId: daemonId || "",
            uuid: instanceId || ""
          },
          data: {
            chmod,
            deep: permission.deep,
            target: currentPath.value + name
          }
        });
        message.success(t("TXT_CODE_COMMON_PERMISSION_CHANGED"));
      }
      await getFileList();
    } catch (err: any) {
      return reportErrorMsg(err.message);
    }
    permission.deep = false;
  };

  return { permission, changePermission };
}
