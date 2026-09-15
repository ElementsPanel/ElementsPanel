<script setup lang="ts">
import { INSTANCE_TYPE_TRANSLATION, TYPE_MINECRAFT_BUNGEECORD } from "@/hooks/useInstance";
import { QUICKSTART_METHOD } from "@/hooks/widgets/quickStartFlow";
import { t } from "@/lang/i18n";
import { createInstance as createInstanceApi, uploadAddress } from "@/services/apis/instance";
import type { FrontendFileManagerService, FrontendJavaService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { parseForwardAddress } from "@/tools/protocol";
import { reportErrorMsg } from "@/tools/validator";
import { defaultInstanceInfo } from "@/types/const";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import { cloneDeep } from "lodash";
import { computed, createVNode, onUnmounted, reactive, ref, watch } from "vue";
import type { MinecraftServerSelection } from "../../../../../../common/src/minecraft";
import {
  bindJavaCommand,
  javaExecutableCommand,
  type PreparedJava
} from "../../../../../../common/src/java";
import { createMinecraftInstance } from "../../api";
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
  (typeof value === "string" ? !!value.trim() : !!value) || t("TXT_CODE_47e21c80");
const javaPathRule = (value: string) =>
  !/["\r\n\0]/.test(value) || t("TXT_CODE_minecraft.invalidSelection");
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
// Keep the created instance reachable if uploading fails; never create a second
// instance just because a transfer was cancelled or retried.
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
      : formData.type.startsWith("minecraft/java") || formData.type === "minecraft/bedrock/nukkit")
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
      changeInstanceType(MINECRAFT_SERVERS[server].type);
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
const percentComplete = computed(() => {
  const progress = fileManager?.uploadService.uiData.value.current;
  return uploadStarted.value && progress?.[1] ? (progress[0] / progress[1]) * 100 : 0;
});
const percentText = computed(() => {
  if (!uploadFileInstance.value) return t("TXT_CODE_c17f6488");
  if (uploadStarted.value) return t("TXT_CODE_b625dbf0") + percentComplete.value.toFixed(0) + "%";
  return t("TXT_CODE_f63c4be2", {
    n: fileManager?.uploadService.getFileNth(uploadFileInstance.value.id || "")
  });
});
const startCommandHint = computed(() =>
  isDownloadMode.value
    ? t("TXT_CODE_minecraft.commandHint")
    : isImportMode.value
    ? t("TXT_CODE_17544b7b")
    : props.createMethod === QUICKSTART_METHOD.DOCKER
    ? t("TXT_CODE_26495d02")
    : t("TXT_CODE_8c0db3f4")
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
      reportErrorMsg(t("TXT_CODE_minecraft.invalidFile"));
      return false;
    }
    if (!fileManager) {
      reportErrorMsg(t("TXT_CODE_e8ce38c2"));
      return false;
    }
  }
  if (isDownloadMode.value && !downloadSelection.value) {
    reportErrorMsg(t("TXT_CODE_minecraft.invalidSelection"));
    return false;
  }
  if (needsJava.value && javaService.value && !javaValid.value) return false;
  return true;
}

async function prepareJava() {
  formData.java.id = "";
  if (!needsJava.value) return;
  if (javaService.value) {
    if (!javaSetup.value) throw new Error(t("TXT_CODE_e8ce38c2"));
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
    title: t("TXT_CODE_2a3b0c17"),
    icon: createVNode("span", { class: "mdi mdi-information-outline" }),
    content: isDownloadMode.value
      ? t("TXT_CODE_minecraft.confirmDownload")
      : needUpload.value
      ? t("TXT_CODE_e06841b5")
      : t("TXT_CODE_5deeefb5"),
    okText: t("TXT_CODE_d507abff"),
    async onOk() {
      if (submitting.value || createdInstanceUuid.value) return;
      submitting.value = true;
      confirming.value = false;
      confirmation?.destroy();
      try {
        await prepareJava();
        if (disposed) return;
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
  if (!uFile.value || !fileManager) throw new Error(t("TXT_CODE_minecraft.invalidFile"));
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
      ![TYPE_MINECRAFT_BUNGEECORD, "minecraft/java/velocity"].includes(config.type);
    config.startCommand = `${javaExecutableCommand(
      javaPath.value.trim() || "java"
    )} -jar "${uFile.value.name.replace(/"/g, "{quotes}")}"${nogui ? " nogui" : ""}`;
  }
  await getCfg({ params: { upload_dir: ".", daemonId: props.daemonId }, data: config });
  if (!cfg.value?.instanceUuid) throw new Error(t("TXT_CODE_e8ce38c2"));
  createdInstanceUuid.value = cfg.value.instanceUuid;
  const addr = parseForwardAddress(fileManager.getFileConfigAddr(cfg.value), "http");
  uploadStartCallback = () => {
    uploadStarted.value = true;
  };
  uploadEndCallback = () => {
    const task = uploadFileInstance.value;
    if (!task || task.canceled || task.removing || task.uploadedSize < task.file.size) {
      reportErrorMsg(t("TXT_CODE_62051fcc"));
      return;
    }
    message.success(t("TXT_CODE_d28c05df"));
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
    if (!downloadSelection.value) throw new Error(t("TXT_CODE_minecraft.invalidSelection"));
    const result = await executeDownload({
      params: { daemonId: props.daemonId },
      data: { config, selection: { ...downloadSelection.value, javaPath: javaPath.value.trim() } }
    });
    if (!result.value?.instanceUuid) throw new Error(t("TXT_CODE_e8ce38c2"));
    createdInstanceUuid.value = result.value.instanceUuid;
  } else {
    await executeCreateInstance({ params: { daemonId: props.daemonId }, data: config });
    if (!newInstanceInfo.value?.instanceUuid) throw new Error(t("TXT_CODE_e8ce38c2"));
    createdInstanceUuid.value = newInstanceInfo.value.instanceUuid;
  }
  message.success(t("TXT_CODE_d28c05df"));
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
      <VIcon icon="mdi-information-outline" /> {{ t("TXT_CODE_b51bac6f") }}
    </p>
    <VRow density="compact">
      <VCol cols="12" :md="instanceType ? 12 : 6">
        <VTextField
          v-model="formData.nickname"
          :label="t('TXT_CODE_f70badb9')"
          :hint="t('TXT_CODE_818928ba')"
          persistent-hint
          :placeholder="t('TXT_CODE_475c5890')"
          :rules="[requiredRule]"
          variant="solo"
          density="compact"
          hide-details="auto"
        />
      </VCol>
      <VCol v-if="!instanceType" cols="12" md="6">
        <VSelect
          v-model="formData.type"
          :items="instanceTypeOptions"
          :label="t('TXT_CODE_2f291d8b')"
          :hint="t('TXT_CODE_be608c82')"
          persistent-hint
          variant="solo"
          density="compact"
          hide-details="auto"
          @update:model-value="changeInstanceType"
        />
      </VCol>
    </VRow>
    <MinecraftServerDownload
      v-if="isDownloadMode"
      @update:model-value="downloadSelection = $event"
      :instance-type="formData.type"
      :disabled="busy"
      class="mt-3"
    />
    <component
      :is="javaService.setupComponent"
      v-if="needsJava && javaService"
      ref="javaSetup"
      :daemon-id="daemonId"
      :disabled="busy"
      class="mt-3"
      @valid="javaValid = $event"
    />
    <VTextField
      v-else-if="needsJava"
      v-model="javaPath"
      :label="t('TXT_CODE_43422ed3')"
      :hint="t('TXT_CODE_7f9b6758')"
      persistent-hint
      placeholder="java"
      :rules="[javaPathRule]"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
    />
    <VRow v-if="createMethod === QUICKSTART_METHOD.DOCKER" density="compact">
      <VCol cols="12" md="6"
        ><DockerImageSelect
          :model-value="formData.docker.image ?? ''"
          :daemon-id="daemonId"
          @update:model-value="(v: string) => (formData.docker.image = v)"
      /></VCol>
      <VCol cols="12" md="6" class="desktop-create-switch"
        ><span>{{ t("TXT_CODE_5484094a") }}</span
        ><VSwitch v-model="formData.docker.changeWorkdir" color="primary" hide-details
      /></VCol>
      <VCol cols="12" md="6"
        ><VTextField
          v-model="formData.cwd"
          :label="t('TXT_CODE_20d110b3')"
          :hint="t('TXT_CODE_877eea45')"
          persistent-hint
          variant="solo"
          density="compact"
          hide-details="auto"
      /></VCol>
      <VCol cols="12" md="6"
        ><VTextField
          v-model="formData.docker.workingDir"
          :label="t('TXT_CODE_81979d0f')"
          :hint="t('TXT_CODE_3407250a')"
          persistent-hint
          variant="solo"
          density="compact"
          hide-details="auto"
      /></VCol>
    </VRow>
    <VTextField
      v-if="createMethod === QUICKSTART_METHOD.EXIST"
      v-model="formData.cwd"
      :label="t('TXT_CODE_20d110b3')"
      :rules="[requiredRule]"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
    />
    <VTextarea
      v-model="formData.startCommand"
      :label="t('TXT_CODE_d12fa808')"
      :hint="startCommandHint"
      persistent-hint
      rows="2"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
    />
    <VTextarea
      v-model="formData.updateCommand"
      :label="t('TXT_CODE_2e2c6b7b')"
      :hint="t('TXT_CODE_4f387c5a')"
      persistent-hint
      rows="2"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
    />
    <VTextField
      v-model="formData.stopCommand"
      :label="t('TXT_CODE_11cfe3a1')"
      :hint="t('TXT_CODE_7ec7ccb8')"
      persistent-hint
      :rules="[requiredRule]"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
    />
    <VFileInput
      v-if="needUpload"
      :model-value="uFile"
      :label="isImportMode ? t('TXT_CODE_minecraft.upload') : t('TXT_CODE_444db70f')"
      :accept="isImportMode ? '.zip,.jar' : '.jar'"
      prepend-icon="mdi-upload-outline"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
      @update:model-value="onFileChange"
    />
    <div v-else-if="!isDownloadMode" class="desktop-create-hint mt-3">
      {{ t("TXT_CODE_7da6e84") }}
    </div>
    <VBtn
      v-if="needUpload"
      color="primary"
      variant="text"
      rounded="xl"
      class="mt-3 align-self-start"
      :disabled="busy || !uFile || (needsJava && !!javaService && !javaValid)"
      :loading="submitting"
      @click="finalConfirm"
      ><VIcon icon="mdi-upload-outline" start />{{ percentText }}</VBtn
    >
    <VBtn
      v-else
      color="primary"
      variant="text"
      rounded="xl"
      class="mt-3 align-self-start"
      :disabled="
        busy || (isDownloadMode && !downloadSelection) || (needsJava && !!javaService && !javaValid)
      "
      :loading="submitting"
      @click="finalConfirm"
      ><VIcon :icon="isDownloadMode ? 'mdi-cloud-download-outline' : 'mdi-plus'" start />{{
        isDownloadMode ? t("TXT_CODE_minecraft.create") : t("TXT_CODE_5a74975b")
      }}</VBtn
    >
  </VForm>
  <VBtn
    v-if="createdInstanceUuid && needUpload"
    variant="text"
    class="mt-3"
    @click="emit('nextStep', createdInstanceUuid)"
    >{{ t("TXT_CODE_minecraft.openConsole") }}</VBtn
  >
  <SelectUnzipCode ref="selectUnzipCodeDialog" @select-code="setUnzipCode" />
</template>

<style lang="scss" scoped>
.desktop-create-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
