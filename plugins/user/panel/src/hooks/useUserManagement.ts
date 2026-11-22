import { computed, onMounted, onUnmounted, ref } from "vue";
import { throttle } from "lodash";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { usePluginService } from "@elements-panel/sdk";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { PERMISSION_MAP } from "@elementspanel/epanel-plugin-console/config/const";
import type { BaseUserInfo } from "@elementspanel/epanel-plugin-console/types/user";
import { ssoConfig } from "../api";
import { useUserList } from "./useUserList";
import { useUserOperations } from "../services/userOperations";

export function useUserManagement() {
  const { toPage } = useAppRouters();
  const operations = useUserOperations();
  const canAssignInstances = computed(
    () => !!usePluginService("instance") && !!usePluginService("node")
  );
  const ssoEnabled = ref(false);
  const selectedUsers = ref<string[]>([]);
  const currentRole = ref("");
  const operationForm = ref({ name: "", currentPage: 1, pageSize: 20 });
  const {
    data,
    total,
    users: dataSource,
    loading: getUserInfoLoading,
    fetch: fetchData
  } = useUserList({
    query: () => {
      operationForm.value.currentPage = Math.max(1, operationForm.value.currentPage);
      return {
        userName: operationForm.value.name || "",
        page: operationForm.value.currentPage,
        page_size: operationForm.value.pageSize,
        role: currentRole.value
      };
    },
    onError: (error) => reportErrorMsg((error as Error).message),
    afterLoad: async () => {
      const maxPage = Math.max(1, Math.ceil(total.value / operationForm.value.pageSize));
      if (operationForm.value.currentPage > maxPage) {
        operationForm.value.currentPage = maxPage;
        await fetchData();
      }
    }
  });
  const permissionItems = computed(() =>
    Object.entries(PERMISSION_MAP).map(([value, title]) => ({ title, value: Number(value) }))
  );
  const roleItems = computed(() => [
    { title: t("TXT_CODE_COMMON_ALL"), value: "" },
    ...permissionItems.value.map((item) => ({ title: item.title, value: String(item.value) }))
  ]);

  const reload = throttle(fetchData, 600);
  const search = throttle(async () => {
    operationForm.value.currentPage = 1;
    await fetchData();
  }, 600);
  onUnmounted(() => {
    reload.cancel();
    search.cancel();
  });
  const handleTableOptions = (options: { page: number; itemsPerPage: number }) => {
    operationForm.value.currentPage = options.page;
    operationForm.value.pageSize = options.itemsPerPage;
    fetchData();
  };

  const deleteUsers = async (userList: string[]) => {
    try {
      await operations.remove(userList);
      message.success(t("TXT_CODE_COMMON_DELETE_SUCCESS"));
      selectedUsers.value = [];
      await fetchData();
    } catch (error: any) {
      reportErrorMsg(error.message);
    }
  };
  const handleBatchDelete = () => {
    if (!selectedUsers.value.length)
      return message.warn(t("TXT_CODE_COMMON_PLEASE_SELECT_THE_USER_S_TO_BE_DELETED"));
    deleteUsers(selectedUsers.value);
  };
  const handleToUserResources = (user: BaseUserInfo) =>
    toPage({ path: "/users/resources", query: { uuid: user.uuid } });
  const handleSsoUnbind = async (user: BaseUserInfo) => {
    try {
      await operations.unbindSso(user.uuid);
      message.success(t("TXT_CODE_SSO_UNBIND_SUCCESS"));
      await fetchData();
    } catch (error: any) {
      reportErrorMsg(error.message);
    }
  };

  const confirmDialog = ref<{
    open: boolean;
    title: string;
    text: string;
    action: () => void | Promise<void>;
  }>({ open: false, title: "", text: "", action: () => undefined });
  const confirmAction = async () => {
    const action = confirmDialog.value.action;
    confirmDialog.value.open = false;
    await action();
  };
  const openDeleteConfirm = (user: BaseUserInfo) => {
    confirmDialog.value = {
      open: true,
      title: t("TXT_CODE_COMMON_DELETE"),
      text: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_DELETE_THE_USER", {
        userName: user.userName
      } as any),
      action: () => deleteUsers([user.uuid])
    };
  };
  const openSsoConfirm = (user: BaseUserInfo) => {
    confirmDialog.value = {
      open: true,
      title: t("TXT_CODE_SSO_UNBIND"),
      text: t("TXT_CODE_SSO_UNBIND_CONFIRM", { userName: user.userName } as any),
      action: () => handleSsoUnbind(user)
    };
  };

  onMounted(async () => {
    try {
      const res = await ssoConfig().execute();
      ssoEnabled.value = Boolean(res.value?.enabled);
    } catch {
      ssoEnabled.value = false;
    }
    await fetchData();
  });

  return {
    data,
    total,
    dataSource,
    getUserInfoLoading,
    fetchData,
    canAssignInstances,
    ssoEnabled,
    selectedUsers,
    currentRole,
    operationForm,
    permissionItems,
    roleItems,
    reload,
    search,
    handleTableOptions,
    deleteUsers,
    handleBatchDelete,
    handleToUserResources,
    handleSsoUnbind,
    confirmDialog,
    confirmAction,
    openDeleteConfirm,
    openSsoConfirm
  };
}
