<script setup lang="ts">
import { reactive, onMounted } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { notification } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { imageList } from "@elementspanel/epanel-plugin-console/services/apis/envImage";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VTextField, VTextarea } from "vuetify/components";

const props = defineProps<{
  dockerFile: string;
  name: string;
  version: string;
  daemonId: string;
}>();

const emit = defineEmits(["close"]);

const options = reactive({
  dockerFile: "",
  name: "",
  version: ""
});

const { execute } = imageList();
const submit = async () => {
  try {
    if (!options.dockerFile || !options.name || !options.version)
      return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_FILL_OUT_THE_FORM_COMPLETELY"));
    await execute({
      params: {
        daemonId: props.daemonId
      },
      data: {
        dockerFile: options.dockerFile,
        name: options.name,
        tag: options.version
      },
      method: "POST"
    });
    notification["info"]({
      message: t("TXT_CODE_COMMON_IMAGE_CREATION_STARTED"),
      description: t("TXT_CODE_COMMON_PLEASE_BE_PATIENT")
    });
    emit("close");
  } catch (err: any) {
    console.error(err.message);
    return reportErrorMsg(err.message);
  }
};

const confirmSubmit = () => Modal.confirm({ title: t("TXT_CODE_DOCKER_IMAGE_BUILD_CONFIRM_HINT"), async onOk() { await submit(); } });

onMounted(() => {
  options.dockerFile = props.dockerFile;
  options.name = props.name;
  options.version = props.version;
});
</script>

<template>
  <div>
    <h5 class="text-title-large mb-2">{{ t("TXT_CODE_COMMON_ABOUT_DOCKER_FILES") }}</h5>
    <p class="text-body-medium text-medium-emphasis">
        {{ t("TXT_CODE_COMMON_OFFICIAL_DOCUMENTATION_HTTPS_DOCS_DOCKER_COM_ENGINE_REFERENCE_BUILDER") }}
    </p>
    <h5 class="text-title-large mb-2">{{ t("TXT_CODE_COMMON_IMPORTANT_NOTES") }}</h5>
    <p class="text-body-medium text-medium-emphasis">
        {{ t("TXT_CODE_DOCKER_WORKSPACE_DIRECTORY_REQUIRED") }}
    </p>
  </div>

  <VTextarea v-model="options.dockerFile" rows="8" class="mb-4" />

  <div class="mb-4">
    <div class="text-body-medium text-medium-emphasis mb-1">
      {{ t("TXT_CODE_COMMON_IMAGE_NAME_AND_VERSION_AFTER_CREATION") }}
    </div>
    <div class="d-flex ga-2"><VTextField v-model="options.name" /><VTextField v-model="options.version" /></div>
  </div>

  <VBtn color="primary" @click="confirmSubmit">{{ t("TXT_CODE_COMMON_CREATE_IMAGE") }}</VBtn>
</template>
