<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import DesktopDialog from "@elementspanel/epanel-plugin-console/components/DesktopDialog";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { usePluginService, type FrontendDesktopService } from "@elements-panel/sdk";
import { INSTANCE_STATUS } from "@elementspanel/epanel-plugin-console/types/const";
import { computed } from "vue";
import {
  VBtn,
  VChip,
  VDataTable,
  VIcon,
  VRadio,
  VRadioGroup,
  VSelect,
  VTextField
} from "vuetify/components";
import { useDesktopUserList } from "../hooks/useDesktopUserList";
import { useDesktopUserEditor } from "../hooks/useDesktopUserEditor";
import { useUserAssignments } from "../hooks/useUserAssignments";

const ConfirmDialog = computed(
  () => usePluginService<FrontendDesktopService>("desktop")?.confirmation
);
const PlusOutlined = "mdi-plus";
const EditOutlined = "mdi-pencil-outline";
const LinkOutlined = "mdi-link-variant";
const {
  users,
  total,
  loading,
  fetchUsers,
  searchQuery,
  currentPage,
  pageSize,
  onSearchInput,
  maxPage,
  prevPage,
  nextPage
} = useDesktopUserList();
const {
  showDialog,
  dialogMode,
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
} = useDesktopUserEditor({ fetchUsers });
const {
  showAssignDialog,
  assignedInstances,
  assignSaving,
  canAssignInstances,
  nodeRequest,
  nodes,
  instances,
  instancesLoading,
  currentRemoteNode,
  currentRemoteNodeId,
  assignNodeItems,
  assignForm,
  openAssignDialog,
  closeAssignDialog,
  loadRemoteInstances,
  handleAssignNodeChange,
  handleAssignSearch,
  isInstanceAssigned,
  addAssignedInstance,
  removeAssignedInstance,
  saveAssignedInstances
} = useUserAssignments({ fetchUsers });
const userHeaders = [
  { title: t("TXT_CODE_USER_USERNAME"), key: "userName" },
  { title: t("TXT_CODE_FILE_PERMISSIONS"), key: "permission" },
  { title: t("TXT_CODE_COMMON_REGISTRATION_TIME"), key: "registerTime" },
  { title: t("TXT_CODE_COMMON_LAST_LOGIN"), key: "loginTime" },
  { title: t("TXT_CODE_COMMON_INSTANCES"), key: "instances" },
  { title: "2FA", key: "twoFactor", sortable: false },
  { title: "SSO", key: "sso", sortable: false },
  { title: t("TXT_CODE_OPERATE"), key: "actions", sortable: false }
];

const permissionLabel = (perm: number): string => {
  if (perm >= 10) return t("TXT_CODE_COMMON_ADMIN");
  if (perm >= 1) return t("TXT_CODE_COMMON_USER");
  return "--";
};

const formatTime = (time: string): string => {
  if (!time) return "--";
  try {
    return new Date(time).toLocaleString();
  } catch {
    return time;
  }
};

const getInstanceStatusLabel = (status: number): string => {
  return (
    INSTANCE_STATUS[status as keyof typeof INSTANCE_STATUS] || t("TXT_CODE_DESKTOP_IM_UNKNOWN")
  );
};
</script>

<template>
    <div class="desktop-users">
        <div class="du-toolbar">
            <div class="du-search">
                <VTextField v-model="searchQuery" class="du-search__input" :label="t('TXT_CODE_DESKTOP_USERS_SEARCH')"
                    prepend-inner-icon="mdi-magnify" density="comfortable" hide-details clearable
                    autocomplete="off" spellcheck="false" @update:model-value="onSearchInput" />
            </div>
            <VBtn class="du-btn du-btn--primary" variant="text" @click="openAddDialog">
                <VIcon icon="mdi-plus"  />
                {{ t("TXT_CODE_DESKTOP_USERS_ADD") }}
            </VBtn>
        </div>

        <VDataTable class="du-table" :headers="userHeaders" :items="users" :loading="loading" item-value="uuid"
            :items-per-page="pageSize" density="comfortable" hide-default-footer>
            <template #item.userName="{ item }"><div class="du-user-name"><VIcon icon="mdi-account-outline" class="du-user-name__icon" /><span>{{ item.userName }}</span></div></template>
            <template #item.permission="{ item }"><VChip size="small" variant="tonal" :color="item.permission >= 10 ? 'primary' : 'default'">{{ permissionLabel(item.permission) }}</VChip></template>
            <template #item.registerTime="{ item }">{{ formatTime(item.registerTime) }}</template>
            <template #item.loginTime="{ item }">{{ formatTime(item.loginTime) }}</template>
            <template #item.instances="{ item }">{{ item.instances?.length ?? 0 }}</template>
            <template #item.twoFactor="{ item }"><VIcon :icon="item.open2FA ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'" :class="item.open2FA ? 'du-badge-icon--yes' : 'du-badge-icon--no'" /></template>
            <template #item.sso="{ item }"><VIcon :icon="item.ssoBound ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'" :class="item.ssoBound ? 'du-badge-icon--yes' : 'du-badge-icon--no'" /></template>
            <template #item.actions="{ item }"><div class="du-action-btns"><VBtn v-if="canAssignInstances" icon variant="text" class="du-action-btn" :title="t('TXT_CODE_COMMON_ASSIGN')" @click="openAssignDialog(item)"><VIcon icon="mdi-link-variant" /></VBtn><VBtn icon variant="text" class="du-action-btn" :title="t('TXT_CODE_COMMON_EDIT_USER')" @click="openEditDialog(item)"><VIcon icon="mdi-pencil-outline" /></VBtn><VBtn icon variant="text" color="error" class="du-action-btn" :title="t('TXT_CODE_DESKTOP_USERS_DELETE')" @click="confirmDelete(item)"><VIcon icon="mdi-delete-outline" /></VBtn></div></template>
            <template #no-data>
              <Empty
                icon="mdi-account-search-outline"
                :title="t('TXT_CODE_DESKTOP_USERS_NO_RESULTS')"
              />
            </template>
        </VDataTable>

        <div v-if="total > pageSize" class="du-pagination">
            <VBtn class="du-page-btn" variant="text" :disabled="currentPage <= 1" @click="prevPage">
                {{ t("TXT_CODE_DESKTOP_IM_PREV") }}
            </VBtn>
            <span class="du-page-info">{{ currentPage }} / {{ maxPage }}</span>
            <VBtn class="du-page-btn" variant="text" :disabled="currentPage >= maxPage" @click="nextPage">
                {{ t("TXT_CODE_COMMON_NEXT") }}
            </VBtn>
        </div>

        <DesktopDialog
          id="user-edit-dialog"
          :title="dialogMode === 'add' ? t('TXT_CODE_DESKTOP_USERS_ADD') : t('TXT_CODE_COMMON_EDIT_USER')"
          :icon="dialogMode === 'add' ? PlusOutlined : EditOutlined"
          :model-value="showDialog"
          :width="420"
          :height="335"
          :z-index="10001"
          @close="closeDialog"
        >
          <div class="du-form-group">
              <label class="du-form-label">
                  <VIcon icon="mdi-account-outline"  /> {{ t("TXT_CODE_USER_USERNAME") }}
              </label>
              <VTextField v-model="form.username" class="du-form-input" density="compact" hide-details autocomplete="new-password"
                  :placeholder="t('TXT_CODE_USER_USERNAME')"
                  :disabled="dialogMode === 'edit'" />
          </div>
          <div class="du-form-group">
              <label class="du-form-label">
                  <VIcon icon="mdi-key-outline"  /> {{ t("TXT_CODE_COMMON_PASSWORD") }}
              </label>
              <VTextField v-model="form.password" type="password" class="du-form-input" density="compact" hide-details
                  autocomplete="new-password"
                  :placeholder="dialogMode === 'edit' ? t('TXT_CODE_DESKTOP_USERS_PASSWORD_HELP') : ''" />
              <span v-if="dialogMode === 'edit'" class="du-form-hint">
                  {{ t("TXT_CODE_DESKTOP_USERS_PASSWORD_HELP") }}
              </span>
          </div>
          <div class="du-form-group">
              <label class="du-form-label">
                  <VIcon icon="mdi-shield-check-outline"  /> {{ t("TXT_CODE_FILE_PERMISSIONS") }}
              </label>
              <VRadioGroup v-model="form.permission" inline hide-details class="du-radio-group">
                  <VRadio :value="10" :label="t('TXT_CODE_COMMON_ADMIN')" />
                  <VRadio :value="1" :label="t('TXT_CODE_COMMON_USER')" />
              </VRadioGroup>
          </div>
          <div v-if="formError" class="du-form-error">{{ formError }}</div>
          <template #footer>
            <VBtn class="du-btn du-btn--default" variant="text" @click="closeDialog">
                {{ t("TXT_CODE_COMMON_CANCEL") }}
            </VBtn>
            <VBtn class="du-btn du-btn--primary" variant="text" :disabled="saving" @click="saveUser">
                {{ t("TXT_CODE_COMMON_SAVE") }}
            </VBtn>
          </template>
        </DesktopDialog>

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="showDeleteConfirm" id="user-delete-dialog"
            :title="t('TXT_CODE_DESKTOP_USERS_DELETE')"
            :message="t('TXT_CODE_DESKTOP_USERS_DELETE_CONFIRM', { name: deletingUser?.userName })"
            danger :loading="saving" :ok-text="t('TXT_CODE_DESKTOP_USERS_DELETE')"
            @cancel="cancelDelete" @confirm="executeDelete" />

        <DesktopDialog
          id="user-assign-dialog"
          :title="t('TXT_CODE_COMMON_ASSIGN')"
          :icon="LinkOutlined"
          :model-value="showAssignDialog"
          :width="780"
          :height="560"
          :z-index="10003"
          @close="closeAssignDialog"
          :padded="false"
          :scrollable="false"
        >
          <div class="du-assign-layout">
              <div class="du-assign-panel du-assign-panel--assigned">
                  <div class="du-assign-panel__header">
                      <VIcon icon="mdi-database-outline"  />
                      {{ t("TXT_CODE_DESKTOP_USERS_ASSIGNED") }}
                      <span class="du-assign-count">{{ assignedInstances.length }}</span>
                  </div>
                  <div class="du-assign-panel__body">
                      <Empty
                        v-if="assignedInstances.length === 0"
                        icon="mdi-view-grid-outline"
                        :title="t('TXT_CODE_DESKTOP_USERS_NO_ASSIGNED')"
                        compact
                      />
                      <div v-for="inst in assignedInstances" :key="inst.instanceUuid"
                          class="du-assign-item">
                          <div class="du-assign-item__info">
                              <span class="du-assign-item__name">{{ inst.nickname ||
                                  t("TXT_CODE_DESKTOP_IM_UNNAMED") }}</span>
                              <span class="du-assign-item__node">{{ inst.hostIp }}</span>
                          </div>
                          <VBtn icon variant="text" class="du-assign-item__remove"
                              @click.stop="removeAssignedInstance(inst.instanceUuid)">
                              <VIcon icon="mdi-close-circle-outline"  />
                          </VBtn>
                      </div>
                  </div>
              </div>

              <div class="du-assign-panel du-assign-panel--browse">
                  <div class="du-assign-panel__header">
                      {{ t("TXT_CODE_DESKTOP_USERS_BROWSE_INSTANCES") }}
                  </div>
                  <div class="du-assign-browse-toolbar">
                      <div class="du-assign-node-select">
                          <VSelect v-if="nodes?.length" v-model="currentRemoteNodeId" :items="assignNodeItems"
                              class="du-assign-select" density="compact" hide-details
                              @update:model-value="handleAssignNodeChange">
                            <template #no-data><Empty :icon="false" compact /></template>
                          </VSelect>
                      </div>
                      <div class="du-assign-search">
                          <VTextField v-model="assignForm.instanceName" class="du-assign-search__input" density="compact" hide-details
                              prepend-inner-icon="mdi-magnify" :placeholder="t('TXT_CODE_DESKTOP_IM_SEARCH')"
                              @update:model-value="handleAssignSearch" />
                      </div>
                  </div>
                  <div class="du-assign-panel__body">
                      <div v-if="instancesLoading" class="du-assign-loading">
                          {{ t("TXT_CODE_COMMON_LOADING_DATA") }}
                      </div>
                      <Empty
                        v-else-if="!instances?.data?.length"
                        icon="mdi-view-grid-outline"
                        :title="t('TXT_CODE_DESKTOP_IM_NO_INSTANCES')"
                        compact
                      />
                      <div v-for="inst in instances?.data || []" :key="inst.instanceUuid"
                          class="du-assign-item"
                          :class="{ 'du-assign-item--selected': isInstanceAssigned(inst.instanceUuid) }">
                          <div class="du-assign-item__info">
                              <span class="du-assign-item__name">{{ inst.config.nickname ||
                                  t("TXT_CODE_DESKTOP_IM_UNNAMED") }}</span>
                              <span class="du-assign-item__status"
                                  :class="'du-assign-item__status--' + inst.status">
                                  {{ getInstanceStatusLabel(inst.status) }}
                              </span>
                          </div>
                          <VBtn v-if="!isInstanceAssigned(inst.instanceUuid)" icon variant="text"
                              class="du-assign-item__add" @click.stop="addAssignedInstance({
                                  instanceUuid: inst.instanceUuid,
                                  daemonId: currentRemoteNode?.uuid ?? '',
                                  nickname: inst.config.nickname,
                                  status: inst.status,
                                  hostIp: currentRemoteNode ? `${currentRemoteNode.ip}:${currentRemoteNode.port}` : ''
                              })">
                              <VIcon icon="mdi-plus"  />
                          </VBtn>
                          <span v-else class="du-assign-item__check">
                              <VIcon icon="mdi-check-circle-outline"  />
                          </span>
                      </div>
                  </div>
                  <div v-if="instances" class="du-assign-pagination">
                      <VBtn class="du-page-btn" variant="text" :disabled="assignForm.currentPage <= 1"
                          @click="assignForm.currentPage--; loadRemoteInstances()">
                          {{ t("TXT_CODE_DESKTOP_IM_PREV") }}
                      </VBtn>
                      <span class="du-page-info">{{ assignForm.currentPage }} / {{ instances.maxPage
                      }}</span>
                      <VBtn class="du-page-btn" variant="text" :disabled="assignForm.currentPage >= instances.maxPage"
                          @click="assignForm.currentPage++; loadRemoteInstances()">
                          {{ t("TXT_CODE_COMMON_NEXT") }}
                      </VBtn>
                  </div>
              </div>
          </div>
          <template #footer>
            <VBtn class="du-btn du-btn--default" variant="text" @click="closeAssignDialog">
                {{ t("TXT_CODE_COMMON_CANCEL") }}
            </VBtn>
            <VBtn class="du-btn du-btn--primary" variant="text" :disabled="assignSaving"
                @click="saveAssignedInstances">
                {{ t("TXT_CODE_COMMON_SAVE") }}
            </VBtn>
          </template>
        </DesktopDialog>
    </div>
</template>

<style lang="scss" scoped>
.desktop-users {
    height: 100%;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
}

.du-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

.du-search {
    flex: 1;
    min-width: 0;
    max-width: 320px;

    &__input {
        width: 100%;
    }
}

.du-btn {
    padding: 7px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--desktop-window-text);
    white-space: nowrap;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &--primary {
        background: var(--color-blue-5, #1677ff);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--color-blue-6, #4096ff);
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }
}

.du-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.du-user-name {
    display: flex;
    align-items: center;
    gap: 6px;

    &__icon {
        color: var(--desktop-window-text-muted);
        font-size: 14px;
    }
}

.du-badge-icon {
    &--yes {
        color: var(--color-green-5, #52c41a);
    }

    &--no {
        color: var(--desktop-window-text-muted);
    }
}

.du-action-btns {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
}

.du-action-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
    background: transparent;

    &:hover {
        background: var(--desktop-window-control-hover);
    }
}

@layer vuetify-overrides {
    .du-action-btn {
        color: var(--desktop-window-text-secondary);

        &:hover {
            color: var(--desktop-window-text);
        }
    }
}

.du-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-shrink: 0;
    padding: 4px 0;
}

.du-page-btn {
    padding: 4px 12px;
    border: 1px solid var(--desktop-window-border);
    border-radius: 4px;
    background: transparent;
    color: var(--desktop-window-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover:not(:disabled) {
        border-color: var(--desktop-window-border);
        color: var(--desktop-window-text);
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
}

.du-page-info {
    font-size: 12px;
    color: var(--desktop-window-text-muted);
}

.du-form-group {
    margin-bottom: 14px;

    &:last-child {
        margin-bottom: 0;
    }
}

.du-form-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--desktop-window-text-secondary);
    margin-bottom: 6px;
    font-weight: 500;
}

.du-form-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;

    &::placeholder {
        color: var(--desktop-window-text-muted);
    }

    &:focus {
        border-color: var(--desktop-window-border);
    }

    &:disabled {
        opacity: 0.5;
    }
}

.du-form-hint {
    display: block;
    font-size: 11px;
    color: var(--desktop-window-text-muted);
    margin-top: 4px;
}

.du-form-error {
    padding: 8px 10px;
    background: rgba(255, 77, 79, 0.1);
    border: 1px solid rgba(255, 77, 79, 0.2);
    border-radius: 6px;
    color: #ff4d4f;
    font-size: 12px;
    margin-top: 8px;
}

.du-radio-group {
    display: flex;
    gap: 8px;
}

.du-assign-layout {
    display: flex;
    flex: 1;
    gap: 12px;
    padding: 16px;
    overflow: hidden;
}

.du-assign-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    overflow: hidden;

    &--assigned {
        max-width: 280px;
        flex: 0 0 280px;
    }

    &--browse {
        flex: 1;
    }

    &__header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 600;
        color: var(--desktop-window-text);
        background: var(--desktop-window-titlebar-bg);
        border-bottom: 1px solid var(--desktop-window-border);
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    &__body {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
    }
}

.du-assign-count {
    margin-left: auto;
    background: rgba(22, 119, 255, 0.2);
    color: #1677ff;
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 10px;
    font-weight: 600;
}

.du-assign-loading {
    text-align: center;
    padding: 24px 12px;
    font-size: 13px;
    color: var(--desktop-window-text-muted);
}

.du-assign-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    transition: background 0.15s;
    cursor: default;

    &:hover {
        background: var(--desktop-window-control-hover);
    }

    &--selected {
        background: rgba(22, 119, 255, 0.06);
        border: 1px solid rgba(22, 119, 255, 0.15);
    }

    &__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__name {
        font-size: 13px;
        color: var(--desktop-window-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    &__node {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
        font-family: monospace;
    }

    &__status {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 3px;
        display: inline-block;
        width: fit-content;

        &--3 {
            background: rgba(82, 196, 26, 0.15);
            color: #52c41a;
        }

        &--0 {
            background: var(--desktop-window-titlebar-bg);
            color: var(--desktop-window-text-muted);
        }

        &--2 {
            background: rgba(250, 173, 20, 0.15);
            color: #faad14;
        }

        &--1,
        &---1 {
            background: rgba(255, 77, 79, 0.15);
            color: #ff4d4f;
        }
    }

    &__remove,
    &__add {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.15s;
        flex-shrink: 0;
        background: transparent;
        color: var(--desktop-window-text-muted);
    }

    &__remove:hover {
        background: rgba(255, 77, 79, 0.15);
        color: #ff4d4f;
    }

    &__add:hover {
        background: rgba(22, 119, 255, 0.15);
        color: #1677ff;
    }

    &__check {
        color: #52c41a;
        font-size: 14px;
        flex-shrink: 0;
    }
}

.du-assign-browse-toolbar {
    display: flex;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--desktop-window-border);
}

.du-assign-node-select {
    flex-shrink: 0;
}

.du-assign-select {
    padding: 5px 8px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 4px;
    color: var(--desktop-window-text);
    font-size: 12px;
    outline: none;
    cursor: pointer;
    max-width: 180px;

    option {
        background: var(--desktop-window-bg);
        color: var(--desktop-window-text);
    }

    &:focus {
        border-color: var(--desktop-window-border);
    }
}

.du-assign-search {
    flex: 1;

    &__input {
        width: 100%;
        padding: 5px 8px;
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);
        border-radius: 4px;
        color: var(--desktop-window-text);
        font-size: 12px;
        outline: none;
        box-sizing: border-box;

        &::placeholder {
            color: var(--desktop-window-text-muted);
        }

        &:focus {
            border-color: var(--desktop-window-border);
        }
    }
}

.du-assign-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    border-top: 1px solid var(--desktop-window-border);
}
</style>
