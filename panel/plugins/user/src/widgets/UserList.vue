<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import PageToolbar from "@/components/PageToolbar.vue";
import { t } from "@/lang/i18n";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, ref } from "vue";
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
import { useAppRouters } from "@/hooks/useAppRouters";
import { useScreen } from "@/hooks/useScreen";
import { throttle } from "lodash";
import {
  addUser as addUserApi,
  deleteUser as deleteUserApi,
  editUserInfo,
  getUserInfo,
  ssoUnbind as ssoUnbindApi
} from "@/services/apis";
import { ssoConfig } from "../api";
import type { BaseUserInfo, EditUserInfo } from "@/types/user";
import { PASSWORD_REGEX, reportErrorMsg } from "@/tools/validator";
import { PERMISSION_MAP } from "@/config/const";

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
  { title: t("TXT_CODE_c48f6f64"), value: "" },
  ...permissionItems.value.map((item) => ({ title: item.title, value: String(item.value) }))
]);

const fetchData = async () => {
  operationForm.value.currentPage = Math.max(1, operationForm.value.currentPage);
  const res = await execute({
    params: {
      userName: operationForm.value.name,
      page: operationForm.value.currentPage,
      page_size: operationForm.value.pageSize,
      role: currentRole.value
    }
  });
  data.value = res.value;
  total.value = res.value?.total ?? 0;
};
const reload = throttle(fetchData, 600);
const search = throttle(async () => {
  operationForm.value.currentPage = 1;
  await fetchData();
}, 600);
const handleTableOptions = (options: { page: number; itemsPerPage: number }) => {
  operationForm.value.currentPage = options.page;
  operationForm.value.pageSize = options.itemsPerPage;
  fetchData();
};

const deleteUsers = async (userList: string[]) => {
  try {
    await deleteUserApi().execute({ data: userList });
    message.success(t("TXT_CODE_28190dbc"));
    selectedUsers.value = [];
    await fetchData();
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};
const handleBatchDelete = () => {
  if (!selectedUsers.value.length) return message.warn(t("TXT_CODE_d78ad17a"));
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
    title: t("TXT_CODE_ecbd7449"),
    text: t("TXT_CODE_e99ab99a", { userName: user.userName } as any),
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
  Boolean(String(value ?? "").trim()) || t("TXT_CODE_2695488c");
const userNameRule = (value: unknown) => {
  const text = String(value ?? "");
  return !text || (text.length >= 3 && text.length <= 20) || t("TXT_CODE_3f477ec");
};
const passwordRule = (value: unknown) => {
  const text = String(value ?? "");
  return (
    (!isAddMode.value && !text) ||
    (text.length >= 9 && text.length <= 36 && PASSWORD_REGEX.test(text)) ||
    t("TXT_CODE_6032f5a3")
  );
};
const handleAddUser = () => {
  isAddMode.value = true;
  userDialogTitle.value = t("TXT_CODE_e83ffa03");
  formData.value = { ...formDataOrigin };
  userDialogOpen.value = true;
};
const handleEditUser = (user: BaseUserInfo) => {
  isAddMode.value = false;
  userDialogTitle.value = t("TXT_CODE_79f9a172");
  formData.value = { ...user };
  userDialogOpen.value = true;
};
const submitUser = async () => {
  const result = await formRef.value?.validate();
  if (result && !result.valid) return;
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
      message.success(t("TXT_CODE_c855fc29"));
    } else {
      await editUserInfo().execute({ data: { config: formData.value, uuid: formData.value.uuid } });
      message.success(t("TXT_CODE_27efac3b"));
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
    { title: t("TXT_CODE_eb9fcdad"), key: "userName" },
    { title: t("TXT_CODE_511aea70"), key: "permission" },
    ...(!isPhone.value
      ? [
          { title: t("TXT_CODE_d7ee9ba"), key: "loginTime" },
          { title: t("TXT_CODE_c5c56801"), key: "registerTime" }
        ]
      : [])
  ];
  if (ssoEnabled.value) result.push({ title: t("TXT_CODE_SSO_BOUND_STATUS"), key: "ssoBound" });
  result.push({ title: t("TXT_CODE_fe731dfc"), key: "actions", sortable: false, align: "end" });
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
      <PageToolbar :title="`${t('TXT_CODE_1deaa2dd')} (${total})`" icon="mdi-account-group-outline">
        <template #search>
          <div class="user-search-row">
            <VSelect
              v-model="currentRole"
              :items="roleItems"
              hide-details
              class="role-select"
              @update:model-value="search"
            />
            <VTextField
              v-model.trim="operationForm.name"
              :placeholder="t('TXT_CODE_2471b9c')"
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
            >{{ t("TXT_CODE_b76d94e0") }}</VBtn
          >
          <VMenu location="bottom end">
            <template #activator="{ props: menuProps }"
              ><VBtn v-bind="menuProps" color="primary" append-icon="mdi-chevron-down">{{
                t("TXT_CODE_f7084f84")
              }}</VBtn></template
            >
            <VList>
              <VListItem
                :title="t('TXT_CODE_e83ffa03')"
                prepend-icon="mdi-account-plus-outline"
                @click="handleAddUser"
              />
              <VListItem
                :title="t('TXT_CODE_ecbd7449')"
                prepend-icon="mdi-delete-outline"
                @click="handleBatchDelete"
              />
            </VList>
          </VMenu>
        </template>
      </PageToolbar>
      <VCard rounded="xl" flat class="user-table-card">
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
                  >{{ t("TXT_CODE_fe731dfc") }}</VBtn
                ></template
              ><VList
                ><VListItem
                  :title="t('TXT_CODE_236f70aa')"
                  prepend-icon="mdi-pencil-outline"
                  @click="handleEditUser(rawUser(item))" /><VListItem
                  :title="t('TXT_CODE_4d934e3a')"
                  prepend-icon="mdi-shield-account-outline"
                  @click="handleToUserResources(rawUser(item))" /><VListItem
                  v-if="ssoEnabled && rawUser(item).ssoBound"
                  :title="t('TXT_CODE_SSO_UNBIND')"
                  prepend-icon="mdi-link-off"
                  @click="openSsoConfirm(rawUser(item))" /><VListItem
                  :title="t('TXT_CODE_ecbd7449')"
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
      :ok-text="t('TXT_CODE_d507abff')"
      @ok="submitUser"
    >
      <VForm ref="formRef" @submit.prevent="submitUser"
        ><VSelect
          v-model="formData.permission"
          :items="permissionItems"
          :label="t('TXT_CODE_511aea70')"
          :hint="t('TXT_CODE_21b8b71a')"
          persistent-hint
          :rules="[requiredRule]"
          class="mb-4"
        /><VTextField
          v-model="formData.userName"
          :label="t('TXT_CODE_eb9fcdad')"
          :hint="t('TXT_CODE_1987587b')"
          persistent-hint
          :placeholder="t('TXT_CODE_4ea93630')"
          :rules="[requiredRule, userNameRule]"
          class="mb-4"
        /><VTextField
          v-model="formData.passWord"
          type="password"
          :label="t('TXT_CODE_551b0348')"
          :hint="isAddMode ? t('TXT_CODE_1f2062c7') : t('TXT_CODE_af1f921d')"
          persistent-hint
          :placeholder="t('TXT_CODE_4ea93630')"
          :rules="[passwordRule]"
          class="mb-4"
        /><VTextField
          v-if="!isAddMode && formData.apiKey"
          v-model="formData.apiKey"
          label="APIKEY"
          readonly
          class="mb-4"
        />
        <div v-else-if="!isAddMode" class="text-medium-emphasis mb-4">
          {{ t("TXT_CODE_6c274bdc") }}
        </div>
        <div v-if="isAddMode" class="text-medium-emphasis">
          {{ t("TXT_CODE_9e9d3767") }}<br /><a
            href="https://docs.mcsmanager.com/"
            target="_blank"
            >{{ t("TXT_CODE_b01f8383") }}</a
          >
        </div></VForm
      >
    </AppDialog>
    <AppDialog
      v-model:open="confirmDialog.open"
      :title="confirmDialog.title"
      compact
      ok-color="error"
      :ok-text="t('TXT_CODE_ecbd7449')"
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
.user-table-card {
  overflow: hidden;
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
