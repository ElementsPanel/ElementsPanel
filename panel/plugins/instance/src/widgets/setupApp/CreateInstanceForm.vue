<script setup lang="ts">
import { INSTANCE_TYPE_TRANSLATION, TYPE_MINECRAFT_BUNGEECORD } from "@/hooks/useInstance";
import { QUICKSTART_ACTION_TYPE, QUICKSTART_METHOD } from "@/hooks/widgets/quickStartFlow";
import { t } from "@/lang/i18n";
import { createInstance as createInstanceApi, uploadAddress } from "@/services/apis/instance";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { parseForwardAddress } from "@/tools/protocol";
import { reportErrorMsg } from "@/tools/validator";
import { defaultInstanceInfo } from "@/types/const";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import { computed, createVNode, onUnmounted, reactive, ref } from "vue";
import DockerImageSelect from "../instance/dialogs/components/DockerImageSelect.vue";
import SelectUnzipCode from "../instance/dialogs/SelectUnzipCode.vue";
import { VBtn, VFileInput, VForm, VIcon, VRadio, VRadioGroup, VRow, VCol, VSelect, VSwitch, VTextField, VTextarea } from "vuetify/components";

const selectUnzipCodeDialog = ref<InstanceType<typeof SelectUnzipCode>>();
const emit = defineEmits(["nextStep"]);

const props = defineProps<{
  createMethod: QUICKSTART_METHOD;
  daemonId: string;
  isDesktop?: boolean;
}>();

const instanceTypeOptions = computed(() => Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title: String(title) })));
const requiredRule = (value: unknown) => Boolean(value) || t("TXT_CODE_47e21c80");

const zipCode = ref("utf-8");
const formRef = ref<any>();
const formData = reactive<IGlobalInstanceConfig>(defaultInstanceInfo);

const isImportMode = props.createMethod === QUICKSTART_METHOD.IMPORT;
const isFileMode = props.createMethod === QUICKSTART_METHOD.FILE;
const needUpload = isImportMode || isFileMode;

function changeInstanceType(appType: string) {
  if (appType.includes(QUICKSTART_ACTION_TYPE.Minecraft)) {
    if (appType === TYPE_MINECRAFT_BUNGEECORD) {
      formData.stopCommand = "end";
    } else {
      formData.stopCommand = "stop";
    }
  }

  if (appType.includes(QUICKSTART_ACTION_TYPE.Bedrock)) {
    formData.stopCommand = "stop";
  }

  if (appType.includes(QUICKSTART_ACTION_TYPE.Terraria)) {
    formData.stopCommand = "stop";
  }

  if (
    appType.includes(QUICKSTART_ACTION_TYPE.SteamGameServer) ||
    appType.includes(QUICKSTART_ACTION_TYPE.AnyApp)
  ) {
    formData.stopCommand = "^c";
  }
}

const uFile = ref<File>();

const beforeUpload = async (file: File) => {
  uFile.value = file;

  if (isImportMode) {
    const extName = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["zip", "jar"].includes(extName)) return reportErrorMsg(t("TXT_CODE_808e5ad9"));
    selectUnzipCodeDialog.value?.openDialog();
  } else {
    finalConfirm();
  }

  return false;
};

const setUnzipCode = async (code: string) => {
  zipCode.value = code;
  finalConfirm();
};

const finalConfirm = async () => {
  if (!formData.nickname || !formData.stopCommand) return reportErrorMsg(t("TXT_CODE_47e21c80"));
  if (!props.isDesktop) {
    const validation = await formRef.value?.validate();
    if (validation && !validation.valid) return reportErrorMsg(t("TXT_CODE_47e21c80"));
  }
  const thisModal = Modal.confirm({
    title: t("TXT_CODE_2a3b0c17"),
    icon: createVNode("span", { class: "mdi mdi-information-outline" }),
    content: needUpload ? t("TXT_CODE_e06841b5") : t("TXT_CODE_5deeefb5"),
    okText: t("TXT_CODE_d507abff"),
    async onOk() {
      thisModal.destroy();
      try {
        needUpload ? await selectedFile() : await createInstance();
      } catch (err: any) {
        return reportErrorMsg(err);
      }
    },
    onCancel() {}
  });
};

const onDesktopFileChange = (file: File | File[] | null) => {
  const selected = Array.isArray(file) ? file[0] : file;
  if (selected) void beforeUpload(selected);
};

/**
 * Uploading an instance pack is the file manager's upload queue, so it belongs to
 * `plugins/file`. Without it the pack-upload path is unavailable; every
 * other way of creating an instance still works.
 */
const fileManager = usePluginService<FrontendFileManagerService>("file");

const uploadStarted = ref(false);
const uploadFileInstance = ref<any>();
let uploadStartCallback: (() => void) | undefined = undefined;
let uploadEndCallback: (() => void) | undefined = undefined;
onUnmounted(() => {
  if (uploadFileInstance.value) {
    if (uploadStartCallback) uploadFileInstance.value.removeCallback("start", uploadStartCallback);
    if (uploadEndCallback) uploadFileInstance.value.removeCallback("end", uploadEndCallback);
  }
});

const { state: cfg, execute: getCfg } = uploadAddress();
const percentComplete = computed(() => {
  if (!uploadStarted.value) return 0;
  const uploadData = fileManager?.uploadService.uiData.value;
  if (!uploadData) return 0;
  if (!uploadData.current) return 0;
  return (uploadData.current[0] / uploadData.current[1]) * 100;
});

const percentText = () => {
  if (!uploadFileInstance.value) {
    return t("TXT_CODE_c17f6488");
  }

  if (uploadStarted.value) {
    return t("TXT_CODE_b625dbf0") + percentComplete.value.toFixed(0) + "%";
  } else {
    return t("TXT_CODE_f63c4be2", {
      n: fileManager?.uploadService.getFileNth(uploadFileInstance.value.id || "")
    });
  }
};

const selectedFile = async () => {
  try {
    if (!formData.cwd) formData.cwd = ".";
    if (formData.docker.image) formData.processType = "docker";
    if (isFileMode)
      formData.startCommand = formData.startCommand.replace("${ProgramName}", uFile.value!.name);
    await getCfg({
      params: {
        upload_dir: ".",
        daemonId: props.daemonId
      },
      data: formData
    });
    if (!cfg.value) throw new Error(t("TXT_CODE_e8ce38c2"));

    uploadStartCallback = () => {
      uploadStarted.value = true;
    };
    if (!fileManager) throw new Error(t("TXT_CODE_e8ce38c2"));
    const addr = parseForwardAddress(fileManager.getFileConfigAddr(cfg.value), "http");
    const task = fileManager.uploadService.append(
      uFile.value!,
      addr,
      cfg.value.password,
      {
        overwrite: false,
        unzip: isImportMode,
        code: zipCode.value
      },
      (task: any) => {
        task.addCallback("start", uploadStartCallback!);
      }
    );
    uploadFileInstance.value = task;
    const instanceUuid = cfg.value.instanceUuid;
    uploadEndCallback = () => {
      emit("nextStep", instanceUuid);
      return message.success(t("TXT_CODE_d28c05df"));
    };
    task.addCallback("end", uploadEndCallback);
  } catch (err: any) {
    console.error(err);
    return reportErrorMsg(err.message);
  }
};

const {
  state: newInstanceInfo,
  execute: executeCreateInstance,
  isLoading: createInstanceLoading
} = createInstanceApi();
const createInstance = async () => {
  try {
    if (!formData.cwd) formData.cwd = ".";
    if (formData.docker.image) formData.processType = "docker";
    await executeCreateInstance({
      params: {
        daemonId: props.daemonId
      },
      data: formData
    });
    if (newInstanceInfo.value) emit("nextStep", newInstanceInfo.value.instanceUuid);
    return message.success(t("TXT_CODE_d28c05df"));
  } catch (err: any) {
    return reportErrorMsg(err.message);
  }
};
</script>

<template>
  <template v-if="isDesktop">
    <VForm class="desktop-create-form" @submit.prevent="finalConfirm">
      <p v-if="createMethod === QUICKSTART_METHOD.DOCKER" class="desktop-create-hint"><VIcon icon="mdi-information-outline" /> {{ t("TXT_CODE_b51bac6f") }}</p>
      <VRow dense>
        <VCol cols="12" md="6">
          <VTextField v-model="formData.nickname" :label="t('TXT_CODE_f70badb9')" :hint="t('TXT_CODE_818928ba')" persistent-hint :placeholder="t('TXT_CODE_475c5890')" :rules="[requiredRule]" variant="solo" density="compact" hide-details="auto" />
        </VCol>
        <VCol cols="12" md="6">
          <VSelect v-model="formData.type" :items="instanceTypeOptions" item-title="title" item-value="value" :label="t('TXT_CODE_2f291d8b')" :hint="t('TXT_CODE_be608c82')" persistent-hint :placeholder="t('TXT_CODE_3bb646e4')" variant="solo" density="compact" hide-details="auto" @update:model-value="changeInstanceType" />
        </VCol>
      </VRow>
      <VRow v-if="createMethod === QUICKSTART_METHOD.DOCKER" dense>
        <VCol cols="12" md="6">
          <DockerImageSelect :model-value="formData.docker.image ?? ''" :daemon-id="daemonId" @update:model-value="(v: string) => (formData.docker.image = v)" />
        </VCol>
        <VCol cols="12" md="6" class="desktop-create-switch">
          <span>{{ t("TXT_CODE_5484094a") }}</span>
          <VSwitch v-model="formData.docker.changeWorkdir" color="primary" hide-details />
        </VCol>
        <VCol cols="12" md="6"><VTextField v-model="formData.cwd" :label="t('TXT_CODE_20d110b3')" :hint="t('TXT_CODE_877eea45')" persistent-hint variant="solo" density="compact" hide-details="auto" /></VCol>
        <VCol cols="12" md="6"><VTextField v-model="formData.docker.workingDir" :label="t('TXT_CODE_81979d0f')" :hint="t('TXT_CODE_3407250a')" persistent-hint variant="solo" density="compact" hide-details="auto" /></VCol>
      </VRow>
      <VTextarea v-model="formData.startCommand" :label="t('TXT_CODE_d12fa808')" :hint="createMethod === QUICKSTART_METHOD.IMPORT ? t('TXT_CODE_17544b7b') : createMethod === QUICKSTART_METHOD.DOCKER ? t('TXT_CODE_26495d02') : t('TXT_CODE_8c0db3f4')" persistent-hint rows="2" variant="solo" density="compact" hide-details="auto" class="mt-3" />
      <VTextarea v-model="formData.updateCommand" :label="t('TXT_CODE_2e2c6b7b')" :hint="t('TXT_CODE_4f387c5a')" persistent-hint rows="2" variant="solo" density="compact" hide-details="auto" class="mt-3" />
      <VTextField v-model="formData.stopCommand" :label="t('TXT_CODE_11cfe3a1')" :hint="t('TXT_CODE_7ec7ccb8')" persistent-hint :rules="[requiredRule]" variant="solo" density="compact" hide-details="auto" class="mt-3" />
      <VFileInput v-if="needUpload" :label="createMethod === QUICKSTART_METHOD.IMPORT ? t('TXT_CODE_f9b6e61b') : t('TXT_CODE_444db70f')" :accept="createMethod === QUICKSTART_METHOD.IMPORT ? '.zip' : '.jar'" prepend-icon="mdi-upload-outline" variant="solo" density="compact" hide-details="auto" class="mt-3" @update:model-value="onDesktopFileChange" />
      <div v-else class="desktop-create-hint mt-3">{{ t("TXT_CODE_7da6e84") }}</div>
      <VBtn v-if="needUpload" color="primary" variant="text" rounded="xl" class="mt-3" :disabled="!formData.nickname || uploadStarted" @click="finalConfirm"><VIcon icon="mdi-upload-outline" />{{ percentText() }}</VBtn>
      <VBtn v-else color="primary" variant="text" rounded="xl" class="mt-3" :loading="createInstanceLoading" @click="finalConfirm"><VIcon icon="mdi-plus" />{{ t("TXT_CODE_5a74975b") }}</VBtn>
    </VForm>
  </template>
  <template v-else>
  <VForm ref="formRef" class="normal-create-form" @submit.prevent="finalConfirm">
    <p v-if="createMethod === QUICKSTART_METHOD.DOCKER" class="desktop-create-hint"><VIcon icon="mdi-information-outline" /> {{ t("TXT_CODE_b51bac6f") }}</p>
    <VRow dense>
      <VCol cols="12" md="6">
        <VTextField v-model="formData.nickname" :label="t('TXT_CODE_f70badb9')" :hint="t('TXT_CODE_818928ba')" persistent-hint :placeholder="t('TXT_CODE_475c5890')" :rules="[requiredRule]" variant="solo" density="compact" hide-details="auto" />
      </VCol>
      <VCol cols="12" md="6">
        <VSelect v-model="formData.type" :items="instanceTypeOptions" item-title="title" item-value="value" :label="t('TXT_CODE_2f291d8b')" :hint="t('TXT_CODE_be608c82')" persistent-hint :placeholder="t('TXT_CODE_3bb646e4')" variant="solo" density="compact" hide-details="auto" @update:model-value="changeInstanceType" />
      </VCol>
    </VRow>
    <VRow v-if="createMethod === QUICKSTART_METHOD.DOCKER" dense>
      <VCol cols="12" md="6"><DockerImageSelect :model-value="formData.docker.image ?? ''" :daemon-id="daemonId" @update:model-value="(v: string) => (formData.docker.image = v)" /></VCol>
      <VCol cols="12" md="6" class="desktop-create-switch"><span>{{ t("TXT_CODE_5484094a") }}</span><VSwitch v-model="formData.docker.changeWorkdir" color="primary" hide-details /></VCol>
      <VCol cols="12" md="6"><VTextField v-model="formData.cwd" :label="t('TXT_CODE_20d110b3')" :hint="t('TXT_CODE_877eea45')" persistent-hint variant="solo" density="compact" hide-details="auto" /></VCol>
      <VCol cols="12" md="6"><VTextField v-model="formData.docker.workingDir" :label="t('TXT_CODE_81979d0f')" :hint="t('TXT_CODE_3407250a')" persistent-hint variant="solo" density="compact" hide-details="auto" /></VCol>
    </VRow>
    <VTextarea v-model="formData.startCommand" :label="t('TXT_CODE_d12fa808')" :hint="createMethod === QUICKSTART_METHOD.IMPORT ? t('TXT_CODE_17544b7b') : createMethod === QUICKSTART_METHOD.DOCKER ? t('TXT_CODE_26495d02') : t('TXT_CODE_8c0db3f4')" persistent-hint rows="2" variant="solo" density="compact" hide-details="auto" class="mt-3" />
    <VTextarea v-model="formData.updateCommand" :label="t('TXT_CODE_2e2c6b7b')" :hint="t('TXT_CODE_4f387c5a')" persistent-hint rows="2" variant="solo" density="compact" hide-details="auto" class="mt-3" />
    <VTextField v-model="formData.stopCommand" :label="t('TXT_CODE_11cfe3a1')" :hint="t('TXT_CODE_7ec7ccb8')" persistent-hint :rules="[requiredRule]" variant="solo" density="compact" hide-details="auto" class="mt-3" />
    <VFileInput v-if="needUpload" :label="createMethod === QUICKSTART_METHOD.IMPORT ? t('TXT_CODE_f9b6e61b') : t('TXT_CODE_444db70f')" :accept="createMethod === QUICKSTART_METHOD.IMPORT ? '.zip' : '.jar'" prepend-icon="mdi-upload-outline" variant="solo" density="compact" hide-details="auto" class="mt-3" :disabled="percentComplete > 0 || uploadFileInstance != undefined" @update:model-value="onDesktopFileChange" />
    <div v-else class="desktop-create-hint mt-3">{{ t("TXT_CODE_7da6e84") }}</div>
    <VBtn v-if="needUpload" color="primary" variant="text" rounded="xl" class="mt-3" :disabled="!formData.nickname || uploadStarted" @click="finalConfirm"><VIcon icon="mdi-upload-outline" />{{ percentText() }}</VBtn>
    <VBtn v-else color="primary" variant="text" rounded="xl" class="mt-3" :loading="createInstanceLoading" @click="finalConfirm"><VIcon icon="mdi-plus" />{{ t("TXT_CODE_5a74975b") }}</VBtn>
  </VForm>
  </template>

  <SelectUnzipCode ref="selectUnzipCodeDialog" @select-code="setUnzipCode" />
</template>

<style lang="scss" scoped>
.CardWrapper {
  min-height: 500px;
}

.btn-area {
  position: absolute;
  bottom: 16px;
  right: 16px;
}

.desktop-create-form { display: flex; flex-direction: column; gap: 8px; }
.desktop-create-hint { color: rgba(var(--v-theme-on-surface), 0.68); line-height: 1.5; }
.desktop-create-switch { display: flex; align-items: center; justify-content: space-between; }
</style>
