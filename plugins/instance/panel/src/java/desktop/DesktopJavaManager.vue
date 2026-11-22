<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import DesktopDialog from "@elementspanel/epanel-plugin-console/components/DesktopDialog";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { addJava, deleteJava, downloadJava, usingJava } from "../api";
import { parseTimestamp } from "@elementspanel/epanel-plugin-console/tools/time";
import type { AddJavaConfigItem, DownloadJavaConfigItem, JavaInfo } from "../types";
import { notifyDesktop } from "@elementspanel/epanel-plugin-console/tools/desktopNotice";
import { computed, onUnmounted, ref } from "vue";
import { VBtn, VDataTable, VIcon, VTextField } from "vuetify/components";

import { useJavaList } from "../hooks/useJavaList";
import JavaVersionSelect from "../components/JavaVersionSelect.vue";
import JavaRuntimeStatus from "../components/JavaRuntimeStatus.vue";

const BuildOutlined = "mdi-hammer-wrench";
const DownloadOutlined = "mdi-cloud-download-outline";

const props = defineProps<{
  instanceUuid?: string;
  instanceId?: string;
  daemonId: string;
}>();

const resolvedInstanceId = computed(() => props.instanceUuid ?? props.instanceId ?? "");
const javaCommandHint = computed(() =>
  t(
    "TXT_CODE_COMMON_AFTER_COMPLETING_THE_CONFIGURATION_THE_JAVA_COMMAND_WILL_BE_REPLACED_WITH"
  ).replace("<mcsm_java>", "{mcsm_java}")
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

const headers = [
  { title: t("TXT_CODE_COMMON_ENVIRONMENT_NAME"), key: "fullname", align: "center" as const },
  { title: t("TXT_CODE_COMMON_INSTALLATION_TIME"), key: "installTime", align: "center" as const },
  { title: t("TXT_CODE_COMMON_STATUS"), key: "status", align: "center" as const },
  { title: t("TXT_CODE_COMMON_ACTIONS"), key: "actions", align: "center" as const, sortable: false }
] as const;

const {
  javaList,
  loading: listLoading,
  error: listError,
  refresh
} = useJavaList({
  daemonId: () => props.daemonId,
  instanceId: () => resolvedInstanceId.value,
  active: () => true
});
const refreshJavaList = async (out: boolean = false) => {
  try {
    await refresh(true);
    if (out) notifyDesktop(t("TXT_CODE_COMMON_REFRESHED"), "success");
  } catch (err: any) {
    notifyDesktop(err.message, "error");
  }
};

const addJavaDialog = ref({
  show: false,
  data: { name: "", path: "" } as AddJavaConfigItem,
  resolve: null as ((value: AddJavaConfigItem | undefined) => void) | null
});

const handleAddJava = async () => {
  addJavaDialog.value.data = { name: "", path: "" };

  return new Promise<AddJavaConfigItem | undefined>((resolve) => {
    addJavaDialog.value.show = true;
    addJavaDialog.value.resolve = resolve;
  }).then(async (data) => {
    if (!data) return;
    try {
      await addJava().execute({
        params: {
          daemonId: props.daemonId ?? ""
        },
        data: {
          name: data.name,
          path: data.path
        }
      });
    } catch (err: any) {
      notifyDesktop(err.message, "error");
    }
    notifyDesktop(t("TXT_CODE_JAVA_RUNTIME_ADD_SUCCESS"), "success");
    await refreshJavaList();
  });
};

const confirmAddJava = () => {
  const { data, resolve } = addJavaDialog.value;
  if (!data.name || !data.path) {
    notifyDesktop(t("TXT_CODE_COMMON_URL_REQUIRED"), "warning");
    return;
  }
  addJavaDialog.value.show = false;
  if (resolve) resolve({ name: data.name, path: data.path });
  addJavaDialog.value.resolve = null;
};

const cancelAddJava = () => {
  const { resolve } = addJavaDialog.value;
  addJavaDialog.value.show = false;
  if (resolve) resolve(undefined);
  addJavaDialog.value.resolve = null;
};

const downloadJavaDialog = ref({
  show: false,
  installedList: [] as string[],
  version: "",
  resolve: null as ((value: DownloadJavaConfigItem | undefined) => void) | null
});

const handleDownloadJava = async () => {
  const installedList = javaList.value
    .filter((item) => !item.info.error)
    .map((item) => item.info.fullname);
  downloadJavaDialog.value.installedList = installedList;
  downloadJavaDialog.value.version = "";

  return new Promise<DownloadJavaConfigItem | undefined>((resolve) => {
    downloadJavaDialog.value.show = true;
    downloadJavaDialog.value.resolve = resolve;
  }).then(async (data) => {
    if (!data) return;
    await startDownload(data.version);
  });
};

const startDownload = async (version: string) => {
  try {
    await downloadJava().execute({
      params: { daemonId: props.daemonId, instanceId: resolvedInstanceId.value },
      data: { name: "msl", version }
    });
    notifyDesktop(t("TXT_CODE_JAVA_DOWNLOAD_STARTED"), "success");
    await refreshJavaList();
  } catch (err: any) {
    notifyDesktop(err.message, "error");
  }
};

const confirmDownloadJava = () => {
  const { resolve } = downloadJavaDialog.value;
  const version = downloadJavaDialog.value.version;
  if (!version) {
    notifyDesktop(t("TXT_CODE_JAVA_MSL_SELECT_JAVA"), "warning");
    return;
  }
  downloadJavaDialog.value.show = false;
  if (resolve) resolve({ name: "msl", version });
  downloadJavaDialog.value.resolve = null;
};

const cancelDownloadJava = () => {
  const { resolve } = downloadJavaDialog.value;
  downloadJavaDialog.value.show = false;
  if (resolve) resolve(undefined);
  downloadJavaDialog.value.resolve = null;
};

const handleDeleteJava = async (info: JavaInfo) => {
  try {
    await deleteJava().execute({
      params: {
        daemonId: props.daemonId ?? "",
        instanceId: resolvedInstanceId.value
      },
      data: {
        id: info.fullname
      }
    });
  } catch (err: any) {
    notifyDesktop(err.message, "error");
  }
  await refreshJavaList();
};

const handleUsingJava = async (info: JavaInfo) => {
  try {
    await usingJava().execute({
      params: {
        daemonId: props.daemonId ?? "",
        instanceId: resolvedInstanceId.value
      },
      data: {
        id: info.fullname
      }
    });
    notifyDesktop(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"), "success");
  } catch (err: any) {
    notifyDesktop(err.message, "error");
  }
  await refreshJavaList();
};

onUnmounted(() => {
  cancelAddJava();
  cancelDownloadJava();
});
</script>

<template>
  <div class="djava-config">
    <div class="djava-config__body">
      <p class="djava-config__hint">
        {{
          t(
            "TXT_CODE_COMMON_SELECT_JAVA_FOR_THE_INSTANCE_DOCKER_INSTANCES_USE_THE_IMAGE_S_RUNTIME"
          )
        }}<br />
        {{ javaCommandHint }}
      </p>

      <div class="djava-config__toolbar">
        <VBtn variant="text" @click="handleAddJava()">
          <VIcon icon="mdi-plus" />
          {{ t("TXT_CODE_COMMON_ADD_INSTALLED_JAVA") }}
        </VBtn>
        <VBtn variant="text" @click="handleDownloadJava()">
          <VIcon :icon="DownloadOutlined" />
          {{ t("TXT_CODE_COMMON_DOWNLOAD_OTHER_JAVA") }}
        </VBtn>
        <VBtn variant="text" @click="refreshJavaList(true)">
          <VIcon icon="mdi-refresh" />
          {{ t("TXT_CODE_COMMON_REFRESH") }}
        </VBtn>
      </div>

      <Empty
        v-if="listError"
        icon="mdi-alert-circle-outline"
        :title="t('TXT_CODE_COMMON_PAGE_FAILED_TO_LOAD_PLEASE_TRY_AGAIN_LATER')"
        :description="listError"
        :compact="!!javaList.length"
      >
        <template #actions>
          <VBtn
            variant="tonal"
            prepend-icon="mdi-refresh"
            :loading="listLoading"
            @click="refreshJavaList()"
            >{{ t("TXT_CODE_COMMON_RETRY") }}</VBtn
          >
        </template>
      </Empty>
      <VDataTable
        v-if="!listError || javaList.length"
        :loading="listLoading"
        class="djava-table mt-1"
        :headers="headers"
        :items="javaList || []"
        :items-per-page="15"
      >
        <template #no-data><Empty icon="mdi-language-java" /></template>
        <template #item.fullname="{ item }">{{ item.info.fullname || "-" }}</template>
        <template #item.installTime="{ item }">{{
          item.info.installTime ? parseTimestamp(item.info.installTime) : "-"
        }}</template>
        <template #item.status="{ item }">
          <JavaRuntimeStatus :runtime="item" />
        </template>
        <template #item.actions="{ item }">
          <div class="djava-config__actions">
            <VBtn
              v-if="item.info.error && /^msl_[0-9]+$/.test(item.info.fullname)"
              variant="text"
              size="small"
              @click="startDownload(item.info.fullname.slice(4))"
              >{{ t("TXT_CODE_COMMON_RETRY") }}</VBtn
            >
            <VBtn v-if="item.info.fullname == ''" variant="text" size="small" disabled>
              {{ t("TXT_CODE_COMMON_IN_USE") }}
            </VBtn>
            <VBtn
              v-else
              variant="text"
              size="small"
              :disabled="item.info.downloading || !!item.info.error"
              @click="handleUsingJava(item.info as JavaInfo)"
            >
              <VIcon icon="mdi-check-circle-outline" />
              {{ t("TXT_CODE_COMMON_USE") }}
            </VBtn>
            <VBtn
              color="error"
              variant="text"
              size="small"
              :disabled="item.info.downloading"
              @click="handleDeleteJava(item.info as JavaInfo)"
            >
              <VIcon icon="mdi-delete-outline" />
              {{ t("TXT_CODE_COMMON_DELETE") }}
            </VBtn>
          </div>
        </template>
      </VDataTable>
    </div>
    <div class="djava-config__footer">
      <VBtn class="djava-btn djava-btn--primary" variant="text" @click="emit('close')">
        <VIcon icon="mdi-close" />
        {{ t("TXT_CODE_JAVA_RUNTIME_SETUP_DONE") }}
      </VBtn>
    </div>

    <DesktopDialog
      id="java-manager-add-dialog"
      :title="t('TXT_CODE_COMMON_ADD_INSTALLED_JAVA')"
      :icon="BuildOutlined"
      :model-value="addJavaDialog.show"
      :width="420"
      :height="315"
      :z-index="10002"
      @close="cancelAddJava"
    >
      <VTextField
        v-model="addJavaDialog.data.name"
        :label="t('TXT_CODE_COMMON_JAVA_NAME')"
        :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
        density="compact"
        hide-details
        class="mb-1"
      />
      <VTextField
        v-model="addJavaDialog.data.path"
        :label="t('TXT_CODE_COMMON_JAVA_PATH')"
        :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
        density="compact"
        hide-details
      />
      <template #footer>
        <VBtn class="djava-btn djava-btn--default" variant="text" @click="cancelAddJava">
          {{ t("TXT_CODE_COMMON_CANCEL") }}
        </VBtn>
        <VBtn class="djava-btn djava-btn--primary" variant="text" @click="confirmAddJava">
          <VIcon icon="mdi-check" />
          {{ t("TXT_CODE_COMMON_CONFIRM") }}
        </VBtn>
      </template>
    </DesktopDialog>

    <DesktopDialog
      id="java-manager-download-dialog"
      :title="t('TXT_CODE_COMMON_DOWNLOAD_JAVA')"
      :icon="DownloadOutlined"
      :model-value="downloadJavaDialog.show"
      :width="700"
      :height="460"
      :z-index="10002"
      @close="cancelDownloadJava"
    >
      <JavaVersionSelect
        v-model="downloadJavaDialog.version"
        :daemon-id="daemonId"
        :installed-java-list="downloadJavaDialog.installedList"
      />
      <template #footer>
        <VBtn class="djava-btn djava-btn--default" variant="text" @click="cancelDownloadJava">
          {{ t("TXT_CODE_COMMON_CANCEL") }}
        </VBtn>
        <VBtn
          class="djava-btn djava-btn--primary"
          variant="text"
          :disabled="!downloadJavaDialog.version"
          @click="confirmDownloadJava"
        >
          <VIcon icon="mdi-check" />
          {{ t("TXT_CODE_COMMON_CONFIRM") }}
        </VBtn>
      </template>
    </DesktopDialog>
  </div>
</template>

<style lang="scss" scoped>
.djava-config {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--desktop-window-text);
  font-size: 13px;
  overflow: hidden;

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  &__hint {
    margin: 0 0 12px;
    color: var(--desktop-window-text-secondary);
    line-height: 1.5;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 12px;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--app-dialog-actions-padding, 8px);
    flex-shrink: 0;
  }
}

.djava-btn {
  background: var(--desktop-window-titlebar-bg);
  color: var(--desktop-window-text);

  &:hover:not(:disabled) {
    background: var(--desktop-window-control-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--primary {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.1);

    &:hover:not(:disabled) {
      background: rgba(22, 119, 255, 0.2);
    }
  }
}
</style>
