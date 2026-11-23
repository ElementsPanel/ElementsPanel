<script setup lang="ts">
import { getInstanceDeleteError } from "../tools/deletion";
import { openInstanceTagsEditor } from "@elementspanel/epanel-plugin-console/components/fc";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { verifyEULA } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import {
  useInstanceTagSearch,
  useInstanceTagTips
} from "@elementspanel/epanel-plugin-console/hooks/useInstanceTag";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  remoteInstances,
  remoteNodeList
} from "@elementspanel/epanel-plugin-console/services/apis";
import {
  batchDelete,
  batchKill,
  batchRestart,
  batchStart,
  batchStop,
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { formatMemoryUsage } from "@elementspanel/epanel-plugin-console/tools/memory";
import { computeNodeName } from "@elementspanel/epanel-plugin-console/tools/nodes";
import { parseTimestamp } from "@elementspanel/epanel-plugin-console/tools/time";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import type { InstanceDetail, NodeStatus } from "@elementspanel/epanel-plugin-console/types";
import {
  INSTANCE_STATUS,
  INSTANCE_STATUS_CODE
} from "@elementspanel/epanel-plugin-console/types/const";
import { notification } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { throttle } from "lodash";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VCheckbox,
  VChip,
  VCol,
  VContainer,
  VDialog,
  VDivider,
  VIcon,
  VList,
  VListItem,
  VMenu,
  VPagination,
  VProgressCircular,
  VRow,
  VSelect,
  VTextField,
  VTooltip
} from "vuetify/components";
import { useInstanceMoreDetail, type InstanceMoreDetail } from "../hooks/useInstance";

const operationForm = ref({ instanceName: "", currentPage: 1, pageSize: 20, status: "" });
const currentRemoteNode = ref<NodeStatus>();
const multipleMode = ref(false);
const selectedInstance = ref<InstanceMoreDetail[]>([]);
type CardAction = "start" | "stop" | "restart" | "kill" | "update" | "delete";
const pendingCardActions = ref(new Map<string, CardAction>());
const cardActionKey = (item: InstanceMoreDetail) =>
  `${currentRemoteNode.value?.uuid || ""}/${item.instanceUuid}`;
const getPendingCardAction = (item: InstanceMoreDetail) =>
  pendingCardActions.value.get(cardActionKey(item));
const { isPhone } = useScreen();

const { execute: getNodes, state: nodes, isLoading: nodesLoading } = remoteNodeList();
const { execute: getInstances, state: instances, isLoading: instancesLoading } = remoteInstances();
const { updateTagTips, tagTips } = useInstanceTagTips();
const {
  tags: selectedTags,
  setRefreshFn,
  selectTag,
  removeTag,
  isTagSelected,
  clearTags
} = useInstanceTagSearch();

const isLoading = computed(() => nodesLoading.value || instancesLoading.value);
const instancesMoreInfo = computed(() =>
  (instances.value?.data || []).map((item) => useInstanceMoreDetail(item as InstanceMoreDetail))
);

const initNodes = async () => {
  await getNodes();
  nodes.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  if (!nodes.value?.length)
    throw new Error(
      t(
        "TXT_CODE_COMMON_THE_PANEL_COULD_NOT_CONNECT_TO_ANY_REMOTE_DAEMONS_PLEASE_GO_TO_THE_DAEMONS_FIRST_TO"
      )
    );
  const saved = localStorage.getItem("pageSelectedRemote");
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as NodeStatus;
      currentRemoteNode.value = nodes.value.find((item) => item.uuid === parsed.uuid);
    } catch {
      currentRemoteNode.value = undefined;
    }
  }
  currentRemoteNode.value ||= nodes.value[0];
};

const initInstancesData = async (resetPage = false) => {
  try {
    selectedInstance.value = [];
    if (resetPage) operationForm.value.currentPage = 1;
    if (!currentRemoteNode.value) await initNodes();
    await getInstances({
      params: {
        daemonId: currentRemoteNode.value?.uuid || "",
        page: operationForm.value.currentPage,
        page_size: operationForm.value.pageSize,
        status: operationForm.value.status,
        instance_name: operationForm.value.instanceName.trim(),
        tag: JSON.stringify(selectedTags.value)
      }
    });
    updateTagTips(instances.value?.allTags || []);
  } catch (error: any) {
    reportErrorMsg(error.message || t("TXT_CODE_COMMON_ABNORMAL_ACCESS_TO_REMOTE_NODE"));
  }
};

const handleQueryInstance = throttle(() => initInstancesData(true), 600);
const toTerminal = (item: InstanceDetail) =>
  router.push({
    path: "/instances/terminal",
    query: { daemonId: currentRemoteNode.value?.uuid, instanceId: item.instanceUuid }
  });
const toCreate = () => router.push("/instances/create");
const toNodes = () => router.push("/node");

const changeNode = async (node: NodeStatus) => {
  if (!node.available) return;
  currentRemoteNode.value = node;
  localStorage.setItem("pageSelectedRemote", JSON.stringify(node));
  await initInstancesData(true);
};

const findSelected = (item: InstanceMoreDetail) =>
  selectedInstance.value.some((v) => v.instanceUuid === item.instanceUuid);
const toggleSelected = (item: InstanceMoreDetail) => {
  const index = selectedInstance.value.findIndex((v) => v.instanceUuid === item.instanceUuid);
  if (index >= 0) selectedInstance.value.splice(index, 1);
  else selectedInstance.value.push(item);
};
const selectAll = () => {
  selectedInstance.value =
    selectedInstance.value.length === instancesMoreInfo.value.length
      ? []
      : [...instancesMoreInfo.value];
};
const selectInstance = (item: InstanceMoreDetail) =>
  multipleMode.value ? toggleSelected(item) : toTerminal(item);
const exitMultiple = () => {
  multipleMode.value = false;
  selectedInstance.value = [];
};

const operationApis = {
  start: batchStart,
  stop: batchStop,
  restart: batchRestart,
  kill: batchKill
};
const batchOperation = async (action: keyof typeof operationApis) => {
  if (!selectedInstance.value.length)
    return reportErrorMsg(t("TXT_CODE_COMMON_CANNOT_EXECUTE_PLEASE_SELECT_AT_LEAST_ONE_INSTANCE"));
  try {
    const { execute, state } = operationApis[action]();
    await execute({
      data: selectedInstance.value.map((item) => ({
        instanceUuid: item.instanceUuid,
        daemonId: currentRemoteNode.value?.uuid || ""
      }))
    });
    if (state.value) {
      notification.success({ message: t("TXT_CODE_INSTANCE_COMMANDS_SENT_HINT") });
      exitMultiple();
      await initInstancesData();
    }
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};

const batchDeleteInstances = (deleteFile: boolean) => {
  if (!selectedInstance.value.length)
    return reportErrorMsg(t("TXT_CODE_COMMON_CANNOT_EXECUTE_PLEASE_SELECT_AT_LEAST_ONE_INSTANCE"));
  const uuids = selectedInstance.value.map((item) => item.instanceUuid);
  const paths = selectedInstance.value.map((item) => item.config?.cwd).filter(Boolean);
  const dialog = Modal.confirm({
    title: t("TXT_CODE_COMMON_FINAL_CONFIRMATION"),
    content: deleteFile
      ? t("TXT_CODE_INSTANCE_DELETE_DIRECTORY_WARNING")
      : t("TXT_CODE_COMMON_REMOVES_INSTANCE_RECORDS_AND_KEEPS_THE_FILES"),
    okText: t("TXT_CODE_COMMON_CONFIRM"),
    async onOk() {
      const { execute, state } = batchDelete();
      await execute({
        params: { daemonId: currentRemoteNode.value?.uuid || "" },
        data: { uuids, deleteFile }
      });
      if (state.value) {
        dialog.destroy();
        const error = getInstanceDeleteError(state.value);
        if (error) reportErrorMsg(error);
        else notification.success({ message: t("TXT_CODE_COMMON_BULK_DELETION_SUCCESSFUL") });
        exitMultiple();
        await initInstancesData(true);
      }
    }
  });
  void paths;
};

const runCardAction = async (item: InstanceMoreDetail, action: Exclude<CardAction, "delete">) => {
  const key = cardActionKey(item);
  if (pendingCardActions.value.has(key)) return;
  const params = {
    params: { uuid: item.instanceUuid, daemonId: currentRemoteNode.value?.uuid || "" }
  };
  pendingCardActions.value.set(key, action);
  try {
    if (action === "start") {
      if (!(await verifyEULA(item.instanceUuid, params.params.daemonId))) return;
      await openInstance().execute(params);
    }
    if (action === "stop") await stopInstance().execute(params);
    if (action === "restart") await restartInstance().execute(params);
    if (action === "kill") await killInstance().execute(params);
    if (action === "update")
      await updateInstance().execute({
        ...params,
        params: { ...params.params, task_name: "update" },
        data: { time: Date.now() }
      });
    await initInstancesData();
  } catch (error: any) {
    reportErrorMsg(error.message);
  } finally {
    pendingCardActions.value.delete(key);
  }
};

const confirmCardAction = (item: InstanceMoreDetail, action: "stop" | "restart" | "kill") =>
  Modal.confirm({
    title: t("TXT_CODE_INSTANCE_SECONDARY_CONFIRMATION"),
    content: {
      stop: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_SEND_A_SHUTDOWN_COMMAND_TO_THE_INSTANCE"),
      restart: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_RESTART_THE_INSTANCE"),
      kill: t("TXT_CODE_INSTANCE_FORCE_STOP_DATA_LOSS_WARNING")
    }[action],
    onOk: () => runCardAction(item, action)
  });

const editCardTags = async (item: InstanceMoreDetail) => {
  const tags = item.config.tag || [];
  const newTags = await openInstanceTagsEditor(
    item.instanceUuid,
    currentRemoteNode.value?.uuid || "",
    tags
  );
  if (JSON.stringify(newTags) !== JSON.stringify(tags)) await initInstancesData();
};

const canUpdate = (item: InstanceMoreDetail) =>
  item.status === INSTANCE_STATUS_CODE.STOPPED && Boolean(item.config.updateCommand?.trim());

const deleteDialogOpen = ref(false);
const deleteDialogItem = ref<InstanceMoreDetail>();
const deleteDialogFiles = ref(false);
const deleteDialogLoading = ref(false);

const openDeleteDialog = (item: InstanceMoreDetail) => {
  deleteDialogItem.value = item;
  deleteDialogFiles.value = false;
  deleteDialogOpen.value = true;
};

const closeDeleteDialog = () => {
  if (deleteDialogLoading.value) return;
  deleteDialogOpen.value = false;
  deleteDialogItem.value = undefined;
};

const deleteCardInstance = async () => {
  const item = deleteDialogItem.value;
  if (!item || deleteDialogLoading.value) return;
  const key = cardActionKey(item);
  if (pendingCardActions.value.has(key)) return;

  deleteDialogLoading.value = true;
  pendingCardActions.value.set(key, "delete");
  try {
    const { execute, state } = batchDelete();
    await execute({
      params: { daemonId: currentRemoteNode.value?.uuid || "" },
      data: {
        uuids: [item.instanceUuid],
        deleteFile: deleteDialogFiles.value
      }
    });
    if (state.value) {
      const error = getInstanceDeleteError(state.value);
      if (error) reportErrorMsg(error);
      else notification.success({ message: t("TXT_CODE_COMMON_INSTANCE_DELETED_SUCCESSFULLY") });
      deleteDialogOpen.value = false;
      deleteDialogItem.value = undefined;
      await initInstancesData(true);
    }
  } catch (error: any) {
    reportErrorMsg(error.message);
  } finally {
    deleteDialogLoading.value = false;
    pendingCardActions.value.delete(key);
  }
};

const statusColor = (item: InstanceMoreDetail) => {
  if (item.status === INSTANCE_STATUS_CODE.RUNNING) return "success";
  if (item.status === INSTANCE_STATUS_CODE.STARTING) return "warning";
  if (item.status === INSTANCE_STATUS_CODE.BUSY) return "error";
  return "secondary";
};
const statusText = (item: InstanceMoreDetail) => INSTANCE_STATUS[item.status] || "--";
const memoryText = (item: InstanceMoreDetail) =>
  formatMemoryUsage(item.info?.memoryUsage, item.info?.memoryLimit);
const bytesText = (value?: number) =>
  prettyBytes(value || 0, { binary: true, maximumFractionDigits: 1 });

onMounted(async () => {
  await initInstancesData();
  setRefreshFn(initInstancesData);
});
</script>

<template>
  <main class="instance-list-page">
    <VContainer fluid class="instance-list-container">
      <PageToolbar :title="t('TXT_CODE_INSTANCE_LIST_TITLE')" icon="mdi-view-grid-outline">
        <template #search>
          <div class="instance-search-row">
            <VSelect
              v-model="operationForm.status"
              :items="[
                { title: t('TXT_CODE_COMMON_ALL'), value: '' },
                ...Object.entries(INSTANCE_STATUS).map(([value, title]) => ({ title, value }))
              ]"
              hide-details
              density="comfortable"
              @update:model-value="handleQueryInstance"
            >
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect>
            <VTextField
              v-model="operationForm.instanceName"
              :label="t('TXT_CODE_COMMON_SEARCH_BY_INSTANCE_NAME')"
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
              density="comfortable"
              @keyup.enter="handleQueryInstance"
              @update:model-value="
                operationForm.instanceName = $event ?? '';
                handleQueryInstance();
              "
            />
          </div>
        </template>
        <template #actions>
          <VMenu location="bottom end">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                variant="tonal"
                prepend-icon="mdi-server-outline"
                :disabled="!currentRemoteNode"
              >
                <span class="node-name">{{
                  computeNodeName(
                    currentRemoteNode?.ip || "",
                    currentRemoteNode?.available ?? false,
                    currentRemoteNode?.remarks
                  )
                }}</span>
                <VIcon icon="mdi-chevron-down" end />
              </VBtn>
            </template>
            <VList density="comfortable">
              <VListItem
                v-for="node in nodes || []"
                :key="node.uuid"
                :disabled="!node.available"
                :title="computeNodeName(node.ip, node.available, node.remarks)"
                :prepend-icon="node.available ? 'mdi-database-outline' : 'mdi-server-off-outline'"
                @click="changeNode(node)"
              />
              <VDivider />
              <VListItem
                :title="t('TXT_CODE_COMMON_MANAGE_REMOTE_DAEMON')"
                prepend-icon="mdi-pencil-outline"
                @click="toNodes"
              />
            </VList>
          </VMenu>
          <VBtn
            color="primary"
            prepend-icon="mdi-plus"
            :disabled="!currentRemoteNode?.available"
            @click="toCreate"
            >{{ t("TXT_CODE_COMMON_CREATE") }}</VBtn
          >
        </template>
      </PageToolbar>

      <VRow class="instance-actions-row d-flex align-center">
        <VCol cols="12" md="7">
          <div v-if="multipleMode" class="batch-actions">
            <VBtn variant="text" prepend-icon="mdi-close" @click="exitMultiple">{{
              t("TXT_CODE_COMMON_EXIT_BATCH_OPERATION")
            }}</VBtn>
            <VBtn variant="text" @click="selectAll">{{
              selectedInstance.length === instancesMoreInfo.length
                ? t("TXT_CODE_COMMON_DESELECT_ALL")
                : t("TXT_CODE_COMMON_SELECT_ALL")
            }}</VBtn>
            <VMenu>
              <template #activator="{ props: menuProps }">
                <VBtn v-bind="menuProps" color="primary" append-icon="mdi-chevron-down">{{
                  t("TXT_CODE_COMMON_SELECTED_ITEMS")
                }}</VBtn>
              </template>
              <VList>
                <VListItem
                  :title="t('TXT_CODE_COMMON_START')"
                  prepend-icon="mdi-play"
                  @click="batchOperation('start')"
                />
                <VListItem
                  :title="t('TXT_CODE_COMMON_STOP')"
                  prepend-icon="mdi-stop"
                  @click="batchOperation('stop')"
                />
                <VListItem
                  :title="t('TXT_CODE_COMMON_RESTART')"
                  prepend-icon="mdi-restart"
                  @click="batchOperation('restart')"
                />
                <VListItem
                  :title="t('TXT_CODE_COMMON_TERMINATE')"
                  prepend-icon="mdi-close-circle-outline"
                  @click="batchOperation('kill')"
                />
                <VListItem
                  :title="t('TXT_CODE_COMMON_DELETE')"
                  prepend-icon="mdi-delete-outline"
                  @click="batchDeleteInstances(false)"
                />
                <VListItem
                  :title="t('TXT_CODE_COMMON_PERMANENTLY_DELETE')"
                  prepend-icon="mdi-delete-forever-outline"
                  @click="batchDeleteInstances(true)"
                />
              </VList>
            </VMenu>
            <span class="selected-count"
              >{{ t("TXT_CODE_INSTANCE_SELECTED_COUNT_LABEL") }}{{ selectedInstance.length }}
              {{ t("TXT_CODE_COMMON_ITEMS") }}</span
            >
          </div>
          <div v-else class="batch-actions">
            <VBtn
              variant="text"
              prepend-icon="mdi-checkbox-multiple-outline"
              @click="multipleMode = true"
              >{{ t("TXT_CODE_COMMON_BATCH_OPERATION") }}</VBtn
            >
            <VBtn
              variant="text"
              prepend-icon="mdi-refresh"
              :loading="isLoading"
              @click="initInstancesData"
              >{{ t("TXT_CODE_COMMON_REFRESH") }}</VBtn
            >
          </div>
        </VCol>
        <VCol cols="12" md="5" class="pagination-wrap">
          <VPagination
            v-model="operationForm.currentPage"
            :length="instances?.maxPage || 1"
            :total-visible="isPhone ? 1 : 5"
            :disabled="isLoading"
            density="compact"
            @update:model-value="() => initInstancesData()"
          />
          <VSelect
            v-model="operationForm.pageSize"
            :items="[10, 20, 50, 100]"
            :disabled="isLoading"
            hide-details
            class="page-size-select"
            @update:model-value="() => initInstancesData(true)"
          >
            <template #no-data><Empty :icon="false" compact /></template>
          </VSelect>
        </VCol>
      </VRow>

      <div v-if="tagTips?.length" class="tag-row">
        <VChip
          v-if="selectedTags.length"
          color="error"
          variant="tonal"
          data-app-surface="control"
          prepend-icon="mdi-filter-remove"
          @click="clearTags"
          >{{ t("TXT_CODE_COMMON_CLEAR") }}</VChip
        >
        <VChip
          v-for="tag in tagTips"
          :key="tag"
          :color="isTagSelected(tag) ? 'primary' : undefined"
          data-app-surface="control"
          :variant="isTagSelected(tag) ? 'tonal' : 'flat'"
          @click="isTagSelected(tag) ? removeTag(tag) : selectTag(tag)"
        >
          {{ tag }}</VChip
        >
      </div>

      <div v-if="isLoading" class="state-container">
        <VProgressCircular indeterminate />
      </div>
      <VRow v-else-if="instancesMoreInfo.length" class="instance-grid" density="comfortable">
        <VCol
          v-for="item in instancesMoreInfo"
          :key="item.instanceUuid"
          cols="12"
          sm="6"
          lg="4"
          xl="3"
        >
          <VCard
            class="instance-card"
            :class="{ selected: multipleMode && findSelected(item) }"
            rounded="xl"
            flat
            @click="selectInstance(item)"
          >
            <VCardTitle class="instance-card-title">
              <div class="instance-card-heading">
                <span class="instance-name">{{ item.config.nickname }}</span>
              </div>
              <div class="instance-card-meta">
                <div v-if="item.config.tag?.length" class="instance-card-tags">
                  <VChip
                    v-for="tag in item.config.tag"
                    :key="tag"
                    size="x-small"
                    color="primary"
                    variant="flat"
                    >{{ tag }}</VChip
                  >
                </div>
                <VDivider
                  v-if="item.config.tag?.length"
                  vertical
                  class="instance-card-status-divider"
                />
                <VChip
                  size="small"
                  :color="statusColor(item)"
                  variant="tonal"
                  :prepend-icon="
                    item.status === INSTANCE_STATUS_CODE.RUNNING
                      ? 'mdi-check-circle-outline'
                      : 'mdi-alert-circle-outline'
                  "
                  >{{ statusText(item) }}</VChip
                >
              </div>
            </VCardTitle>
            <VCardText class="instance-card-content">
              <div class="instance-detail">
                <span>{{ t("TXT_CODE_COMMON_INSTANCE_TYPE") }}</span
                ><strong>{{ item.moreInfo?.instanceTypeText || "--" }}</strong>
              </div>
              <div class="instance-detail">
                <span>{{ t("TXT_CODE_COMMON_STARTUP") }}</span
                ><strong>{{ parseTimestamp(item.config.lastDatetime) }}</strong>
              </div>
              <div v-if="item.info?.memoryUsage != null" class="instance-detail">
                <span>{{ t("TXT_CODE_COMMON_MEMORY") }}</span
                ><strong>{{ memoryText(item) }}</strong>
              </div>
              <div v-if="item.info?.cpuUsage != null" class="instance-detail">
                <span>{{ t("TXT_CODE_COMMON_CPU_USAGE") }}</span
                ><strong>{{ Number(item.info.cpuUsage).toFixed(0) }}%</strong>
              </div>
              <div v-if="item.info?.storageUsage != null" class="instance-detail">
                <span>{{ t("TXT_CODE_DISK_USAGE") }}</span
                ><strong>{{ bytesText(item.info.storageUsage) }}</strong>
              </div>
            </VCardText>
            <VCardActions class="instance-card-actions" @click.stop>
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-if="item.status === INSTANCE_STATUS_CODE.STOPPED"
                    v-bind="tooltipProps"
                    icon="mdi-play"
                    size="small"
                    color="success"
                    variant="text"
                    :loading="getPendingCardAction(item) === 'start'"
                    :disabled="!!getPendingCardAction(item)"
                    @click="runCardAction(item, 'start')"
                  /> </template
                ><span>{{ t("TXT_CODE_COMMON_START") }}</span>
              </VTooltip>
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-if="item.status === INSTANCE_STATUS_CODE.RUNNING"
                    v-bind="tooltipProps"
                    icon="mdi-stop"
                    size="small"
                    color="warning"
                    variant="text"
                    :loading="getPendingCardAction(item) === 'stop'"
                    :disabled="!!getPendingCardAction(item)"
                    @click="confirmCardAction(item, 'stop')"
                  /> </template
                ><span>{{ t("TXT_CODE_COMMON_STOP") }}</span>
              </VTooltip>
              <VTooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-if="item.status === INSTANCE_STATUS_CODE.RUNNING"
                    v-bind="tooltipProps"
                    icon="mdi-restart"
                    size="small"
                    variant="text"
                    :loading="getPendingCardAction(item) === 'restart'"
                    :disabled="!!getPendingCardAction(item)"
                    @click="confirmCardAction(item, 'restart')"
                  />
                </template>
                <span>{{ t("TXT_CODE_COMMON_RESTART") }}</span>
              </VTooltip>
              <VTooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-if="canUpdate(item)"
                    v-bind="tooltipProps"
                    icon="mdi-cloud-download-outline"
                    size="small"
                    variant="text"
                    :loading="getPendingCardAction(item) === 'update'"
                    :disabled="!!getPendingCardAction(item)"
                    @click="runCardAction(item, 'update')"
                  />
                </template>
                <span>{{ t("TXT_CODE_COMMON_UPDATE") }}</span>
              </VTooltip>
              <VTooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-if="item.status !== INSTANCE_STATUS_CODE.STOPPED"
                    v-bind="tooltipProps"
                    icon="mdi-close-circle-outline"
                    size="small"
                    color="error"
                    variant="text"
                    :loading="getPendingCardAction(item) === 'kill'"
                    :disabled="!!getPendingCardAction(item)"
                    @click="confirmCardAction(item, 'kill')"
                  />
                </template>
                <span>{{ t("TXT_CODE_COMMON_TERMINATE") }}</span>
              </VTooltip>
              <VTooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-bind="tooltipProps"
                    icon="mdi-tag-multiple-outline"
                    size="small"
                    variant="text"
                    @click="editCardTags(item)"
                  />
                </template>
                <span>{{ t("TXT_CODE_COMMON_TAG_GROUPING") }}</span>
              </VTooltip>
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-bind="tooltipProps"
                    icon="mdi-console-line"
                    size="small"
                    variant="text"
                    @click="toTerminal(item)"
                  /> </template
                ><span>{{ t("TXT_CODE_COMMON_TERMINAL") }}</span></VTooltip
              >
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-bind="tooltipProps"
                    icon="mdi-delete-outline"
                    size="small"
                    color="error"
                    variant="text"
                    :loading="getPendingCardAction(item) === 'delete'"
                    :disabled="!!getPendingCardAction(item)"
                    @click.stop="openDeleteDialog(item)"
                  /> </template
                ><span>{{ t("TXT_CODE_COMMON_DELETE_INSTANCE") }}</span>
              </VTooltip>
            </VCardActions>
          </VCard>
        </VCol>
      </VRow>
      <Empty
        v-else
        icon="mdi-view-grid-outline"
        :title="t('TXT_CODE_COMMON_NO_CONTENT_PLEASE_TRY_CHANGING_THE_NODE_OR_SEARCH_CRITERIA')"
        :description="t('TXT_CODE_NO_DATA')"
      />
    </VContainer>
    <VDialog v-model="deleteDialogOpen" class="app-dialog" max-width="480px">
      <VCard rounded="xl" :title="t('TXT_CODE_COMMON_FINAL_CONFIRMATION')">
        <VCardText>
          <p>
            {{
              t(
                "TXT_CODE_COMMON_IF_YOU_CHOOSE_TO_DELETE_THE_INSTANCE_RELATED_FILES_AT_THE_SAME_TIME_THE_ENTIRE_DIRECTORY"
              )
            }}
          </p>
          <VCheckbox
            v-model="deleteDialogFiles"
            :label="t('TXT_CODE_COMMON_DELETE_INSTANCE_RELATED_FILES_SIMULTANEOUSLY')"
            hide-details
          />
        </VCardText>
        <VCardActions>
          <VBtn variant="text" :disabled="deleteDialogLoading" @click="closeDeleteDialog">
            {{ t("TXT_CODE_COMMON_CANCEL") }}
          </VBtn>
          <VBtn color="error" :loading="deleteDialogLoading" @click="deleteCardInstance">
            {{
              deleteDialogFiles
                ? t("TXT_CODE_COMMON_DELETE_INSTANCE_AND_RELATED_FILES")
                : t("TXT_CODE_COMMON_DELETE_INSTANCE")
            }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </main>
</template>

<style lang="scss" scoped>
.instance-list-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.instance-list-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.instance-actions-row {
  margin: 0;
}

.instance-search-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.instance-search-row .v-select {
  max-width: 150px;
}

.instance-search-row .v-text-field {
  min-width: 0;
  flex: 1;
}

.batch-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}

.pagination-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.pagination-wrap > .v-pagination {
  min-width: 0;
  max-width: 100%;
}

.node-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-count {
  color: var(--color-gray-7);
  font-size: 13px;
}

.page-size-select {
  width: 96px;
  flex: 0 0 96px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 4px 0 16px;
}

.state-container {
  display: flex;
  min-height: 360px;
  align-items: center;
  justify-content: center;
}

.instance-grid > .v-col {
  display: flex;
}

.instance-card {
  display: flex;
  width: 100%;
  flex: 1 1 auto;
  min-height: 220px;
  flex-direction: column;
}

.instance-card.selected {
  --app-surface-color: rgba(var(--v-theme-primary), 0.07);
  background: rgba(var(--v-theme-primary), 0.07);
}

.instance-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 22px 22px 12px;
}

.instance-card-heading {
  display: flex;
  min-width: 0;
  flex: 1 1 120px;
  align-items: center;
  gap: 8px;
}

.instance-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instance-card-meta {
  display: flex;
  min-width: 0;
  max-width: 100%;
  flex: 0 1 auto;
  align-items: center;
  gap: 8px;
}

.instance-card-status-divider {
  height: 20px;
  align-self: center;
}

.instance-card-tags {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.instance-card-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 22px 12px;
}

.instance-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-gray-7);
  font-size: 13px;
}

.instance-detail strong {
  overflow: hidden;
  color: var(--text-color);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instance-card-actions {
  min-height: 0;
  margin-top: -4px;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 16px 12px;
}

.instance-card-actions :deep(.v-btn .v-icon) {
  font-size: 17px;
}

@media (max-width: 992px) {
  .instance-list-container {
    padding: 16px 12px 28px;
  }

  .pagination-wrap {
    justify-content: flex-start;
  }
}
</style>
