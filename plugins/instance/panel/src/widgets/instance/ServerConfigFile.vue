<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  getConfigFile,
  updateConfigFile
} from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import Loading from "@elementspanel/epanel-plugin-console/components/Loading";
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import configComponent from "../../components/InstanceConfigEditor.vue";
import type { FrontendFileManagerService } from "@elements-panel/sdk";
import { usePluginService } from "@elements-panel/sdk";
import { useKeyboardEvents } from "@elementspanel/epanel-plugin-console/hooks/useKeyboardEvents";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { useRoute } from "vue-router";
import { VBtn, VCol, VContainer, VRow } from "vuetify/components";

const route = useRoute();
const instanceId = String(route.query.instanceId ?? "");
const daemonId = String(route.query.daemonId ?? "");
const configName = String(route.query.configName ?? "");
const configPath = String(route.query.configPath ?? "");
const extName = String(route.query.extName ?? "");
const type = String(route.query.type ?? "");
const isFailure = ref(false);
const { toPage } = useAppRouters();
const toConfigOverview = () => {
  toPage({
    path: "/instances/terminal/serverConfig",
    query: {
      type
    }
  });
};

const {
  execute: reqConfigFile,
  state: configFile,
  isLoading: getConfigFileLoading,
  isReady
} = getConfigFile();
const render = async () => {
  isFailure.value = false;
  try {
    await reqConfigFile({
      params: {
        uuid: instanceId ?? "",
        daemonId: daemonId ?? "",
        fileName: configPath ?? "",
        type: extName ?? ""
      }
    });
  } catch (err: any) {
    console.error(err);
    isFailure.value = true;
    return reportErrorMsg(err.message);
  }
};

const {
  execute: execUpdateConfigFile,
  state: isOK,
  isLoading: updateConfigFileLoading
} = updateConfigFile();
const save = async () => {
  const config_ = { ...configFile.value };
  try {
    await execUpdateConfigFile({
      params: {
        uuid: instanceId ?? "",
        daemonId: daemonId ?? "",
        fileName: configPath ?? "",
        type: extName ?? ""
      },
      data: config_
    });
    if (isOK.value) {
      message.success(t("TXT_CODE_COMMON_SAVED"));
    }
  } catch (err: any) {
    console.error(err);
    return reportErrorMsg(err.message);
  }
};

const { removeKeydownListener, startKeydownListener } = useKeyboardEvents(
  { ctrl: true, alt: false, caseSensitive: false, key: "s" },
  save
);

const FileEditorDialog = ref<any>();

/** Resolve the optional editor reactively so unloading removes the dialog. */
const fileEditorComponent = computed(
  () => usePluginService<FrontendFileManagerService>("file")?.FileEditor
);

const toEditRawFile = async () => {
  try {
    removeKeydownListener();
    await FileEditorDialog.value?.openDialog(configPath ?? "", configName ?? "");
  } finally {
    startKeydownListener();
    await render();
  }
};

const refresh = async () => {
  await render();
  message.success(t("TXT_CODE_SERVER_CONFIG_REFRESHED"));
};

onMounted(async () => {
  await render();
});
</script>

<template>
  <main class="server-config-page">
    <VContainer fluid class="server-config-page-container">
      <PageToolbar
        :title="t('TXT_CODE_COMMON_EDIT_SERVER_CONFIGURATION_FILE')"
        icon="mdi-file-document-edit-outline"
      >
        <template #actions>
          <VBtn variant="tonal" @click="toConfigOverview">
            {{ t("TXT_CODE_COMMON_GO_BACK") }}
          </VBtn>
          <VBtn color="primary" :loading="updateConfigFileLoading" @click="save">
            {{ t("TXT_CODE_COMMON_SAVE") }}
          </VBtn>
          <VBtn variant="tonal" :loading="getConfigFileLoading" @click="refresh()">
            {{ t("TXT_CODE_COMMON_REFRESH") }}
          </VBtn>
          <VBtn variant="flat" @click="toEditRawFile">
            {{ t("TXT_CODE_COMMON_EDIT_SOURCE_FILE") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow density="compact" class="server-config-row">
        <VCol v-if="isFailure" cols="12">
          <Empty
            icon="mdi-file-alert-outline"
            :title="t('TXT_CODE_COMMON_UNABLE_TO_EDIT_THIS_FILE')"
            :description="
              t(
                'TXT_CODE_COMMON_THIS_MIGHT_BE_DUE_TO_LACK_OF_ACCESS_TO_THIS_FILE_TRY_EDITING_IT_VIA_FILE'
              )
            "
          >
            <template #actions>
              <VBtn
                variant="tonal"
                prepend-icon="mdi-refresh"
                :loading="getConfigFileLoading"
                @click="render"
                >{{ t("TXT_CODE_COMMON_RETRY") }}</VBtn
              >
              <VBtn variant="text" @click="toConfigOverview">{{
                t("TXT_CODE_COMMON_BACK_TO_CONFIGURATION_FILE_LIST")
              }}</VBtn>
            </template>
          </Empty>
        </VCol>
        <configComponent
          v-else-if="configName && isReady"
          :config="configFile"
          :config-name="configName"
        />

        <VCol v-else cols="12">
          <Loading />
        </VCol>
      </VRow>
    </VContainer>

    <component
      :is="fileEditorComponent"
      v-if="fileEditorComponent && daemonId && instanceId"
      ref="FileEditorDialog"
      :daemon-id="daemonId"
      :instance-id="instanceId"
    />
  </main>
</template>

<style lang="scss" scoped>
@use "./server-config-page";
</style>
