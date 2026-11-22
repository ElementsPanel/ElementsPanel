<script setup lang="ts">
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import CardPanel from "@elementspanel/epanel-plugin-console/components/CardPanel";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import { useRoute } from "vue-router";
import {
  defaultDockerfile,
  jdk17Dockerfile,
  jdk17DockerfileCN,
  jdk8Dockerfile,
  jdk8DockerfileCN,
  ubuntu22Dockerfile,
  ubuntu22DockerfileCN
} from "@elementspanel/epanel-plugin-console/types/const";
import { getCurrentLang } from "@elementspanel/epanel-plugin-i18n";
import DockerFileForm from "./DockerFileForm.vue";
import { VBtn, VCard, VCardText, VCol, VContainer, VDialog, VRow } from "vuetify/components";

const { toPage } = useAppRouters();
const route = useRoute();
const daemonId: string = String(route.query.daemonId ?? "");
const dockerFileDrawer = ref(false);
const imageList = [
  {
    title: t("TXT_CODE_COMMON_CREATE_OPEN_JDK_8_ENVIRONMENT_IMAGE"),
    description: t("TXT_CODE_COMMON_BUILT_IN_JAVA_8_RUNTIME_ENVIRONMENT_IDEAL_FOR_MINECRAFT_SERVER_1_7_1_16"),
    type: 1
  },
  {
    title: t("TXT_CODE_COMMON_CREATE_OPEN_JDK_17_ENVIRONMENT_IMAGE"),
    description: t("TXT_CODE_COMMON_BUILT_IN_JAVA_17_RUNTIME_ENVIRONMENT_IDEAL_FOR_MINECRAFT_SERVERS_1_18_AND_LATER"),
    type: 2
  },
  {
    title: t("TXT_CODE_COMMON_CREATE_UBUNTU_22_04_ENVIRONMENT_IMAGE"),
    description: t("TXT_CODE_COMMON_IDEAL_FOR_MINECRAFT_BEDROCK_EDITION_SERVER_OR_OTHER_LINUX_PROGRAMS"),
    type: 3
  },
  {
    title: t("TXT_CODE_COMMON_CREATE_CUSTOM_ENVIRONMENT_IMAGE_USING_DOCKER_FILE"),
    description: t("TXT_CODE_COMMON_CREATE_ENVIRONMENT_IMAGE_USING_DOCKER_FILE_IT_IS_RECOMMENDED_ONLY_FOR_EXPERIENCED_USER"),
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
      return reportErrorMsg(t("TXT_CODE_COMMON_UNKNOWN_ENVIRONMENT"));
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
</script>

<template>
  <main class="node-image-page">
    <VContainer fluid class="node-image-page-container">
      <PageToolbar :title="t('TXT_CODE_COMMON_CREATE_IMAGE')" icon="mdi-image-plus">
        <template #actions>
          <VBtn variant="tonal" @click="toImageListPage">
            {{ t("TXT_CODE_COMMON_BACK_TO_IMAGE_LIST") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow density="compact" class="node-image-row">
        <VCol cols="12">
        <CardPanel>
          <template #body>
            <div>
                <p class="text-body-medium text-medium-emphasis">
                  {{ t("TXT_CODE_COMMON_IMAGES_PROVIDE_SEPARATE_RUNTIME_ENVIRONMENTS_SELECT_A_TEMPLATE_THEN_EDIT_ITS_DOCKERFILE") }}
                </p>
            </div>
          </template>
        </CardPanel>
      </VCol>

      <VCol
        v-for="i in imageList"
        :key="i.title + i.description + i.type"
        cols="12"
        :lg="6"
        :md="8"
        :sm="12"
      >
        <VBtn
          block
          color="primary"
          variant="tonal"
          height="100%"
          class="images-button text-none"
          @click="selectType(i.type)"
        >
          <span class="d-flex flex-column ga-2 w-100">
            <span class="text-body-large font-weight-bold">{{ i.title }}</span>
            <span class="text-body-medium text-medium-emphasis">{{ i.description }}</span>
          </span>
        </VBtn>
      </VCol>
      </VRow>
    </VContainer>

    <VDialog v-model="dockerFileDrawer" max-width="768" scrollable>
    <VCard :title="t('TXT_CODE_NODE_DOCKERFILE_EDITOR')">
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
  </main>
</template>

<style lang="scss" scoped>
@use "./page";

.images-button {
  padding: 16px;
  letter-spacing: normal;
  text-align: left;

  :deep(.v-btn__content) {
    width: 100%;
    justify-content: flex-start;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}

</style>
