<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { remoteInstances, remoteNodeList } from "@/services/apis";
import { computeNodeName } from "@/tools/nodes";
import { reportErrorMsg } from "@/tools/validator";
import type { NodeStatus } from "@/types";
import { INSTANCE_STATUS } from "@/types/const";
import type { UserInstance } from "@/types/user";
import _, { throttle } from "lodash";
import { computed, onMounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VDataTable,
  VDialog,
  VIcon,
  VList,
  VListItem,
  VMenu,
  VPagination,
  VSelect,
  VSpacer,
  VTextField
} from "vuetify/lib/components/index.mjs";

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: UserInstance[]): void;
  title: string;
  keyTitle?: string;
  valueTitle?: string;
  data: UserInstance[];
  columns?: unknown[];
}

const props = defineProps<Props>();
const { isPhone } = useScreen();
const open = ref(false);

const operationForm = ref({
  instanceName: "",
  currentPage: 1,
  pageSize: 10,
  status: ""
});

const currentRemoteNode = ref<NodeStatus>();
const { execute: getNodes, state: nodes } = remoteNodeList();
const { execute: getInstances, state: instances, isLoading } = remoteInstances();

const instancesList = computed<UserInstance[]>(() =>
  (instances.value?.data || []).map((instance: any) => ({
    instanceUuid: instance.instanceUuid,
    daemonId: currentRemoteNode.value?.uuid ?? "",
    nickname: instance.config.nickname,
    status: instance.status,
    hostIp: `${currentRemoteNode.value?.ip}:${currentRemoteNode.value?.port}`,
    config: instance.config
  }))
);

const selectedItems = ref<UserInstance[]>(
  props.data instanceof Array ? _.cloneDeep(props.data) : []
);

const statusItems = computed(() => [
  { title: t("TXT_CODE_c48f6f64"), value: "" },
  ...Object.entries(INSTANCE_STATUS).map(([value, title]) => ({ title, value }))
]);

const tableHeaders = computed(() => [
  { title: t("TXT_CODE_f70badb9"), key: "nickname", sortable: false },
  { title: t("TXT_CODE_5def0cbe"), key: "safe", sortable: false },
  { title: t("TXT_CODE_fe731dfc"), key: "operation", sortable: false, align: "end" as const }
]);

const rowItem = (item: UserInstance | { raw?: UserInstance }): UserInstance =>
  (item as { raw?: UserInstance }).raw ?? (item as UserInstance);

const cancel = async () => {
  open.value = false;
  props.destroyComponent?.(1000);
};

const initNodes = async () => {
  await getNodes();
  nodes.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  if (!nodes.value?.length) {
    return reportErrorMsg(t("TXT_CODE_e3d96a26"));
  }
  const storedNode = localStorage.getItem("pageSelectedRemote");
  currentRemoteNode.value = storedNode ? JSON.parse(storedNode) : nodes.value[0];
};

const initInstancesData = async () => {
  if (!currentRemoteNode.value) await initNodes();
  try {
    await getInstances({
      params: {
        daemonId: currentRemoteNode.value?.uuid ?? "",
        page: operationForm.value.currentPage,
        page_size: operationForm.value.pageSize,
        status: operationForm.value.status,
        instance_name: operationForm.value.instanceName.trim()
      }
    });
  } catch {
    return reportErrorMsg(t("TXT_CODE_e109c091"));
  }
};

const selectItem = (item: UserInstance) => {
  if (!findItem(item)) selectedItems.value = [...selectedItems.value, item];
};

const findItem = (item: UserInstance) =>
  selectedItems.value.find(
    (selected) => selected.instanceUuid === item.instanceUuid && selected.daemonId === item.daemonId
  );

const removeItem = (item: UserInstance) => {
  selectedItems.value = selectedItems.value.filter(
    (selected) => !(selected.instanceUuid === item.instanceUuid && selected.daemonId === item.daemonId)
  );
};

const clearAll = () => {
  selectedItems.value = [];
};

const submit = async () => {
  props.emitResult(selectedItems.value);
  await cancel();
};

const handleQueryInstance = throttle(async () => {
  operationForm.value.currentPage = 1;
  await initInstancesData();
}, 600);

const handleChangeNode = async (item: NodeStatus) => {
  try {
    operationForm.value.currentPage = 1;
    currentRemoteNode.value = item;
    await initInstancesData();
    localStorage.setItem("pageSelectedRemote", JSON.stringify(item));
  } catch (err: any) {
    console.error(err.message);
  }
};

const handlePageChange = async (page: number) => {
  operationForm.value.currentPage = page;
  await initInstancesData();
};

const handlePageSizeChange = async (pageSize: number) => {
  operationForm.value.pageSize = pageSize;
  operationForm.value.currentPage = 1;
  await initInstancesData();
};

onMounted(async () => {
  open.value = true;
  await initInstancesData();
});
</script>

<template>
  <VDialog v-model="open" class="app-dialog select-instances-dialog" max-width="980" scrollable persistent>
    <VCard rounded="xl">
      <VCardTitle>{{ props.title }}</VCardTitle>
      <VCardText class="select-instances-content">
        <p class="text-medium-emphasis select-instances-help">{{ t("TXT_CODE_50697989") }}</p>

        <div class="select-instances-toolbar">
          <VMenu location="bottom start">
            <template #activator="{ props: menuProps }">
              <VBtn v-bind="menuProps" variant="tonal" append-icon="mdi-chevron-down" :block="isPhone">
                <VIcon start :icon="currentRemoteNode?.available ? 'mdi-database-outline' : 'mdi-alert-circle-outline'" />
                {{ computeNodeName(currentRemoteNode?.ip || "", currentRemoteNode?.available ?? true, currentRemoteNode?.remarks) }}
              </VBtn>
            </template>
            <VList density="compact">
              <VListItem
                v-for="item in nodes || []"
                :key="item.uuid"
                :disabled="!item.available"
                :prepend-icon="item.available ? 'mdi-database-outline' : 'mdi-emoticon-sad-outline'"
                :title="computeNodeName(item.ip, item.available, item.remarks)"
                @click="handleChangeNode(item)"
              />
              <VListItem prepend-icon="mdi-server-network-outline" :title="t('TXT_CODE_28e53fed')" />
            </VList>
          </VMenu>

          <div class="select-instances-search">
            <VSelect
              v-model="operationForm.status"
              :items="statusItems"
              hide-details
              density="comfortable"
              class="status-select"
              @update:model-value="handleQueryInstance"
            />
            <VTextField
              v-model.trim="operationForm.instanceName"
              :placeholder="t('TXT_CODE_ce132192')"
              prepend-inner-icon="mdi-magnify"
              hide-details
              density="comfortable"
              clearable
              @keyup.enter="handleQueryInstance"
              @update:model-value="handleQueryInstance"
            />
          </div>
        </div>

        <div class="select-instances-summary">
          <span>{{ t("TXT_CODE_379fa48a") }} {{ selectedItems.length }} {{ t("TXT_CODE_5cd3b4bd") }}</span>
          <div class="select-instances-pagination">
            <VSelect
              :model-value="operationForm.pageSize"
              :items="[10, 20, 50]"
              density="compact"
              hide-details
              class="page-size-select"
              @update:model-value="handlePageSizeChange"
            />
            <VPagination
              :model-value="operationForm.currentPage"
              :length="instances?.maxPage || 1"
              density="compact"
              total-visible="5"
              @update:model-value="handlePageChange"
            />
          </div>
        </div>

        <VDataTable
          :headers="tableHeaders"
          :items="instancesList"
          :loading="isLoading"
          :items-per-page="-1"
          hide-default-footer
          item-value="instanceUuid"
          class="select-instances-table"
        >
          <template #item.safe="{ item }">
            <VChip v-if="rowItem(item)?.config?.processType === 'docker'" size="small" color="success" variant="tonal">
              {{ t("TXT_CODE_a3f13157") }}
            </VChip>
            <VChip v-else size="small" color="error" variant="tonal">{{ t("TXT_CODE_201bc643") }}</VChip>
          </template>
          <template #item.operation="{ item }">
            <VBtn v-if="findItem(rowItem(item))" color="error" variant="tonal" size="small" @click.stop="removeItem(rowItem(item))">
              {{ t("TXT_CODE_65fcbd09") }}
            </VBtn>
            <VBtn v-else variant="tonal" size="small" @click.stop="selectItem(rowItem(item))">
              {{ t("TXT_CODE_7b2c5414") }}
            </VBtn>
          </template>
        </VDataTable>
      </VCardText>
      <VCardActions>
        <VBtn v-if="selectedItems.length > 0" variant="text" @click="clearAll">{{ t("TXT_CODE_d258ec31") }}</VBtn>
        <VSpacer />
        <VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" @click="submit">{{ t("TXT_CODE_abfe9512") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.select-instances-dialog :deep(.v-overlay__content) {
  width: min(980px, calc(100vw - 48px));
}

.select-instances-content {
  min-height: 0;
}

.select-instances-help {
  margin: 0 0 16px;
}

.select-instances-toolbar,
.select-instances-search,
.select-instances-summary,
.select-instances-pagination {
  display: flex;
  align-items: center;
}

.select-instances-toolbar {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.select-instances-search {
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
  gap: 8px;
}

.status-select {
  flex: 0 0 120px;
}

.select-instances-summary {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--text-color);
  font-size: 13px;
}

.select-instances-pagination {
  min-width: 0;
  gap: 8px;
}

.page-size-select {
  width: 90px;
}

.select-instances-table {
  background: transparent;
}

@media (max-width: 700px) {
  .select-instances-dialog :deep(.v-overlay__content) {
    width: calc(100vw - 24px);
  }

  .select-instances-toolbar,
  .select-instances-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .select-instances-search,
  .select-instances-pagination {
    width: 100%;
  }

  .select-instances-pagination {
    justify-content: space-between;
  }
}
</style>
