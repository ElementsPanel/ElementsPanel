<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types/index";
import { computed, h, onMounted, ref } from "vue";
import { VBtn, VChip, VCol, VIcon, VList, VListItem, VListItemTitle, VMenu, VPagination, VRow, VSelect, VTextField } from "vuetify/components";

import BetweenMenus from "@/components/BetweenMenus.vue";
import Empty from "@/components/Empty.vue";
import FadeUpAnimation from "@/components/FadeUpAnimation.vue";
import Loading from "@/components/Loading.vue";
import { router } from "@/config/router";
import { useInstanceTagSearch, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { useScreen } from "@/hooks/useScreen";
import { ctx } from "@/plugin/context";
import { remoteInstances, remoteNodeList } from "@/services/apis";
import {
  batchDelete,
  batchKill,
  batchRestart,
  batchStart,
  batchStop
} from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_STATUS } from "@/types/const";
import { notification } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import { throttle } from "lodash";
import type { InstanceMoreDetail } from "../hooks/useInstance";
import { useInstanceMoreDetail } from "../hooks/useInstance";
import { computeNodeName } from "@/tools/nodes";
import type { NodeStatus } from "@/types/index";
import Shortcut from "./instance/Shortcut.vue";

defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const operationForm = ref({
  instanceName: "",
  currentPage: 1,
  pageSize: 20,
  status: ""
});

const statusOptions = computed(() => [
  { title: t("TXT_CODE_c48f6f64"), value: "" },
  ...Object.entries(INSTANCE_STATUS).map(([value, title]) => ({ title, value }))
]);

const currentRemoteNode = ref<NodeStatus>();

const { execute: getNodes, state: nodes, isLoading: isLoading1 } = remoteNodeList();
const { execute: getInstances, state: instances, isLoading: isLoading2 } = remoteInstances();
const { updateTagTips, tagTips } = useInstanceTagTips();
const {
  tags: selectedTags,
  setRefreshFn,
  selectTag,
  removeTag,
  isTagSelected,
  clearTags
} = useInstanceTagSearch();

const isLoading = computed(() => isLoading1.value || isLoading2.value);

const instancesMoreInfo = computed(() => {
  const newInstances: InstanceMoreDetail[] = [];
  for (const instance of instances.value?.data || []) {
    const instanceMoreInfo = useInstanceMoreDetail(instance);
    newInstances.push(instanceMoreInfo);
  }
  return newInstances || [];
});

const initNodes = async () => {
  await getNodes();
  nodes?.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  if (nodes.value?.length === 0) {
    return reportErrorMsg(t("TXT_CODE_e3d96a26"));
  }
  if (localStorage.getItem("pageSelectedRemote")) {
    currentRemoteNode.value = JSON.parse(localStorage.pageSelectedRemote);
    if (!nodes.value?.some((item) => item.uuid === currentRemoteNode.value?.uuid)) {
      currentRemoteNode.value = undefined;
    }
  } else {
    currentRemoteNode.value = nodes.value?.[0];
  }
};

const initInstancesData = async (resetPage?: boolean) => {
  try {
    selectedInstance.value = [];
    if (resetPage) operationForm.value.currentPage = 1;
    if (!currentRemoteNode.value) {
      await initNodes();
    }
    await getInstances({
      params: {
        daemonId: currentRemoteNode.value?.uuid ?? "",
        page: operationForm.value.currentPage,
        page_size: operationForm.value.pageSize,
        status: operationForm.value.status,
        instance_name: operationForm.value.instanceName.trim(),
        tag: JSON.stringify(selectedTags.value)
      }
    });
    updateTagTips(instances.value?.allTags || []);
  } catch (err) {
    return reportErrorMsg(t("TXT_CODE_e109c091"));
  }
};

const handleQueryInstance = throttle(async () => {
  selectedInstance.value = [];
  await initInstancesData();
}, 600);

const toAppDetailPage = (daemonId: string, instanceId: string) => {
  router.push({
    path: `/instances/terminal`,
    query: {
      daemonId,
      instanceId
    }
  });
};

const handleChangeNode = async (item: NodeStatus) => {
  try {
    currentRemoteNode.value = item;
    selectedInstance.value = [];
    await initInstancesData(true);
    localStorage.setItem("pageSelectedRemote", JSON.stringify(item));
  } catch (err: any) {
    console.error(err.message);
  }
};

const toCreateAppPage = () => {
  router.push("/instances/create");
};

const toMarketPage = () => {
  router.push({
    path: "/market",
    query: {
      daemonId: currentRemoteNode.value?.uuid
    }
  });
};

// The market page belongs to the `market` plugin, so the empty-state shortcut
// to it only exists while that plugin is installed.
const marketAvailable = computed(() => {
  void ctx.routes.revision;
  return router.getRoutes().some((route) => route.path === "/market");
});

const toNodesPage = () => {
  router.push({
    path: "/node"
  });
};

const multipleMode = ref(false);
const selectedInstance = ref<InstanceMoreDetail[]>([]);

const findInstance = (item: InstanceMoreDetail) => {
  return selectedInstance.value.find((i) => i.instanceUuid === item.instanceUuid);
};

const selectInstance = (item: InstanceMoreDetail) => {
  if (findInstance(item)) {
    selectedInstance.value.splice(selectedInstance.value.indexOf(item), 1);
  } else {
    selectedInstance.value.push(item);
  }
};

const handleSelectInstance = (item: InstanceMoreDetail) => {
  if (multipleMode.value) {
    selectInstance(item);
  } else {
    toAppDetailPage(currentRemoteNode.value?.uuid || "", item.instanceUuid);
  }
};

const selectAllInstances = () => {
  if (instancesMoreInfo.value.length === selectedInstance.value.length) {
    selectedInstance.value = [];
  } else {
    for (const item of instancesMoreInfo.value) {
      if (findInstance(item)) continue;
      selectedInstance.value.push(item);
    }
  }
};

const exitMultipleMode = () => {
  multipleMode.value = false;
  selectedInstance.value = [];
};

const instanceOperations = [
  {
    title: t("TXT_CODE_57245e94"),
    icon: "mdi-play-circle-outline",
    click: () => batchOperation("start")
  },
  {
    title: t("TXT_CODE_b1dedda3"),
    icon: "mdi-pause-circle-outline",
    click: () => batchOperation("stop")
  },
  {
    title: t("TXT_CODE_47dcfa5"),
    icon: "mdi-restart",
    click: () => batchOperation("restart")
  },
  {
    title: t("TXT_CODE_7b67813a"),
    icon: "mdi-close-circle-outline",
    click: () => {
      batchOperation("kill");
    }
  },
  {
    title: t("TXT_CODE_ecbd7449"),
    icon: "mdi-delete-outline",
    click: () => batchDeleteInstance(false)
  },
  {
    title: t("TXT_CODE_9ef27367"),
    icon: "mdi-delete-alert-outline",
    click: () => batchDeleteInstance(true)
  }
];

const batchOperation = async (actName: "start" | "stop" | "kill" | "restart") => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const operationMap = {
    start: async () => exec(batchStart().execute, t("TXT_CODE_2b5fd76e")),
    stop: async () => exec(batchStop().execute, t("TXT_CODE_4822a21")),
    kill: async () => exec(batchKill().execute, t("TXT_CODE_effefaab")),
    restart: async () => exec(batchRestart().execute, t("TXT_CODE_effefaab"))
  };

  const exec = async (fn: Function, msg: string) => {
    try {
      const state = await fn({
        data: selectedInstance.value.map((item) => ({
          instanceUuid: item.instanceUuid,
          daemonId: currentRemoteNode.value?.uuid ?? ""
        }))
      });
      if (state.value) {
        notification.success({
          message: msg,
          description: t("TXT_CODE_1514d08f")
        });
        exitMultipleMode();
        await initInstancesData();
      }
    } catch (err: any) {
      console.error(err);
      reportErrorMsg(err.message);
    }
  };

  operationMap[actName]();
};

const batchDeleteInstance = async (deleteFile: boolean) => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const { execute, state } = batchDelete();
  const uuids: string[] = [];
  const paths: string[] = [];
  for (const i of selectedInstance.value) {
    uuids.push(i.instanceUuid);
    if (i.config?.cwd) {
      paths.push(i.config.cwd);
    }
  }
  const confirmDeleteInstanceModal = Modal.confirm({
    title: t("TXT_CODE_2a3b0c17"),
    icon: h("i", { class: "mdi mdi-information-outline" }),
    content: () =>
      h("div", {}, [
        h("p", {}, deleteFile ? t("TXT_CODE_18d2f8ae") : t("TXT_CODE_ac01315a")),
        paths.length > 1
          ? null
          : h("p", { style: "margin-top: 8px; color: #666;" }, [
              t("TXT_CODE_91d70059"),
              h("br"),
              paths.join()
            ])
      ]),
    okText: t("TXT_CODE_d507abff"),
    async onOk() {
      try {
        await execute({
          params: {
            daemonId: currentRemoteNode.value?.uuid ?? ""
          },
          data: {
            uuids: uuids,
            deleteFile: deleteFile
          }
        });
        if (state.value) {
          confirmDeleteInstanceModal.destroy();
          exitMultipleMode();
          notification.success({
            message: t("TXT_CODE_c3c06801"),
            description: t("TXT_CODE_50075e02")
          });
          await initInstancesData(true);
        }
      } catch (err: any) {
        console.error(err);
        reportErrorMsg(err.message);
      }
    },
    onCancel() {}
  });
};

onMounted(async () => {
  await initInstancesData();
  setRefreshFn(initInstancesData);
});
</script>

<template>
  <div style="min-height: 100%" class="container">
    <VRow dense style="min-height: 100%">
      <VCol cols="12">
        <BetweenMenus>
          <template v-if="!isPhone" #left>
            <h4 class="text-h6 mb-0">
              <VIcon icon="mdi-apps" class="mr-1" />
              {{ card.title }}
            </h4>
          </template>
          <template #right>
            <VMenu location="bottom end">
              <template #activator="{ props: menuProps }">
                <VBtn v-bind="menuProps" variant="tonal" style="max-width: 200px; min-width: 180px; overflow: hidden">
                  <span class="text-truncate">{{ computeNodeName(currentRemoteNode?.ip || '', currentRemoteNode?.available || true, currentRemoteNode?.remarks) }}</span>
                  <VIcon end icon="mdi-chevron-down" />
                </VBtn>
              </template>
              <VList density="compact">
                  <VListItem
                    v-for="item in nodes"
                    :key="item.uuid"
                    :disabled="!item.available"
                    @click="handleChangeNode(item)"
                  >
                    <template #prepend><VIcon :icon="item.available ? 'mdi-database-outline' : 'mdi-emoticon-sad-outline'" /></template>
                    <VListItemTitle>{{ computeNodeName(item.ip, item.available, item.remarks) }}</VListItemTitle>
                  </VListItem>
                  <VListItem @click="toNodesPage">
                    <template #prepend><VIcon icon="mdi-form-select" /></template>
                    <VListItemTitle>{{ t("TXT_CODE_28e53fed") }}</VListItemTitle>
                  </VListItem>
              </VList>
            </VMenu>
            <VBtn
              color="primary"
              :disabled="!currentRemoteNode?.available"
              @click="toCreateAppPage"
            >
              {{ t("TXT_CODE_53408064") }}
            </VBtn>
          </template>
          <template #center>
            <div class="search-input">
              <div class="d-flex align-center ga-2">
                <VSelect v-model="operationForm.status" :items="statusOptions" density="compact" hide-details style="width: 130px" @update:model-value="handleQueryInstance" />
                <VTextField v-model.trim="operationForm.instanceName" :placeholder="t('TXT_CODE_ce132192')" density="compact" hide-details append-inner-icon="mdi-magnify" @keyup.enter="handleQueryInstance" @update:model-value="handleQueryInstance" />
              </div>
            </div>
          </template>
        </BetweenMenus>
      </VCol>
      <VCol cols="12">
        <BetweenMenus>
          <template v-if="instances" #left>
            <div v-if="multipleMode">
              <VBtn variant="tonal" @click="exitMultipleMode">
                {{ t("TXT_CODE_5366af54") }}
              </VBtn>

              <VBtn
                v-if="instancesMoreInfo.length === selectedInstance.length"
                class="mr-10"
                @click="selectedInstance = []"
              >
                {{ t("TXT_CODE_df87c46d") }}
              </VBtn>
              <VBtn v-else variant="tonal" @click="selectAllInstances">
                {{ t("TXT_CODE_f466d7a") }}
              </VBtn>
              <VMenu location="bottom start">
                <template #activator="{ props: menuProps }"><VBtn v-bind="menuProps" color="primary">{{ t("TXT_CODE_8fd8bfd3") }}<VIcon end icon="mdi-chevron-down" /></VBtn></template>
                <VList density="compact">
                    <VListItem
                      v-for="item in instanceOperations"
                      :key="item.title"
                      @click="item.click()"
                    >
                      <template #prepend><VIcon :icon="item.icon" /></template><VListItemTitle>{{ item.title }}</VListItemTitle>
                    </VListItem>
                </VList>
              </VMenu>
            </div>
            <div v-else>
              <VBtn variant="tonal" @click="multipleMode = true">{{ t("TXT_CODE_5cb656b9") }}</VBtn>
              <VBtn variant="tonal" @click="handleQueryInstance">
                {{ t("TXT_CODE_b76d94e0") }}
              </VBtn>
            </div>
          </template>
          <template v-if="multipleMode" #center>
            <span class="text-body-2">
              {{ t("TXT_CODE_432cbc38") }}{{ selectedInstance.length }} {{ t("TXT_CODE_5cd3b4bd") }}
            </span>
          </template>
          <template v-if="instances" #right>
            <VPagination v-model="operationForm.currentPage" :length="instances?.maxPage || 0" density="comfortable" @update:model-value="() => initInstancesData()" />
            <VSelect v-model="operationForm.pageSize" :items="[10, 20, 50]" density="compact" hide-details style="max-width: 100px" @update:model-value="() => initInstancesData(true)" />
          </template>
        </BetweenMenus>
      </VCol>
      <VCol cols="12">
        <div v-if="tagTips && tagTips?.length > 0" class="instances-tag-container">
          <VChip
            v-if="selectedTags.length > 0"
            color="red"
            class="group-name-tag"
            @click="clearTags"
          >
            {{ t("TXT_CODE_7333c7f7") }}
          </VChip>
          <VChip
            v-for="item in tagTips"
            :key="item"
            class="group-name-tag"
            :class="{ 'group-name-tag-active': isTagSelected(item) }"
            @click="isTagSelected(item) ? removeTag(item) : selectTag(item)"
          >
            {{ item }}
          </VChip>
        </div>
      </VCol>
      <VCol v-if="isLoading" cols="12">
        <Loading></Loading>
      </VCol>

      <VCol v-else-if="instancesMoreInfo.length > 0" cols="12">
        <VRow dense>
          <fade-up-animation>
            <VCol
              v-for="item in instancesMoreInfo"
              :key="item.instanceUuid"
              :xl="6"
              :lg="8"
              :sm="12"
            >
              <Shortcut
                class="instance-card"
                :class="{ selected: multipleMode && findInstance(item) }"
                style="height: 100%"
                :card="card"
                :target-instance-info="item"
                :target-daemon-id="currentRemoteNode?.uuid"
                @click="handleSelectInstance(item)"
                @refresh-list="initInstancesData()"
              />
            </VCol>
          </fade-up-animation>
        </VRow>
      </VCol>

      <VCol
        v-else-if="instancesMoreInfo.length === 0"
        class="flex align-center justify-center h-100 w-100 flex-col"
        style="position: relative"
      >
        <div>
          <Empty :description="t('TXT_CODE_5415f009')" />
        </div>
        <div class="mt-20">
          <VBtn v-if="marketAvailable" color="primary" @click="toMarketPage">
            {{ t("TXT_CODE_871cb8bc") }}
          </VBtn>
        </div>
      </VCol>
    </VRow>
  </div>
</template>

<style lang="scss" scoped>
.search-input {
  transition: all 0.6s;
  text-align: center;
  width: 80%;
}

@media (max-width: 992px) {
  .search-input {
    transition: all 0.4s;
    text-align: center;
    width: 100% !important;
  }
}

.search-input:hover {
  width: 100%;
}

.instances-tag-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-right: -4px;
  margin-left: -4px;
  max-height: 114px;
  overflow-y: auto;

  .group-name-tag {
    background-color: var(--color-gray-4);
    margin: 4px;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.3s;
    &:hover {
      border-color: var(--color-gray-8);
    }
  }

  .group-name-tag-active {
    background-color: var(--color-green-1) !important;
    border-color: var(--color-green-3);
    color: var(--color-green-7);
  }
}
</style>
