<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { ref, computed, onMounted, h } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { notification } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import CardPanel from "@elementspanel/epanel-plugin-console/components/CardPanel";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { arrayFilter } from "@elementspanel/epanel-plugin-console/tools/array";
import { imageList, containerList } from "@elementspanel/epanel-plugin-console/services/apis/envImage";
import type { ImageInfo, ContainerInfo } from "@elementspanel/epanel-plugin-console/types";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import { useRoute } from "vue-router";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { VBtn, VCol, VContainer, VDataTable, VRow } from "vuetify/components";

const { toPage } = useAppRouters();
const route = useRoute();
const daemonId: string = String(route.query.daemonId ?? "");

const { execute: execImageList, state: images, isLoading: imageListLoading } = imageList();
const getImageList = async () => {
  try {
    await execImageList({
      params: {
        daemonId: daemonId ?? ""
      },
      method: "GET"
    });
    if (images.value) imageDataSource.value = images.value;
  } catch (err: any) {
    console.error(err);
    return Modal.error({
      centered: true,
      closable: true,
      content: err.message,
      title: t("TXT_CODE_COMMON_ERROR")
    });
  }
};

const imageDataSource = ref<ImageInfo[]>();
const imageColumns = computed(() => {
  return arrayFilter<any>([
    {
      align: "center",
      title: "ID",
      dataIndex: "Id",
      key: "Id"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_NAME"),
      dataIndex: "RepoTags",
      key: "RepoTags",
      customRender: (e: { text: string[] }) => e?.text?.[0] || "<none>"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_SPACE_USED"),
      dataIndex: "Size",
      key: "Size",
      customRender: (e: { text: number }) => `${parseInt((e.text / 1024 / 1024).toString())} MB`
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_ACTIONS"),
      key: "action",
      minWidth: 200
    }
  ]);
});

const showDetail = (info: ImageInfo | ContainerInfo) => {
  Modal.info({
    centered: true,
    closable: true,
    content: [
      h("p", t("TXT_CODE_DOCKER_IMAGE_JSON_DETAILS_HINT")),
      h("pre", {
        innerHTML: JSON.stringify(info, null, 4),
        style: {
          maxHeight: "460px",
          overflow: "auto"
        }
      })
    ],
    title: t("TXT_CODE_DOCKER_IMAGE_DETAILS_TITLE"),
    width: 500
  });
};

const delImage = async (item: ImageInfo) => {
  try {
    await execImageList({
      params: {
        daemonId: daemonId ?? "",
        imageId: item?.RepoTags?.[0] || ""
      },
      method: "DELETE"
    });
    notification["info"]({
      message: t("TXT_CODE_COMMON_THE_DELETE_COMMAND_HAS_BEEN_SENT"),
      description: t("TXT_CODE_DOCKER_IMAGE_DELETION_PENDING_HINT")
    });
  } catch (err: any) {
    console.error(err);
    return reportErrorMsg(err.message);
  }
};

const containerDataSource = ref<ContainerInfo[]>();
const containerColumns = computed(() => {
  return arrayFilter<any>([
    {
      align: "center",
      title: "ID",
      dataIndex: "Id",
      key: "Id"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_STARTUP_COMMAND"),
      dataIndex: "Command",
      key: "Command"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_USE_IMAGE"),
      dataIndex: "Image",
      key: "Image"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_STATUS"),
      dataIndex: "State",
      key: "State"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_CONDITION"),
      dataIndex: "Status",
      key: "Status"
    },
    {
      align: "center",
      title: t("TXT_CODE_COMMON_ACTIONS"),
      key: "action",
      minWidth: 200
    }
  ]);
});

const {
  execute: execContainerList,
  state: containers,
  isLoading: containerListLoading
} = containerList();
const getContainerList = async () => {
  try {
    await execContainerList({
      params: {
        daemonId: daemonId ?? ""
      }
    });
    if (containers.value) containerDataSource.value = containers.value;
  } catch (err: any) {
    console.error(err);
    return reportErrorMsg(err.message);
  }
};

const toNewImagePage = () => {
  toPage({
    path: "/node/image/new",
    query: {
      daemonId
    }
  });
};

onMounted(async () => {
  await getImageList();
  await getContainerList();
});
</script>

<template>
  <main class="node-image-page">
    <VContainer fluid class="node-image-page-container">
      <PageToolbar :title="t('TXT_CODE_COMMON_MANAGE_IMAGES')" icon="mdi-docker">
        <template #actions>
          <VBtn variant="tonal" @click="getImageList">
            {{ t("TXT_CODE_COMMON_REFRESH") }}
          </VBtn>
          <VBtn color="primary" @click="toNewImagePage">
            <span>{{ t("TXT_CODE_COMMON_NEW_IMAGE") }}</span>
          </VBtn>
        </template>
      </PageToolbar>

      <VRow density="compact" class="node-image-row">
        <VCol cols="12">
        <CardPanel style="height: 100%">
          <template #title>
            {{ t("TXT_CODE_COMMON_REMOTE_DAEMON_IMAGE_LIST") }}
          </template>
          <template #body>
            <p class="text-body-medium text-medium-emphasis">
                {{ t("TXT_CODE_COMMON_REQUIRES_DOCKER_NODES_ON_THE_SAME_HOST_SHARE_ITS_IMAGES") }}
            </p>
            <VDataTable :headers="imageColumns.map((column) => ({ title: column.title, key: column.key || column.dataIndex, value: column.dataIndex || column.key, sortable: false }))" :items="imageDataSource || []" :loading="imageListLoading" :items-per-page="10" density="comfortable">
              <template #no-data><Empty icon="mdi-docker" compact /></template>
              <template #item.Id="{ item }"><code class="text-truncate">{{ item.Id }}</code></template>
              <template #item.RepoTags="{ item }">{{ item.RepoTags?.[0] || '&lt;none&gt;' }}</template>
              <template #item.Size="{ item }">{{ parseInt((item.Size / 1024 / 1024).toString()) }} MB</template>
              <template #item.action="{ item }"><VBtn variant="text" size="small" @click="showDetail(item)">{{ t("TXT_CODE_COMMON_DETAILS") }}</VBtn><VBtn variant="text" size="small" color="error" @click="Modal.confirm({ title: t('TXT_CODE_COMMON_THIS_OPERATION_WILL_PERMANENTLY_DELETE_THIS_IMAGE_DO_YOU_WANT_TO_CONTINUE'), async onOk() { await delImage(item); } })">{{ t("TXT_CODE_COMMON_DELETE") }}</VBtn></template>
            </VDataTable>
          </template>
        </CardPanel>
      </VCol>

      <VCol cols="12">
        <CardPanel style="height: 100%">
          <template #title>
            {{ t("TXT_CODE_COMMON_REMOTE_HOST_CONTAINER_LIST") }}
          </template>
          <template #body>
            <p class="text-body-medium text-medium-emphasis">
                {{ t("TXT_CODE_COMMON_INCLUDES_CONTAINERS_STARTED_OUTSIDE_THE_PANEL") }}
            </p>
            <VDataTable :headers="containerColumns.map((column) => ({ title: column.title, key: column.key || column.dataIndex, value: column.dataIndex || column.key, sortable: false }))" :items="containerDataSource || []" :loading="containerListLoading" :items-per-page="10" density="comfortable">
              <template #no-data><Empty icon="mdi-docker" compact /></template>
              <template #item.Id="{ item }"><code>{{ item.Id }}</code></template>
              <template #item.action="{ item }"><VBtn variant="text" size="small" @click="showDetail(item)">{{ t("TXT_CODE_COMMON_DETAILS") }}</VBtn></template>
            </VDataTable>
          </template>
        </CardPanel>
      </VCol>
      </VRow>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.node-image-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.node-image-page-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.node-image-row {
  width: 100%;
  margin: 0;
}

@media (max-width: 992px) {
  .node-image-page-container {
    padding: 16px 12px 28px;
  }
}
</style>
