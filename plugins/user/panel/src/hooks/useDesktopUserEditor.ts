import { reactive, ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { BaseUserInfo } from "@elementspanel/epanel-plugin-console/types/user";
import { createUserEdit } from "../userForm";
import { useUserOperations } from "../services/userOperations";

interface Options {
  fetchUsers: () => Promise<void>;
}

export function useDesktopUserEditor(options: Options) {
  const { fetchUsers } = options;

  const operations = useUserOperations();
  const showDialog = ref(false);
  const dialogMode = ref<"add" | "edit">("add");
  const editingUser = ref<BaseUserInfo | null>(null);
  const form = reactive({
    username: "",
    password: "",
    permission: 1
  });
  const formError = ref("");
  const saving = ref(false);

  const showDeleteConfirm = ref(false);
  const deletingUser = ref<BaseUserInfo | null>(null);

  const openAddDialog = () => {
    dialogMode.value = "add";
    editingUser.value = null;
    form.username = "";
    form.password = "";
    form.permission = 1;
    formError.value = "";
    showDialog.value = true;
  };

  const openEditDialog = (user: BaseUserInfo) => {
    dialogMode.value = "edit";
    editingUser.value = user;
    form.username = user.userName;
    form.password = "";
    form.permission = user.permission;
    formError.value = "";
    showDialog.value = true;
  };

  const closeDialog = () => {
    showDialog.value = false;
    formError.value = "";
  };

  const saveUser = async () => {
    formError.value = "";

    if (!form.username.trim()) {
      formError.value = t("TXT_CODE_DESKTOP_USERS_USERNAME_REQUIRED");
      return;
    }

    if (dialogMode.value === "add" && !form.password) {
      formError.value = t("TXT_CODE_DESKTOP_USERS_PASSWORD_REQUIRED");
      return;
    }

    saving.value = true;
    try {
      if (dialogMode.value === "add") {
        await operations.add({
          username: form.username.trim(),
          password: form.password,
          permission: form.permission
        });
      } else if (editingUser.value) {
        const editData = createUserEdit(editingUser.value, {
          userName: form.username.trim(),
          passWord: form.password || undefined,
          permission: form.permission
        });
        await operations.edit(editData);
      }
      showDialog.value = false;
      fetchUsers();
    } catch (e: any) {
      formError.value = e?.message || "Error";
    } finally {
      saving.value = false;
    }
  };

  const confirmDelete = (user: BaseUserInfo) => {
    deletingUser.value = user;
    showDeleteConfirm.value = true;
  };

  const executeDelete = async () => {
    if (!deletingUser.value) return;
    saving.value = true;
    try {
      await operations.remove([deletingUser.value.uuid]);
      showDeleteConfirm.value = false;
      deletingUser.value = null;
      fetchUsers();
    } catch {
    } finally {
      saving.value = false;
    }
  };

  const cancelDelete = () => {
    showDeleteConfirm.value = false;
    deletingUser.value = null;
  };

  return {
    showDialog,
    dialogMode,
    editingUser,
    form,
    formError,
    saving,
    showDeleteConfirm,
    deletingUser,
    openAddDialog,
    openEditDialog,
    closeDialog,
    saveUser,
    confirmDelete,
    executeDelete,
    cancelDelete
  };
}
