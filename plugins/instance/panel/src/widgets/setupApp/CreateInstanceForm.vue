<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { INSTANCE_TYPE_TRANSLATION, TYPE_MINECRAFT_BUNGEECORD } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import { QUICKSTART_METHOD } from "@elementspanel/epanel-plugin-console/hooks/widgets/quickStartFlow";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { createInstance as createInstanceApi, uploadAddress } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import type { FrontendFileManagerService, FrontendJavaService } from "@elements-panel/sdk";
import { usePluginService } from "@elements-panel/sdk";
import { parseForwardAddress } from "@elementspanel/epanel-plugin-console/tools/protocol";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { defaultInstanceInfo } from "@elementspanel/epanel-plugin-console/types/const";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { cloneDeep } from "lodash";
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import type { MinecraftServerSelection } from "../../../../../../core/common/src/minecraft";
import {
  bindJavaCommand,
  isJavaCommand,
  javaExecutableCommand,
  type PreparedJava
} from "../../../../../../core/common/src/java";
import { createMinecraftInstance, minecraftInstallCapability } from "../../api";
import { MINECRAFT_SERVERS } from "../../minecraft";
import MinecraftServerDownload from "./MinecraftServerDownload.vue";
import DockerImageSelect from "../instance/dialogs/components/DockerImageSelect.vue";
import SelectUnzipCode from "../instance/dialogs/SelectUnzipCode.vue";
import {
  VBtn,
  VFileInput,
  VForm,
  VIcon,
  VRow,
  VCol,
  VSelect,
  VSwitch,
  VTextField,
  VTextarea
} from "vuetify/components";

const emit = defineEmits<{
  (event: "nextStep", instanceUuid: string): void;
  (event: "busy", busy: boolean): void;
}>();
const props = defineProps<{
  createMethod: QUICKSTART_METHOD;
  daemonId: string;
  instanceType?: string;
  isDesktop?: boolean;
}>();

const instanceTypeOptions = computed(() =>
  Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({
    value,
    title: String(title)
  }))
);
const requiredRule = (value: unknown) =>
  (typeof value === "string" ? !!value.trim() : !!value) || t("TXT_CODE_COMMON_PLEASE_COMPLETE_THE_PARAMETERS");
const javaPathRule = (value: string) =>
  !/["\r\n\0]/.test(value) || t("TXT_CODE_MINECRAFT_INVALID_SELECTION");
const formRef = ref<InstanceType<typeof VForm>>();
const formData = reactive<IGlobalInstanceConfig>(cloneDeep(defaultInstanceInfo));
const isImportMode = computed(() => props.createMethod === QUICKSTART_METHOD.IMPORT);
const isFileMode = computed(() => props.createMethod === QUICKSTART_METHOD.FILE);
const isDownloadMode = computed(() => props.createMethod === QUICKSTART_METHOD.DOWNLOAD);
const needUpload = computed(() => isImportMode.value || isFileMode.value);
const downloadSelection = ref<MinecraftServerSelection>();
const javaPath = ref("");
const uFile = ref<File>();
const zipCode = ref("utf-8");
const selectUnzipCodeDialog = ref<InstanceType<typeof SelectUnzipCode>>();
const isZipUpload = computed(
  () => needUpload.value && uFile.value?.name.toLowerCase().endsWith(".zip")
);
const confirming = ref(false);
const submitting = ref(false);
// Retain the created instance after upload failure so retries cannot create duplicates.
const createdInstanceUuid = ref("");
const busy = computed(() => confirming.value || submitting.value || !!createdInstanceUuid.value);
watch(busy, (value) => emit("busy", value), { immediate: true });
const javaService = computed(() => usePluginService<FrontendJavaService>("java"));
const javaSetup = ref<{ prepare(): Promise<PreparedJava> }>();
const javaValid = ref(true);
const needsJava = computed(
  () =>
    props.createMethod !== QUICKSTART_METHOD.DOCKER &&
    (isDownloadMode.value
      ? !!downloadSelection.value && downloadSelection.value.server !== "bedrock-server"
      : formData.type.startsWith("minecraft/java") ||
        (formData.type === "minecraft/bedrock" &&
          (uFile.value?.name.toLowerCase().endsWith(".jar") || isJavaCommand(formData.startCommand))))
);

function changeInstanceType(type: string) {
  formData.stopCommand =
    type === TYPE_MINECRAFT_BUNGEECORD
      ? "end"
      : type.startsWith("minecraft/") || type === "steam/terraria"
      ? "stop"
      : "^c";
}
watch(
  () => props.instanceType,
  (type) => {
    if (type) {
      formData.type = type;
      changeInstanceType(type);
    }
  },
  { immediate: true }
);
let lastDownloadServer = "";
watch(
  () => downloadSelection.value?.server,
  (server) => {
    if (server && server !== lastDownloadServer) {
      lastDownloadServer = server;
      formData.stopCommand = MINECRAFT_SERVERS[server].stopCommand;
    }
  }
);

const fileManager = usePluginService<FrontendFileManagerService>("file");
const uploadStarted = ref(false);
const uploadFileInstance = ref<any>();
let uploadStartCallback: (() => void) | undefined;
let uploadEndCallback: (() => void) | undefined;
let confirmation: ReturnType<typeof Modal.confirm> | undefined;
let disposed = false;
onUnmounted(() => {
  disposed = true;
  confirmation?.destroy();
  if (uploadFileInstance.value) {
    if (uploadStartCallback) uploadFileInstance.value.removeCallback("start", uploadStartCallback);
    if (uploadEndCallback) uploadFileInstance.value.removeCallback("end", uploadEndCallback);
  }
});

const { state: cfg, execute: getCfg } = uploadAddress();
const { state: newInstanceInfo, execute: executeCreateInstance } = createInstanceApi();
const { execute: executeDownload } = createMinecraftInstance();
const { execute: checkInstallCapability } = minecraftInstallCapability();
const percentComplete = computed(() => {
  const progress = fileManager?.uploadService.uiData.value.current;
  return uploadStarted.value && progress?.[1] ? (progress[0] / progress[1]) * 100 : 0;
});
const percentText = computed(() => {
  if (!uploadFileInstance.value) return t("TXT_CODE_COMMON_SELECT_ZIP_FILE");
  if (uploadStarted.value) return t("TXT_CODE_COMMON_UPLOADING") + percentComplete.value.toFixed(0) + "%";
  return t("TXT_CODE_COMMON_WAITING_TO_UPLOAD_IN_QUEUE_REMAINING", {
    n: fileManager?.uploadService.getFileNth(uploadFileInstance.value.id || "")
  });
});
const startCommandHint = computed(() =>
  isDownloadMode.value
    ? t("TXT_CODE_MINECRAFT_COMMAND_HINT")
    : isImportMode.value
    ? t("TXT_CODE_COMMON_UNABLE_FIND_THE_SERVER_CORE_PLEASE_PROVIDE_THE_STARTUP_COMMAND_MANUALLY")
    : props.createMethod === QUICKSTART_METHOD.DOCKER
    ? t("TXT_CODE_COMMON_YOU_CAN_ENTER_A_STARTUP_COMMAND_SUCH_AS_JAVA_JAR_DEMO_JAR_IF_NO_STARTUP_COMMAND")
    : t("TXT_CODE_COMMON_PLEASE_PROVIDE_THE_STARTUP_COMMAND")
);

async function validate() {
  const validation = await formRef.value?.validate();
  if (!validation?.valid) return false;
  if (needUpload.value) {
    const extension = uFile.value?.name.split(".").pop()?.toLowerCase();
    if (
      !uFile.value?.size ||
      !(isFileMode.value ? ["jar"] : ["zip", "jar"]).includes(extension || "")
    ) {
      reportErrorMsg(t("TXT_CODE_MINECRAFT_INVALID_FILE"));
      return false;
    }
    if (!fileManager) {
      reportErrorMsg(t("TXT_CODE_COMMON_FAILED_TO_GET_UPLOAD_ADDRESS"));
      return false;
    }
  }
  if (isDownloadMode.value && !downloadSelection.value) {
    reportErrorMsg(t("TXT_CODE_MINECRAFT_INVALID_SELECTION"));
    return false;
  }
  if (needsJava.value && javaService.value && !javaValid.value) return false;
  return true;
}

async function prepareJava() {
  formData.java.id = "";
  if (!needsJava.value) return;
  if (javaService.value) {
    if (!javaSetup.value) throw new Error(t("TXT_CODE_COMMON_FAILED_TO_GET_UPLOAD_ADDRESS"));
    const java = await javaSetup.value.prepare();
    formData.java.id = java.id;
    javaPath.value = java.path;
  }
}

async function finalConfirm() {
  if (busy.value || !(await validate()) || busy.value || disposed) return;
  if (isZipUpload.value) selectUnzipCodeDialog.value?.openDialog();
  else await showConfirmation();
}

function setUnzipCode(code: string) {
  zipCode.value = code;
  void showConfirmation();
}

async function showConfirmation() {
  if (busy.value || !(await validate()) || busy.value || disposed) return;
  confirming.value = true;
  confirmation = Modal.confirm({
    title: t("TXT_CODE_COMMON_FINAL_CONFIRMATION"),
    content: isDownloadMode.value
      ? t("TXT_CODE_MINECRAFT_CONFIRM_DOWNLOAD")
      : needUpload.value
      ? t("TXT_CODE_COMMON_THE_INSTANCE_WILL_BE_CREATED_AS_YOU_UPLOAD_THE_FILES_THIS_IS_AN_IRREVERSIBLE_PROCESS_DO")
      : t("TXT_CODE_COMMON_INSTANCE_WILL_BE_CREATED_PROCEED"),
    okText: t("TXT_CODE_COMMON_CONFIRM"),
    async onOk() {
      if (disposed || submitting.value || createdInstanceUuid.value) return;
      submitting.value = true;
      confirming.value = false;
      confirmation?.destroy();
      try {
        const daemonId = props.daemonId;
        const createMethod = props.createMethod;
        if (isDownloadMode.value) {
          // Recheck after confirmation, before Java preparation can download a runtime.
          const capability = await checkInstallCapability({ params: { daemonId: props.daemonId } });
          if (capability.value?.supported !== true)
            throw new Error(t("TXT_CODE_MINECRAFT_NODE_UNSUPPORTED"));
        }
        if (disposed || daemonId !== props.daemonId || createMethod !== props.createMethod) return;
        await prepareJava();
        if (disposed || daemonId !== props.daemonId || createMethod !== props.createMethod) return;
        if (needUpload.value) await selectedFile();
        else await createInstance();
      } catch (error: any) {
        if (!disposed) reportErrorMsg(error);
      } finally {
        submitting.value = false;
      }
    },
    onCancel() {
      confirming.value = false;
    }
  });
}

function onFileChange(file: File | File[] | null) {
  uFile.value = (Array.isArray(file) ? file[0] : file) || undefined;
}

function instanceConfig() {
  const config = cloneDeep(formData);
  config.nickname = config.nickname.trim();
  config.createDatetime = Date.now();
  if (config.docker.image) config.processType = "docker";
  if (needsJava.value && javaPath.value.trim()) {
    config.startCommand = bindJavaCommand(config.startCommand, javaPath.value.trim());
  }
  return config;
}

async function selectedFile() {
  if (!uFile.value || !fileManager) throw new Error(t("TXT_CODE_MINECRAFT_INVALID_FILE"));
  const config = instanceConfig();
  if (isFileMode.value)
    config.startCommand = config.startCommand.replace("${ProgramName}", uFile.value.name);
  if (
    !config.startCommand.trim() &&
    uFile.value.name.toLowerCase().endsWith(".jar") &&
    config.type.startsWith("minecraft/")
  ) {
    const nogui =
      config.type.startsWith("minecraft/java") &&
      config.type !== TYPE_MINECRAFT_BUNGEECORD;
    config.startCommand = `${javaExecutableCommand(
      javaPath.value.trim() || "java"
    )} -jar "${uFile.value.name.replace(/"/g, "{quotes}")}"${nogui ? " nogui" : ""}`;
  }
  await getCfg({ params: { upload_dir: ".", daemonId: props.daemonId }, data: config });
  if (!cfg.value?.instanceUuid) throw new Error(t("TXT_CODE_COMMON_FAILED_TO_GET_UPLOAD_ADDRESS"));
  createdInstanceUuid.value = cfg.value.instanceUuid;
  const addr = parseForwardAddress(fileManager.getFileConfigAddr(cfg.value), "http");
  uploadStartCallback = () => {
    uploadStarted.value = true;
  };
  uploadEndCallback = () => {
    const task = uploadFileInstance.value;
    if (!task || task.canceled || task.removing || task.uploadedSize < task.file.size) {
      reportErrorMsg(t("TXT_CODE_COMMON_UPLOAD_FAILED"));
      return;
    }
    message.success(t("TXT_CODE_COMMON_CREATE_SUCCESS"));
    emit("nextStep", createdInstanceUuid.value);
  };
  uploadFileInstance.value = fileManager.uploadService.append(
    uFile.value,
    addr,
    cfg.value.password,
    { overwrite: false, unzip: !!isZipUpload.value, code: zipCode.value },
    (task: any) => {
      task.addCallback("start", uploadStartCallback!);
      task.addCallback("end", uploadEndCallback!);
    }
  );
}

async function createInstance() {
  const config = instanceConfig();
  if (isDownloadMode.value) {
    if (!downloadSelection.value) throw new Error(t("TXT_CODE_MINECRAFT_INVALID_SELECTION"));
    const result = await executeDownload({
      params: { daemonId: props.daemonId },
      data: { config, selection: { ...downloadSelection.value, javaPath: javaPath.value.trim() } }
    });
    if (!result.value?.instanceUuid) throw new Error(t("TXT_CODE_COMMON_FAILED_TO_GET_UPLOAD_ADDRESS"));
    createdInstanceUuid.value = result.value.instanceUuid;
  } else {
    await executeCreateInstance({ params: { daemonId: props.daemonId }, data: config });
    if (!newInstanceInfo.value?.instanceUuid) throw new Error(t("TXT_CODE_COMMON_FAILED_TO_GET_UPLOAD_ADDRESS"));
    createdInstanceUuid.value = newInstanceInfo.value.instanceUuid;
  }
  message.success(t("TXT_CODE_COMMON_CREATE_SUCCESS"));
  emit("nextStep", createdInstanceUuid.value);
}
</script>

<template>
  <VForm
    ref="formRef"
    :class="isDesktop ? 'desktop-create-form' : 'normal-create-form'"
    :disabled="busy"
    @submit.prevent="finalConfirm"
  >
    <p v-if="createMethod === QUICKSTART_METHOD.DOCKER" class="desktop-create-hint">
      <VIcon icon="mdi-information-outline" /> {{ t("TXT_CODE_INSTANCE_DOCKER_INSTALLATION_REQUIRED_HINT") }}
    </p>
    <VRow density="compact">
      <VCol cols="12" :md="instanceType ? 12 : 6">
        <VTextField
          v-model="formData.nickname"
          :label="t('TXT_CODE_COMMON_INSTANCE_NAME')"
          :hint="t('TXT_CODE_COMMON_SUPPORTS_ANY_LANGUAGE_USE_A_UNIQUE_NAME_WHEN_POSSIBLE')"
          persistent-hint
          :placeholder="t('TXT_CODE_COMMON_FOR_EXAMPLE_MY_FIRST_SERVER')"
          :rules="[requiredRule]"
          density="compact"
          hide-details="auto"
        />
      </VCol>
      <VCol v-if="!instanceType" cols="12" md="6">
        <VSelect
          v-model="formData.type"
          :items="instanceTypeOptions"
          :label="t('TXT_CODE_COMMON_INSTANCE_TYPE')"
          :hint="t('TXT_CODE_COMMON_DIFFERENT_TYPES_MAY_HAVE_SLIGHTLY_DIFFERENCES_IN_SOME_FUNCTIONS')"
          persistent-hint
          density="compact"
          hide-details="auto"
          @update:model-value="changeInstanceType"
        >
          <template #no-data><Empty :icon="false" compact /></template>
        </VSelect>
      </VCol>
    </VRow>
    <MinecraftServerDownload
      v-if="isDownloadMode"
      @update:model-value="downloadSelection = $event"
      :instance-type="formData.type"
      :disabled="busy"
      class="app-mt-3"
    />
    <component
      :is="javaService.setupComponent"
      v-if="needsJava && javaService"
      ref="javaSetup"
      :daemon-id="daemonId"
      :disabled="busy"
      class="app-mt-3"
      @valid="javaValid = $event"
    />
    <VTextField
      v-else-if="needsJava"
      v-model="javaPath"
      :label="t('TXT_CODE_COMMON_JAVA_PATH')"
      :hint="t('TXT_CODE_COMMAND_JAVA_EXECUTABLE_PATH_HINT')"
      persistent-hint
      placeholder="java"
      :rules="[javaPathRule]"
      density="compact"
      hide-details="auto"
      class="app-mt-3"
    />
    <VRow v-if="createMethod === QUICKSTART_METHOD.DOCKER" density="compact">
      <VCol cols="12" md="6"
        ><DockerImageSelect
          :model-value="formData.docker.image ?? ''"
          :daemon-id="daemonId"
          @update:model-value="(v: string) => (formData.docker.image = v)"
      /></VCol>
      <VCol cols="12" md="6" class="desktop-create-switch"
        ><span>{{ t("TXT_CODE_COMMON_CHANGE_CONTAINER_WORKING_DIRECTORY") }}</span
        ><VSwitch v-model="formData.docker.changeWorkdir" color="primary" hide-details
      /></VCol>
      <VCol cols="12" md="6"
        ><VTextField
          v-model="formData.cwd"
          :label="t('TXT_CODE_COMMON_HOST_WORKING_DIRECTORY')"
          :hint="t('TXT_CODE_COMMON_OPTIONAL_MANAGED_BY_PANEL_BY_DEFAULT_IF_PROVIDED_REQUIRE_ABSOLUTE_PATH_E_G_C_SERVERS_MY')"
          persistent-hint
          density="compact"
          hide-details="auto"
      /></VCol>
      <VCol cols="12" md="6"
        ><VTextField
          v-model="formData.docker.workingDir"
          :label="t('TXT_CODE_COMMON_WORKING_DIRECTORY_IN_CONTAINER')"
          :hint="t('TXT_CODE_COMMON_MOUNT_HOST_INSTANCE_DIRECTORY_TO_CONTAINER_FOR_DATA_PERSISTENCE')"
          persistent-hint
          density="compact"
          hide-details="auto"
      /></VCol>
    </VRow>
    <VTextField
      v-if="createMethod === QUICKSTART_METHOD.EXIST"
      v-model="formData.cwd"
      :label="t('TXT_CODE_COMMON_HOST_WORKING_DIRECTORY')"
      :hint="t('TXT_CODE_COMMON_OPTIONAL_MANAGED_BY_PANEL_BY_DEFAULT_IF_PROVIDED_REQUIRE_ABSOLUTE_PATH_E_G_C_SERVERS_MY')"
      persistent-hint
      density="compact"
      hide-details="auto"
      class="app-mt-3"
    />
    <VTextarea
      v-model="formData.startCommand"
      :label="t('TXT_CODE_COMMON_STARTUP_COMMAND')"
      :hint="startCommandHint"
      persistent-hint
      rows="2"
      density="compact"
      hide-details="auto"
      class="app-mt-3"
    />
    <VTextarea
      v-model="formData.updateCommand"
      :label="t('TXT_CODE_COMMON_INSTALL_SERVER_COMMAND')"
      :hint="t('TXT_CODE_INSTANCE_UPDATE_COMMAND_HINT')"
      persistent-hint
      rows="2"
      density="compact"
      hide-details="auto"
      class="app-mt-3"
    />
    <VTextField
      v-model="formData.stopCommand"
      :label="t('TXT_CODE_COMMON_INSTANCE_SHUTDOWN_COMMAND')"
      :hint="t('TXT_CODE_COMMON_RUNS_WHEN_STOPPING_THE_INSTANCE_C_SENDS_CTRL_C')"
      persistent-hint
      :rules="[requiredRule]"
      density="compact"
      hide-details="auto"
      class="app-mt-3"
    />
    <VFileInput
      v-if="needUpload"
      :model-value="uFile"
      :label="isImportMode ? t('TXT_CODE_MINECRAFT_UPLOAD') : t('TXT_CODE_COMMON_UPLOAD_A_SERVER_CORE')"
      :accept="isImportMode ? '.zip,.jar' : '.jar'"
      prepend-icon="mdi-upload-outline"
      density="compact"
      hide-details="auto"
      class="app-mt-3"
      @update:model-value="onFileChange"
    />
    <div v-else-if="!isDownloadMode" class="desktop-create-hint app-mt-3">
      {{ t("TXT_CODE_COMMON_COMPLETE_THE_REQUIRED_FIELDS_TO_CREATE_OTHER_OPTIONS_CAN_BE_CHANGED_IN_INSTANCE_SETTINGS") }}
    </div>
    <div :class="{ 'create-form-actions': $slots['back-action'] }">
      <slot name="back-action" />
      <VBtn
        v-if="needUpload"
        color="primary"
        :variant="$slots['back-action'] ? 'flat' : 'text'"
        rounded="xl"
        :class="$slots['back-action'] ? '' : 'app-mt-3 align-self-start'"
        :disabled="busy || !uFile || (needsJava && !!javaService && !javaValid)"
        :loading="submitting"
        @click="finalConfirm"
        ><VIcon icon="mdi-upload-outline" start />{{
          $slots["back-action"] ? t("TXT_CODE_INSTANCE_CONFIRM_CREATE") : percentText
        }}</VBtn
      >
      <VBtn
        v-else
        color="primary"
        :variant="$slots['back-action'] ? 'flat' : 'text'"
        rounded="xl"
        :class="$slots['back-action'] ? '' : 'app-mt-3 align-self-start'"
        :disabled="
          busy || (isDownloadMode && !downloadSelection) || (needsJava && !!javaService && !javaValid)
        "
        :loading="submitting"
        @click="finalConfirm"
        ><VIcon :icon="isDownloadMode ? 'mdi-cloud-download-outline' : 'mdi-plus'" start />{{
          $slots["back-action"]
            ? t("TXT_CODE_INSTANCE_CONFIRM_CREATE")
            : isDownloadMode
            ? t("TXT_CODE_MINECRAFT_CREATE")
            : t("TXT_CODE_COMMON_CREATE_INSTANCE")
        }}</VBtn
      >
    </div>
  </VForm>
  <VBtn
    v-if="createdInstanceUuid && needUpload"
    variant="text"
    class="app-mt-3"
    @click="emit('nextStep', createdInstanceUuid)"
    >{{ t("TXT_CODE_MINECRAFT_OPEN_CONSOLE") }}</VBtn
  >
  <SelectUnzipCode ref="selectUnzipCodeDialog" @select-code="setUnzipCode" />
</template>

<style lang="scss" scoped>
.desktop-create-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.create-form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
}
.create-form-actions > :deep(.v-btn) {
  flex-shrink: 0;
}
.desktop-create-hint {
  color: rgba(var(--v-theme-on-surface), 0.68);
  line-height: 1.5;
}
.desktop-create-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
