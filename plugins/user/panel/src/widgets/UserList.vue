<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed } from "vue";
import { PERMISSION_MAP } from "@elementspanel/epanel-plugin-console/config/const";
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
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import type { BaseUserInfo } from "@elementspanel/epanel-plugin-console/types/user";
import { useUserManagement } from "../hooks/useUserManagement";
import { useUserEditor } from "../hooks/useUserEditor";

const { isPhone } = useScreen();
const {
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
  handleBatchDelete,
  handleToUserResources,
  confirmDialog,
  confirmAction,
  openDeleteConfirm,
  openSsoConfirm
} = useUserManagement();
const {
  isAddMode,
  userDialogOpen,
  userDialogTitle,
  userDialogLoading,
  formRef,
  formData,
  requiredRule,
  userNameRule,
  passwordRule,
  handleAddUser,
  handleEditUser,
  submitUser
} = useUserEditor({ fetchData });
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
  result.push({
    title: t("TXT_CODE_COMMON_ACTIONS"),
    key: "actions",
    sortable: false,
    align: "end"
  });
  return result;
});
const rawUser = (item: BaseUserInfo | { raw: BaseUserInfo }) =>
  (item as { raw?: BaseUserInfo }).raw ?? (item as BaseUserInfo);
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
          class="mb-1"
        >
          <template #no-data><Empty :icon="false" compact /></template> </VSelect
        ><VTextField
          v-model="formData.userName"
          :label="t('TXT_CODE_USER_USERNAME')"
          :hint="t('TXT_CODE_COMMON_REQUIRED_3_TO_12_CHARACTERS_SUPPORTS_ANY_LANGUAGE')"
          persistent-hint
          :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
          :rules="[requiredRule, userNameRule]"
          class="mb-1"
        /><VTextField
          v-model="formData.passWord"
          type="password"
          :label="t('TXT_CODE_COMMON_PASSWORD')"
          :hint="
            isAddMode
              ? t(
                  'TXT_CODE_COMMON_REQUIRED_9_TO_36_CHARACTERS_MUST_INCLUDE_UPPERCASE_AND_LOWERCASE_LETTERS_AND_NUMBERS'
                )
              : t('TXT_CODE_COMMON_LEAVE_BLANK_TO_KEEP_THE_PASSWORD_RESETTING_IT_ALSO_RESETS_2_FA')
          "
          persistent-hint
          :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
          :rules="[passwordRule]"
          class="mb-1"
        /><VTextField
          v-if="!isAddMode && formData.apiKey"
          v-model="formData.apiKey"
          :label="t('TXT_CODE_UI_API_KEY')"
          readonly
          class="mb-1"
        />
        <div v-else-if="!isAddMode" class="text-medium-emphasis mb-1">
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
