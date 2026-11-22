import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  PASSWORD_REGEX,
  reportErrorMsg
} from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type { BaseUserInfo, EditUserInfo } from "@elementspanel/epanel-plugin-console/types/user";
import { createUserDraft } from "../userForm";
import { useUserOperations } from "../services/userOperations";

interface Options {
  fetchData: () => Promise<void>;
}

export function useUserEditor(options: Options) {
  const { fetchData } = options;

  const operations = useUserOperations();
  const isAddMode = ref(true);
  const userDialogOpen = ref(false);
  const userDialogTitle = ref("");
  const userDialogLoading = ref(false);
  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> }>();
  const formDataOrigin = createUserDraft();
  const formData = ref<EditUserInfo>({ ...formDataOrigin });
  const requiredRule = (value: unknown) =>
    Boolean(String(value ?? "").trim()) || t("TXT_CODE_COMMON_PLEASE_ENTER_A_USERNAME");
  const userNameRule = (value: unknown) => {
    const text = String(value ?? "");
    return (
      !text ||
      (text.length >= 3 && text.length <= 20) ||
      t("TXT_CODE_COMMON_LENGTH_MUST_BE_3_TO_20_CHARACTERS")
    );
  };
  const passwordRule = (value: unknown) => {
    const text = String(value ?? "");
    return (
      (!isAddMode.value && !text) ||
      (text.length >= 9 && text.length <= 36 && PASSWORD_REGEX.test(text)) ||
      t("TXT_CODE_COMMON_9_TO_36_CHARACTERS_MUST_INCLUDE_UPPERCASE_LOWERCASE_LETTERS_AND_NUMBERS")
    );
  };
  const handleAddUser = () => {
    isAddMode.value = true;
    userDialogTitle.value = t("TXT_CODE_COMMON_NEW_USER");
    formData.value = { ...formDataOrigin };
    userDialogOpen.value = true;
  };
  const handleEditUser = (user: BaseUserInfo) => {
    isAddMode.value = false;
    userDialogTitle.value = t("TXT_CODE_COMMON_EDIT_USER");
    formData.value = { ...user };
    userDialogOpen.value = true;
  };
  const submitUser = async () => {
    if (userDialogLoading.value) return;
    const result = await formRef.value?.validate();
    if (!result?.valid) return;
    try {
      userDialogLoading.value = true;
      if (isAddMode.value) {
        await operations.add({
          username: formData.value.userName,
          password: formData.value.passWord!,
          permission: formData.value.permission
        });
        message.success(t("TXT_CODE_COMMON_NEW_USER_ADDED"));
      } else {
        await operations.edit(formData.value);
        message.success(t("TXT_CODE_COMMON_EDIT_SUCCESSFUL"));
      }
      userDialogOpen.value = false;
      await fetchData();
    } catch (error: any) {
      reportErrorMsg(error.message);
    } finally {
      userDialogLoading.value = false;
    }
  };

  return {
    isAddMode,
    userDialogOpen,
    userDialogTitle,
    userDialogLoading,
    formRef,
    formDataOrigin,
    formData,
    requiredRule,
    userNameRule,
    passwordRule,
    handleAddUser,
    handleEditUser,
    submitUser
  };
}
