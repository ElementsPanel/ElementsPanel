<script setup lang="ts">
import { ref, onMounted } from "vue";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import CardPanel from "@/components/CardPanel.vue";
import PageToolbar from "@/components/PageToolbar.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useRoute } from "vue-router";
import {
  defaultDockerfile,
  jdk17Dockerfile,
  jdk17DockerfileCN,
  jdk8Dockerfile,
  jdk8DockerfileCN,
  ubuntu22Dockerfile,
  ubuntu22DockerfileCN
} from "@/types/const";
import { getCurrentLang } from "@/lang/i18n";
import DockerFileForm from "./DockerFileForm.vue";
import BuildProgress from "./BuildProgress.vue";
import { VBtn, VCard, VCardText, VCol, VContainer, VDialog, VRow } from "vuetify/components";

const { toPage } = useAppRouters();
const route = useRoute();
const daemonId: string = String(route.query.daemonId ?? "");
const buildProgressDialog = ref<InstanceType<typeof BuildProgress>>();
const dockerFileDrawer = ref(false);
const imageList = [
  {
    title: t("TXT_CODE_b09eff8f"),
    description: t("TXT_CODE_d7c5823e"),
    type: 1
  },
  {
    title: t("TXT_CODE_9b9b745c"),
    description: t("TXT_CODE_7d1a9487"),
    type: 2
  },
  {
    title: t("TXT_CODE_495027e1"),
    description: t("TXT_CODE_41d79430"),
    type: 3
  },
  {
    title: t("TXT_CODE_123bcd09"),
    description: t("TXT_CODE_3d14442a"),
    type: 4
  }
];

const dockerFile = ref("");
const name = ref("");
const version = ref("");
const isZH = getCurrentLang() === "zh_cn" ? true : false;
const selectType = (type: number) => {
  switch (type) {
    case 1:
      dockerFile.value = isZH ? jdk8DockerfileCN : jdk8Dockerfile;
      name.value = "mcsm-eclipse-temurin";
      version.value = "8";
      break;
    case 2:
      dockerFile.value = isZH ? jdk17DockerfileCN : jdk17Dockerfile;
      name.value = "mcsm-eclipse-temurin";
      version.value = "17";
      break;
    case 3:
      dockerFile.value = isZH ? ubuntu22DockerfileCN : ubuntu22Dockerfile;
      name.value = "mcsm-ubuntu";
      version.value = "22.04";
      break;
    case 4:
      dockerFile.value = defaultDockerfile;
      name.value = "mcsm-custom";
      version.value = "latest";
      break;
    default:
      return reportErrorMsg(t("TXT_CODE_fb1ff943"));
  }
  dockerFileDrawer.value = true;
};

const toImageListPage = () => {
  toPage({
    path: "/node/image",
    query: {
      daemonId
    }
  });
};

onMounted(async () => {});
</script>

<template>
  <main class="node-image-page">
    <VContainer fluid class="node-image-page-container">
      <PageToolbar :title="t('TXT_CODE_3d09f0ac')" icon="mdi-image-plus">
        <template #actions>
          <VBtn variant="tonal" @click="toImageListPage">
            {{ t("TXT_CODE_3a818e91") }}
          </VBtn>
          <VBtn color="primary" @click="buildProgressDialog?.openDialog()">
            {{ t("TXT_CODE_5544ec22") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow dense class="node-image-row">
        <VCol cols="12">
        <CardPanel style="height: 100%">
          <template #body>
            <div>
                <h5 class="text-h6 mb-2">{{ t("TXT_CODE_d76ccb4f") }}</h5>
                <p class="text-body-2 text-medium-emphasis">
                  {{ t("TXT_CODE_528753e7") }}
                </p>
                <h5 class="text-h6 mb-2">
                  {{ t("TXT_CODE_2ea7af21") }}
                </h5>
                <p class="text-body-2 text-medium-emphasis">
                  {{ t("TXT_CODE_ba1eb3b5") }}
                </p>
            </div>
          </template>
        </CardPanel>
      </VCol>

      <VCol
        v-for="i in imageList"
        :key="i.title + i.description + i.type"
        :span="24"
        :lg="6"
        :md="8"
        :sm="12"
      >
        <CardPanel class="images-card" @click="selectType(i.type)">
          <template #title>{{ i.title }}</template>
          <template #body>
            <span>
              {{ i.description }}
            </span>
          </template>
        </CardPanel>
      </VCol>
      </VRow>
    </VContainer>

    <VDialog v-model="dockerFileDrawer" max-width="768" scrollable>
    <VCard title="DockerFile">
      <VCardText>
    <DockerFileForm
      :docker-file="dockerFile"
      :name="name"
      :version="version"
      :daemon-id="daemonId ?? ''"
      @close="dockerFileDrawer = false"
    />
      </VCardText>
    </VCard>
  </VDialog>

    <BuildProgress ref="buildProgressDialog" :daemon-id="daemonId ?? ''" />
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

.images-card {
  cursor: pointer;

  &:hover {
    border: 1px solid var(--color-gray-8);
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.16);
  }
}

.drawer {
  width: 500px;
}
</style>
