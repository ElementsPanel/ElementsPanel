<script setup lang="ts">
import { useDeleteInstanceDialog } from "@/components/fc/index";
import PageToolbar from "@/components/PageToolbar.vue";
import { router } from "@/config/router";
import { verifyEULA } from "@/hooks/useInstance";
import { useInstanceTagSearch, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { remoteInstances, remoteNodeList } from "@/services/apis";
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
} from "@/services/apis/instance";
import { computeNodeName } from "@/tools/nodes";
import { formatMemoryUsage } from "@/tools/memory";
import { parseTimestamp } from "@/tools/time";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail, NodeStatus } from "@/types";
import { INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@/types/const";
import { Modal, notification } from "ant-design-vue";
import { throttle } from "lodash";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VCol,
  VContainer,
  VDivider,
  VEmptyState,
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
} from "vuetify/lib/components/index.mjs";
import { useInstanceMoreDetail, type InstanceMoreDetail } from "../hooks/useInstance";

const operationForm = ref({ instanceName: "", currentPage: 1, pageSize: 20, status: "" });
const currentRemoteNode = ref<NodeStatus>();
const multipleMode = ref(false);
const selectedInstance = ref<InstanceMoreDetail[]>([]);

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
const marketAvailable = computed(() => {
  void ctx.routes.revision;
  return router.getRoutes().some((route) => route.path === "/market");
});

const initNodes = async () => {
  await getNodes();
  nodes.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  if (!nodes.value?.length) throw new Error(t("TXT_CODE_e3d96a26"));
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
    reportErrorMsg(error.message || t("TXT_CODE_e109c091"));
  }
};

const handleQueryInstance = throttle(() => initInstancesData(true), 600);
const toTerminal = (item: InstanceDetail) =>
  router.push({
    path: "/instances/terminal",
    query: { daemonId: currentRemoteNode.value?.uuid, instanceId: item.instanceUuid }
  });
const toCreate = () => router.push("/instances/create");
const toMarket = () =>
  router.push({ path: "/market", query: { daemonId: currentRemoteNode.value?.uuid } });
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
  if (!selectedInstance.value.length) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  try {
    const { execute, state } = operationApis[action]();
    await execute({
      data: selectedInstance.value.map((item) => ({
        instanceUuid: item.instanceUuid,
        daemonId: currentRemoteNode.value?.uuid || ""
      }))
    });
    if (state.value) {
      notification.success({ message: t("TXT_CODE_1514d08f") });
      exitMultiple();
      await initInstancesData();
    }
  } catch (error: any) {
    reportErrorMsg(error.message);
  }
};

const batchDeleteInstances = (deleteFile: boolean) => {
  if (!selectedInstance.value.length) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const uuids = selectedInstance.value.map((item) => item.instanceUuid);
  const paths = selectedInstance.value.map((item) => item.config?.cwd).filter(Boolean);
  const dialog = Modal.confirm({
    title: t("TXT_CODE_2a3b0c17"),
    content: deleteFile ? t("TXT_CODE_18d2f8ae") : t("TXT_CODE_ac01315a"),
    okText: t("TXT_CODE_d507abff"),
    async onOk() {
      const { execute, state } = batchDelete();
      await execute({
        params: { daemonId: currentRemoteNode.value?.uuid || "" },
        data: { uuids, deleteFile }
      });
      if (state.value) {
        dialog.destroy();
        notification.success({ message: t("TXT_CODE_c3c06801") });
        exitMultiple();
        await initInstancesData(true);
      }
    }
  });
  void paths;
};

const runCardAction = async (
  item: InstanceMoreDetail,
  action: "start" | "stop" | "restart" | "kill" | "update"
) => {
  const params = {
    params: { uuid: item.instanceUuid, daemonId: currentRemoteNode.value?.uuid || "" }
  };
  try {
    if (action === "start") {
      if (!(await verifyEULA(item.instanceUuid, currentRemoteNode.value?.uuid || ""))) return;
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
  }
};

const confirmCardAction = (item: InstanceMoreDetail, action: "stop" | "restart" | "kill") =>
  Modal.confirm({
    title: t("TXT_CODE_893567ac"),
    content: t("TXT_CODE_276756b2"),
    onOk: () => runCardAction(item, action)
  });

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
      <PageToolbar :title="t('TXT_CODE_e21473bc')" icon="mdi-view-grid-outline">
        <template #search>
          <div class="instance-search-row">
            <VSelect
              v-model="operationForm.status"
              :items="[
                { title: t('TXT_CODE_c48f6f64'), value: '' },
                ...Object.entries(INSTANCE_STATUS).map(([value, title]) => ({ title, value }))
              ]"
              hide-details
              density="comfortable"
              @update:model-value="handleQueryInstance"
            />
            <VTextField
              v-model="operationForm.instanceName"
              :placeholder="t('TXT_CODE_ce132192')"
              prepend-inner-icon="mdi-magnify"
              hide-details
              density="comfortable"
              @keyup.enter="handleQueryInstance"
              @update:model-value="handleQueryInstance"
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
                :title="t('TXT_CODE_28e53fed')"
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
            >{{ t("TXT_CODE_53408064") }}</VBtn
          >
        </template>
      </PageToolbar>

      <VRow align="center" class="instance-actions-row">
        <VCol cols="12" md="7">
          <div v-if="multipleMode" class="batch-actions">
            <VBtn variant="text" prepend-icon="mdi-close" @click="exitMultiple">{{
              t("TXT_CODE_5366af54")
            }}</VBtn>
            <VBtn variant="text" @click="selectAll">{{
              selectedInstance.length === instancesMoreInfo.length
                ? t("TXT_CODE_df87c46d")
                : t("TXT_CODE_f466d7a")
            }}</VBtn>
            <VMenu>
              <template #activator="{ props: menuProps }"
                ><VBtn v-bind="menuProps" color="primary" append-icon="mdi-chevron-down">{{
                  t("TXT_CODE_8fd8bfd3")
                }}</VBtn></template
              >
              <VList>
                <VListItem
                  :title="t('TXT_CODE_57245e94')"
                  prepend-icon="mdi-play"
                  @click="batchOperation('start')"
                />
                <VListItem
                  :title="t('TXT_CODE_b1dedda3')"
                  prepend-icon="mdi-stop"
                  @click="batchOperation('stop')"
                />
                <VListItem
                  :title="t('TXT_CODE_47dcfa5')"
                  prepend-icon="mdi-restart"
                  @click="batchOperation('restart')"
                />
                <VListItem
                  :title="t('TXT_CODE_7b67813a')"
                  prepend-icon="mdi-close-circle-outline"
                  @click="batchOperation('kill')"
                />
                <VListItem
                  :title="t('TXT_CODE_ecbd7449')"
                  prepend-icon="mdi-delete-outline"
                  @click="batchDeleteInstances(false)"
                />
                <VListItem
                  :title="t('TXT_CODE_9ef27367')"
                  prepend-icon="mdi-delete-forever-outline"
                  @click="batchDeleteInstances(true)"
                />
              </VList>
            </VMenu>
            <span class="selected-count"
              >{{ t("TXT_CODE_432cbc38") }}{{ selectedInstance.length }}
              {{ t("TXT_CODE_5cd3b4bd") }}</span
            >
          </div>
          <div v-else class="batch-actions">
            <VBtn
              variant="text"
              prepend-icon="mdi-checkbox-multiple-outline"
              @click="multipleMode = true"
              >{{ t("TXT_CODE_5cb656b9") }}</VBtn
            >
            <VBtn
              variant="text"
              prepend-icon="mdi-refresh"
              :loading="isLoading"
              @click="initInstancesData"
              >{{ t("TXT_CODE_b76d94e0") }}</VBtn
            >
          </div>
        </VCol>
        <VCol cols="12" md="5" class="pagination-wrap">
          <VPagination
            v-if="instances"
            v-model="operationForm.currentPage"
            :length="instances.maxPage || 1"
            total-visible="6"
            density="comfortable"
            @update:model-value="() => initInstancesData()"
          />
          <VSelect
            v-if="instances"
            v-model="operationForm.pageSize"
            :items="[10, 20, 50, 100]"
            hide-details
            density="compact"
            class="page-size-select"
            @update:model-value="() => initInstancesData(true)"
          />
        </VCol>
      </VRow>

      <div v-if="tagTips?.length" class="tag-row">
        <VChip
          v-if="selectedTags.length"
          color="error"
          variant="tonal"
          prepend-icon="mdi-filter-remove"
          @click="clearTags"
          >{{ t("TXT_CODE_7333c7f7") }}</VChip
        >
        <VChip
          v-for="tag in tagTips"
          :key="tag"
          :color="isTagSelected(tag) ? 'primary' : undefined"
          :variant="isTagSelected(tag) ? 'tonal' : 'outlined'"
          @click="isTagSelected(tag) ? removeTag(tag) : selectTag(tag)"
          >{{ tag }}</VChip
        >
      </div>

      <div v-if="isLoading" class="state-container">
        <VProgressCircular indeterminate color="primary" size="48" />
      </div>
      <VRow v-else-if="instancesMoreInfo.length" class="instance-grid">
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
            <VCardTitle class="instance-card-title"
              ><span class="instance-name">{{ item.config.nickname }}</span
              ><VChip
                size="small"
                :color="statusColor(item)"
                variant="tonal"
                :prepend-icon="
                  item.status === INSTANCE_STATUS_CODE.RUNNING
                    ? 'mdi-check-circle-outline'
                    : 'mdi-alert-circle-outline'
                "
                >{{ statusText(item) }}</VChip
              ></VCardTitle
            >
            <VCardText class="instance-card-content">
              <div class="tag-list">
                <VChip
                  v-for="tag in item.config.tag || []"
                  :key="tag"
                  size="x-small"
                  variant="outlined"
                  >{{ tag }}</VChip
                >
              </div>
              <div class="instance-detail">
                <span>{{ t("TXT_CODE_2f291d8b") }}</span
                ><strong>{{ item.moreInfo?.instanceTypeText || "--" }}</strong>
              </div>
              <div class="instance-detail">
                <span>{{ t("TXT_CODE_34611898") }}</span
                ><strong>{{ parseTimestamp(item.config.lastDatetime) }}</strong>
              </div>
              <div v-if="item.info?.memoryUsage != null" class="instance-detail">
                <span>{{ t("TXT_CODE_593ee330") }}</span
                ><strong>{{ memoryText(item) }}</strong>
              </div>
              <div v-if="item.info?.cpuUsage != null" class="instance-detail">
                <span>{{ t("TXT_CODE_b862a158") }}</span
                ><strong>{{ Number(item.info.cpuUsage).toFixed(0) }}%</strong>
              </div>
              <div v-if="item.info?.storageUsage != null" class="instance-detail">
                <span>{{ t("TXT_CODE_DISK_USAGE") }}</span
                ><strong>{{ bytesText(item.info.storageUsage) }}</strong>
              </div>
            </VCardText>
            <VCardActions class="instance-card-actions" @click.stop>
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }"
                  ><VBtn
                    v-if="item.status === INSTANCE_STATUS_CODE.STOPPED"
                    v-bind="tooltipProps"
                    icon="mdi-play"
                    size="small"
                    color="success"
                    variant="text"
                    @click="runCardAction(item, 'start')" /></template
                ><span>{{ t("TXT_CODE_57245e94") }}</span></VTooltip
              >
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }"
                  ><VBtn
                    v-if="item.status === INSTANCE_STATUS_CODE.RUNNING"
                    v-bind="tooltipProps"
                    icon="mdi-stop"
                    size="small"
                    color="warning"
                    variant="text"
                    @click="confirmCardAction(item, 'stop')" /></template
                ><span>{{ t("TXT_CODE_b1dedda3") }}</span></VTooltip
              >
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }"
                  ><VBtn
                    v-bind="tooltipProps"
                    icon="mdi-console-line"
                    size="small"
                    variant="text"
                    @click="toTerminal(item)" /></template
                ><span>{{ t("TXT_CODE_524e3036") }}</span></VTooltip
              >
              <VTooltip location="top"
                ><template #activator="{ props: tooltipProps }"
                  ><VBtn
                    v-bind="tooltipProps"
                    icon="mdi-delete-outline"
                    size="small"
                    color="error"
                    variant="text"
                    @click="
                      useDeleteInstanceDialog(
                        item.instanceUuid,
                        currentRemoteNode?.uuid || ''
                      ).then(() => initInstancesData())
                    " /></template
                ><span>{{ t("TXT_CODE_a0e19f38") }}</span></VTooltip
              >
            </VCardActions>
          </VCard>
        </VCol>
      </VRow>
      <VEmptyState v-else :title="t('TXT_CODE_5415f009')" icon="mdi-view-grid-outline">
        <template #actions
          ><VBtn
            v-if="marketAvailable"
            color="primary"
            prepend-icon="mdi-storefront-outline"
            @click="toMarket"
            >{{ t("TXT_CODE_871cb8bc") }}</VBtn
          ></template
        >
      </VEmptyState>
    </VContainer>
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
.pagination-wrap,
.batch-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
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
  width: 90px;
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
.instance-grid {
  margin: 0 -8px;
}
.instance-grid > .v-col {
  padding: 8px;
}
.instance-card {
  min-height: 220px;
  cursor: pointer;
  background: var(--background-color-white);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
}
.instance-card:hover,
.instance-card.selected {
  background: rgba(var(--v-theme-primary), 0.07);
  transform: translateY(-2px);
}
.instance-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 18px 18px 8px;
}
.instance-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.instance-card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 18px 12px;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 22px;
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
  justify-content: flex-end;
  padding: 4px 12px 12px;
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
