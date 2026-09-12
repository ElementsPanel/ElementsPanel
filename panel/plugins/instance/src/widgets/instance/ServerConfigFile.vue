<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { t } from "@/lang/i18n";
import { getConfigFile, updateConfigFile } from "@/services/apis/instance";
import { message } from "@/tools/vuetifyToast";
import { useAppRouters } from "@/hooks/useAppRouters";
import { toUnicode } from "@/tools/common";
import Loading from "@/components/Loading.vue";
import PageToolbar from "@/components/PageToolbar.vue";
import configComponent from "@/components/InstanceConfigEditor.vue";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { useKeyboardEvents } from "@/hooks/useKeyboardEvents";
import { reportErrorMsg } from "@/tools/validator";
import { useRoute } from "vue-router";
import { VAlert, VBtn, VCol, VContainer, VRow } from "vuetify/components";

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
  if (configPath == "server.properties" && type && type.startsWith("minecraft/java")) {
    for (const key in configFile) {
      const value = config_[key];
      if (value && typeof value == "string") {
        config_[key] = toUnicode(value);
      }
    }
  }
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
      message.success(t("TXT_CODE_a7907771"));
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

/**
 * The file editor belongs to `plugins/file`. Resolved through a
 * `computed` so the dialog appears and disappears with the plugin; without it
 * the button that opens it simply has nothing to open.
 */
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
  message.success(t("TXT_CODE_7863f28d"));
};

onMounted(async () => {
  await render();
});
</script>

<template>
  <main class="server-config-page">
    <VContainer fluid class="server-config-page-container">
      <PageToolbar :title="t('TXT_CODE_1c45f7fe')" icon="mdi-file-document-edit-outline">
        <template #actions>
          <VBtn variant="tonal" @click="toConfigOverview">
            {{ t("TXT_CODE_c14b2ea3") }}
          </VBtn>
          <VBtn color="primary" :loading="updateConfigFileLoading" @click="save">
            {{ t("TXT_CODE_abfe9512") }}
          </VBtn>
          <VBtn variant="tonal" :loading="getConfigFileLoading" @click="refresh()">
            {{ t("TXT_CODE_b76d94e0") }}
          </VBtn>
          <VBtn variant="outlined" @click="toEditRawFile">
            {{ t("TXT_CODE_1f61e5a3") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow dense class="server-config-row">
        <configComponent
          v-if="configName && isReady"
          :config="configFile"
          :config-name="configName"
        />

        <VCol v-else cols="12">
          <Loading v-if="!isFailure" />
        </VCol>
        <VCol v-if="isFailure" cols="12">
          <VAlert type="error" variant="tonal" :title="t('TXT_CODE_f859eac')" :text="t('TXT_CODE_b8814f15')">
            <template #append><VBtn color="primary" @click="toConfigOverview">
                {{ t("TXT_CODE_537cd5ad") }}
              </VBtn></template>
          </VAlert>
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
.server-config-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.server-config-page-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.server-config-row {
  width: 100%;
  margin: 0;
}

@media (max-width: 992px) {
  .server-config-page-container {
    padding: 16px 12px 28px;
  }
}
</style>
