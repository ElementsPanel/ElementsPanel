<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { usePluginService } from "@elements-panel/sdk";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VChip,
  VDataTableServer,
  VForm,
  VMenu,
  VList,
  VListItem,
  VSelect,
  VTextField
} from "vuetify/components";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { throttle } from "lodash";
import {
  addUser as addUserApi,
  deleteUser as deleteUserApi,
  editUserInfo,
  getUserInfo,
  ssoUnbind as ssoUnbindApi
} from "@elementspanel/epanel-plugin-console/services/apis";
import { ssoConfig } from "../api";
import type { BaseUserInfo, EditUserInfo } from "@elementspanel/epanel-plugin-console/types/user";
import { PASSWORD_REGEX, reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { PERMISSION_MAP } from "@elementspanel/epanel-plugin-console/config/const";

interface UserPageData {
  total: number;
  pageSize: number;
  page: number;
  maxPage: number;
  data: BaseUserInfo[];
}

const { execute, isLoading: getUserInfoLoading } = getUserInfo();
const { toPage } = useAppRouters();
const { isPhone } = useScreen();
const canAssignInstances = computed(() => !!usePluginService("instance") && !!usePluginService("node"));
const ssoEnabled = ref(false);
const data = ref<UserPageData>();
const total = ref(0);
const selectedUsers = ref<string[]>([]);
const currentRole = ref("");
const operationForm = ref({ name: "", currentPage: 1, pageSize: 20 });
const dataSource = computed(() => data.value?.data ?? []);
const permissionItems = computed(() =>
  Object.entries(PERMISSION_MAP).map(([value, title]) => ({ title, value: Number(value) }))
);
const roleItems = computed(() => [
  { title: t("TXT_CODE_COMMON_ALL"), value: "" },
  ...permissionItems.value.map((item) => ({ title: item.title, value: String(item.value) }))
]);

let latestRequest = 0;
const fetchData = async () => {
  const request = ++latestRequest;
  operationForm.value.currentPage = Math.max(1, operationForm.value.currentPage);
  try {
    const res = await execute({
      params: {
        userName: operationForm.value.name || "",
        page: operationForm.value.currentPage,
        page_size: operationForm.value.pageSize,
        role: currentRole.value
      }
    });
    if (request !== latestRequest) return;
    data.value = res.value;
    total.value = res.value?.total ?? 0;
    const maxPage = Math.max(1, Math.ceil(total.value / operationForm.value.pageSize));
    if (operationForm.value.currentPage > maxPage) {
      operationForm.value.currentPage = maxPage;
      await fetchData();
    }
  } catch (error: any) {
    if (request === latestRequest) reportErrorMsg(error.message);
  }
};
const reload = throttle(fetchData, 600);
const search = throttle(async () => {
  operationForm.value.currentPage = 1;
  await fetchData();
}, 600);
onUnmounted(() => {
  latestRequest++;
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
    await deleteUserApi().execute({ data: userList });
    message.success(t("TXT_CODE_COMMON_DELETE_SUCCESS"));
    selectedUsers.value = [];
    await fetchData();
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};
const handleBatchDelete = () => {
  if (!selectedUsers.value.length) return message.warn(t("TXT_CODE_COMMON_PLEASE_SELECT_THE_USER_S_TO_BE_DELETED"));
  deleteUsers(selectedUsers.value);
};
const handleToUserResources = (user: BaseUserInfo) =>
  toPage({ path: "/users/resources", query: { uuid: user.uuid } });
const handleSsoUnbind = async (user: BaseUserInfo) => {
  try {
    await ssoUnbindApi().execute({ data: { uuid: user.uuid } });
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
    text: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_DELETE_THE_USER", { userName: user.userName } as any),
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

const isAddMode = ref(true);
const userDialogOpen = ref(false);
const userDialogTitle = ref("");
const userDialogLoading = ref(false);
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> }>();
const formDataOrigin: EditUserInfo = {
  uuid: "",
  userName: "",
  passWord: "",
  loginTime: "",
  registerTime: "",
  instances: [],
  permission: 1,
  apiKey: "",
  isInit: false,
  secret: "",
  open2FA: false,
  ssoSub: "",
  ssoBound: false
};
const formData = ref<EditUserInfo>({ ...formDataOrigin });
const requiredRule = (value: unknown) =>
  Boolean(String(value ?? "").trim()) || t("TXT_CODE_COMMON_PLEASE_ENTER_A_USERNAME");
const userNameRule = (value: unknown) => {
  const text = String(value ?? "");
  return !text || (text.length >= 3 && text.length <= 20) || t("TXT_CODE_COMMON_LENGTH_MUST_BE_3_TO_20_CHARACTERS");
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
      await addUserApi().execute({
        data: {
          username: formData.value.userName,
          password: formData.value.passWord!,
          permission: formData.value.permission
        }
      });
      message.success(t("TXT_CODE_COMMON_NEW_USER_ADDED"));
    } else {
      await editUserInfo().execute({ data: { config: formData.value, uuid: formData.value.uuid } });
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

const headers = computed(() => {
  const result: any[] = [
    ...(!isPhone.value ? [{ title: "UUID", key: "uuid", sortable: false }] : []),
    { title: t("TXT_CODE_USER_USERNAME"), key: "userName" },
    { title: t("TXT_CODE_FILE_PERMISSIONS"), key: "permission" },
    ...(!isPhone.value
      ? [
          { title: t("TXT_CODE_COMMON_LAST_LOGIN"), key: "loginTime" },
          { title: t("TXT_CODE_COMMON_REGISTRATION_TIME"), key: "registerTime" }
        ]
      : [])
  ];
  if (ssoEnabled.value) result.push({ title: t("TXT_CODE_SSO_BOUND_STATUS"), key: "ssoBound" });
  result.push({ title: t("TXT_CODE_COMMON_ACTIONS"), key: "actions", sortable: false, align: "end" });
  return result;
});
const rawUser = (item: BaseUserInfo | { raw: BaseUserInfo }) =>
  (item as { raw?: BaseUserInfo }).raw ?? (item as BaseUserInfo);
onMounted(async () => {
  try {
    const res = await ssoConfig().execute();
    ssoEnabled.value = Boolean(res.value?.enabled);
  } catch {
    ssoEnabled.value = false;
  }
  await fetchData();
});
</script>

<template>
  <main class="user-page">
    <div class="user-page-container">
      <PageToolbar
        :title="`${t('TXT_CODE_COMMON_USERS')} (${total})`"
        icon="mdi-account-group-outline"
      >
        <template #search>
          <div class="user-search-row">
            <VSelect
              v-model="currentRole"
              :items="roleItems"
              density="comfortable"
              variant="solo-filled"
              hide-details
              class="role-select"
              @update:model-value="search"
            >
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect>
            <VTextField
              v-model.trim="operationForm.name"
              :label="t('TXT_CODE_COMMON_SEARCH_BY_USERNAME')"
              prepend-inner-icon="mdi-magnify"
              density="comfortable"
              hide-details
              clearable
              @update:model-value="search"
            />
          </div>
        </template>
        <template #actions>
          <VBtn
            variant="text"
            prepend-icon="mdi-refresh"
            :loading="getUserInfoLoading"
            @click="reload"
            >{{ t("TXT_CODE_COMMON_REFRESH") }}</VBtn
          >
          <VMenu location="bottom end">
            <template #activator="{ props: menuProps }"
              ><VBtn v-bind="menuProps" color="primary" append-icon="mdi-chevron-down">{{
                t("TXT_CODE_COMMON_USER_OPERATION")
              }}</VBtn></template
            >
            <VList>
              <VListItem
                :title="t('TXT_CODE_COMMON_NEW_USER')"
                prepend-icon="mdi-account-plus-outline"
                @click="handleAddUser"
              />
              <VListItem
                :title="t('TXT_CODE_COMMON_DELETE')"
                prepend-icon="mdi-delete-outline"
                @click="handleBatchDelete"
              />
            </VList>
          </VMenu>
        </template>
      </PageToolbar>
      <VCard rounded="xl" flat>
        <VDataTableServer
          v-model="selectedUsers"
          :headers="headers"
          :items="dataSource"
          :items-length="total"
          :items-per-page-options="[10, 20, 50]"
          item-value="uuid"
          show-select
          :loading="getUserInfoLoading"
          :items-per-page="operationForm.pageSize"
          :page="operationForm.currentPage"
          class="user-table"
          @update:options="handleTableOptions"
        >
          <template #no-data><Empty icon="mdi-account-outline" /></template>
          <template #item.permission="{ item }">{{
            PERMISSION_MAP[rawUser(item).permission] || rawUser(item).permission
          }}</template>
          <template #item.ssoBound="{ item }"
            ><VChip
              size="small"
              :color="rawUser(item).ssoBound ? 'success' : undefined"
              variant="tonal"
              >{{
                rawUser(item).ssoBound ? t("TXT_CODE_SSO_BOUND_YES") : t("TXT_CODE_SSO_BOUND_NO")
              }}</VChip
            ></template
          >
          <template #item.actions="{ item }"
            ><VMenu location="bottom end"
              ><template #activator="{ props: menuProps }"
                ><VBtn
                  v-bind="menuProps"
                  size="small"
                  variant="text"
                  append-icon="mdi-chevron-down"
                  >{{ t("TXT_CODE_COMMON_ACTIONS") }}</VBtn
                ></template
              ><VList
                ><VListItem
                  :title="t('TXT_CODE_COMMON_CONFIGURATION')"
                  prepend-icon="mdi-pencil-outline"
                  @click="handleEditUser(rawUser(item))" /><VListItem
                  v-if="canAssignInstances"
                  :title="t('TXT_CODE_COMMON_RESOURCE_ASSIGNMENT')"
                  prepend-icon="mdi-shield-account-outline"
                  @click="handleToUserResources(rawUser(item))" /><VListItem
                  v-if="ssoEnabled && rawUser(item).ssoBound"
                  :title="t('TXT_CODE_SSO_UNBIND')"
                  prepend-icon="mdi-link-off"
                  @click="openSsoConfirm(rawUser(item))" /><VListItem
                  :title="t('TXT_CODE_COMMON_DELETE')"
                  prepend-icon="mdi-delete-outline"
                  @click="openDeleteConfirm(rawUser(item))" /></VList></VMenu
          ></template>
        </VDataTableServer>
      </VCard>
    </div>
    <AppDialog
      v-model:open="userDialogOpen"
      :title="userDialogTitle"
      :confirm-loading="userDialogLoading"
      :ok-text="t('TXT_CODE_COMMON_CONFIRM')"
      @ok="submitUser"
    >
      <VForm ref="formRef" @submit.prevent="submitUser"
        ><VSelect
          v-model="formData.permission"
          :items="permissionItems"
          :label="t('TXT_CODE_FILE_PERMISSIONS')"
          :hint="t('TXT_CODE_USER_PERMISSION_LEVEL_HINT')"
          persistent-hint
          :rules="[requiredRule]"
          class="mb-4"
        >
          <template #no-data><Empty :icon="false" compact /></template>
        </VSelect><VTextField
          v-model="formData.userName"
          :label="t('TXT_CODE_USER_USERNAME')"
          :hint="t('TXT_CODE_COMMON_REQUIRED_3_TO_12_CHARACTERS_SUPPORTS_ANY_LANGUAGE')"
          persistent-hint
          :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
          :rules="[requiredRule, userNameRule]"
          class="mb-4"
        /><VTextField
          v-model="formData.passWord"
          type="password"
          :label="t('TXT_CODE_COMMON_PASSWORD')"
          :hint="isAddMode ? t('TXT_CODE_COMMON_REQUIRED_9_TO_36_CHARACTERS_MUST_INCLUDE_UPPERCASE_AND_LOWERCASE_LETTERS_AND_NUMBERS') : t('TXT_CODE_COMMON_LEAVE_BLANK_TO_KEEP_THE_PASSWORD_RESETTING_IT_ALSO_RESETS_2_FA')"
          persistent-hint
          :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
          :rules="[passwordRule]"
          class="mb-4"
        /><VTextField
          v-if="!isAddMode && formData.apiKey"
          v-model="formData.apiKey"
          :label="t('TXT_CODE_UI_API_KEY')"
          readonly
          class="mb-4"
        />
        <div v-else-if="!isAddMode" class="text-medium-emphasis mb-4">
          {{ t("TXT_CODE_COMMON_THIS_USER_HAS_NOT_ENABLED_AN_API_KEY") }}
        </div>
        <div v-if="isAddMode" class="text-medium-emphasis">
          {{ t("TXT_CODE_USER_COMMERCIAL_DOCKER_ISOLATION_HINT") }}<br /><a
            href="https://docs.mcsmanager.com/"
            target="_blank"
            >{{ t("TXT_CODE_COMMON_LEARN_MORE") }}</a
          >
        </div></VForm
      >
    </AppDialog>
    <AppDialog
      v-model:open="confirmDialog.open"
      :title="confirmDialog.title"
      compact
      ok-color="error"
      :ok-text="t('TXT_CODE_COMMON_DELETE')"
      @ok="confirmAction"
      ><div>{{ confirmDialog.text }}</div></AppDialog
    >
  </main>
</template>

<style lang="scss" scoped>
.user-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}
.user-page-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}
.user-search-row {
  display: flex;
  width: 100%;
  gap: 8px;
}
.role-select {
  flex: 0 0 120px;
}
.user-table {
  width: 100%;
}
@media (max-width: 992px) {
  .user-page-container {
    padding: 16px 12px 28px;
  }
  .user-search-row {
    flex-direction: column;
  }
  .role-select {
    flex-basis: auto;
  }
}
</style>
