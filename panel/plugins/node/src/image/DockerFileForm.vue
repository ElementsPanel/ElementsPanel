<script setup lang="ts">
import { reactive, onMounted } from "vue";
import { t } from "@/lang/i18n";
import { notification } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import { imageList } from "@/services/apis/envImage";
import { reportErrorMsg } from "@/tools/validator";
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
      return reportErrorMsg(t("TXT_CODE_2764f197"));
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
      message: t("TXT_CODE_55edf44d"),
      description: t("TXT_CODE_b340c04a")
    });
    emit("close");
  } catch (err: any) {
    console.error(err.message);
    return reportErrorMsg(err.message);
  }
};

const confirmSubmit = () => Modal.confirm({ title: t("TXT_CODE_4e4b52a0"), async onOk() { await submit(); } });

onMounted(() => {
  options.dockerFile = props.dockerFile;
  options.name = props.name;
  options.version = props.version;
});
</script>

<template>
  <div>
    <h5 class="text-h6 mb-2">{{ t("TXT_CODE_868df02c") }}</h5>
    <p class="text-body-2 text-medium-emphasis">
        {{ t("TXT_CODE_77d93d7d") }}
    </p>
    <h5 class="text-h6 mb-2">{{ t("TXT_CODE_ef0ce2e") }}</h5>
    <p class="text-body-2 text-medium-emphasis">
        {{ t("TXT_CODE_5024d817") }}
    </p>
  </div>

  <VTextarea v-model="options.dockerFile" rows="8" class="mb-4" />

  <div class="mb-4">
    <div class="text-body-2 text-medium-emphasis mb-1">
      {{ t("TXT_CODE_7cf078e8") }}
    </div>
    <div class="d-flex ga-2"><VTextField v-model="options.name" /><VTextField v-model="options.version" /></div>
  </div>

  <VBtn color="primary" @click="confirmSubmit">{{ t("TXT_CODE_3d09f0ac") }}</VBtn>
</template>
