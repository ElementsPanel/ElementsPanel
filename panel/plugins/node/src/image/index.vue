<script setup lang="ts">
import { ref, computed, onMounted, h } from "vue";
import { t } from "@/lang/i18n";
import { notification } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import CardPanel from "@/components/CardPanel.vue";
import BetweenMenus from "@/components/BetweenMenus.vue";
import { useScreen } from "@/hooks/useScreen";
import { arrayFilter } from "@/tools/array";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { imageList, containerList } from "@/services/apis/envImage";
import type { LayoutCard, ImageInfo, ContainerInfo } from "@/types";
import { useAppRouters } from "@/hooks/useAppRouters";
import { reportErrorMsg } from "@/tools/validator";
import { VBtn, VCardText, VChip, VCol, VDataTable, VIcon, VRow } from "vuetify/components";

const props = defineProps<{
  card: LayoutCard;
}>();

const { toPage } = useAppRouters();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const daemonId: string | undefined = getMetaOrRouteValue("daemonId");
const { isPhone } = useScreen();

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
      title: t("TXT_CODE_ac405b50")
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
      title: t("TXT_CODE_bff43de3"),
      dataIndex: "RepoTags",
      key: "RepoTags",
      customRender: (e: { text: string[] }) => e?.text?.[0] || "<none>"
    },
    {
      align: "center",
      title: t("TXT_CODE_6f91f3ba"),
      dataIndex: "Size",
      key: "Size",
      customRender: (e: { text: number }) => `${parseInt((e.text / 1024 / 1024).toString())} MB`
    },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
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
      h("p", t("TXT_CODE_bbd7d448")),
      h("pre", {
        innerHTML: JSON.stringify(info, null, 4),
        style: {
          maxHeight: "460px",
          overflow: "auto"
        }
      })
    ],
    title: t("TXT_CODE_9d820cb4"),
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
      message: t("TXT_CODE_638bca20"),
      description: t("TXT_CODE_d11bf156")
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
      title: t("TXT_CODE_d12fa808"),
      dataIndex: "Command",
      key: "Command"
    },
    {
      align: "center",
      title: t("TXT_CODE_47c62dac"),
      dataIndex: "Image",
      key: "Image"
    },
    {
      align: "center",
      title: t("TXT_CODE_759fb403"),
      dataIndex: "State",
      key: "State"
    },
    {
      align: "center",
      title: t("TXT_CODE_24e5bff2"),
      dataIndex: "Status",
      key: "Status"
    },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
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
  <div style="height: 100%" class="container">
    <VRow dense style="height: 100%">
      <VCol cols="12">
        <BetweenMenus>
          <template v-if="!isPhone" #left>
            <h4 class="text-h6 mb-0">
              {{ card.title }}
            </h4>
          </template>
          <template #right>
            <VBtn variant="tonal" @click="getImageList">
              {{ t("TXT_CODE_b76d94e0") }}
            </VBtn>
            <VBtn color="primary" @click="toNewImagePage">
              <span>{{ t("TXT_CODE_59ac0239") }}</span>
            </VBtn>
          </template>
        </BetweenMenus>
      </VCol>

      <VCol cols="12">
        <CardPanel style="height: 100%">
          <template #title>
            {{ t("TXT_CODE_8b62abb2") }}
          </template>
          <template #body>
            <p class="text-body-2 text-medium-emphasis">
                {{ t("TXT_CODE_ba82dddb") }}
            </p>
            <VDataTable :headers="imageColumns.map((column) => ({ title: column.title, key: column.key || column.dataIndex, value: column.dataIndex || column.key, sortable: false }))" :items="imageDataSource || []" :loading="imageListLoading" :items-per-page="10" density="comfortable">
              <template #item.Id="{ item }"><code class="text-truncate">{{ item.Id }}</code></template>
              <template #item.RepoTags="{ item }">{{ item.RepoTags?.[0] || '&lt;none&gt;' }}</template>
              <template #item.Size="{ item }">{{ parseInt((item.Size / 1024 / 1024).toString()) }} MB</template>
              <template #item.action="{ item }"><VBtn variant="text" size="small" @click="showDetail(item)">{{ t("TXT_CODE_f1b166e7") }}</VBtn><VBtn variant="text" size="small" color="error" @click="Modal.confirm({ title: t('TXT_CODE_dfa17b2d'), async onOk() { await delImage(item); } })">{{ t("TXT_CODE_ecbd7449") }}</VBtn></template>
            </VDataTable>
          </template>
        </CardPanel>
      </VCol>

      <VCol cols="12">
        <CardPanel style="height: 100%">
          <template #title>
            {{ t("TXT_CODE_cb36c80e") }}
          </template>
          <template #body>
            <p class="text-body-2 text-medium-emphasis">
                {{ t("TXT_CODE_b34efc1") }}
            </p>
            <VDataTable :headers="containerColumns.map((column) => ({ title: column.title, key: column.key || column.dataIndex, value: column.dataIndex || column.key, sortable: false }))" :items="containerDataSource || []" :loading="containerListLoading" :items-per-page="10" density="comfortable">
              <template #item.Id="{ item }"><code>{{ item.Id }}</code></template>
              <template #item.action="{ item }"><VBtn variant="text" size="small" @click="showDetail(item)">{{ t("TXT_CODE_f1b166e7") }}</VBtn></template>
            </VDataTable>
          </template>
        </CardPanel>
      </VCol>
    </VRow>
  </div>
</template>
