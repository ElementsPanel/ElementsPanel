<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { uploadFile } from "@/services/apis/layout";
import { reportErrorMsg } from "@/tools/validator";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VFileInput,
  VProgressLinear,
  VSpacer
} from "vuetify/lib/components/index.mjs";

const { execute } = uploadFile();

// The two callbacks `useMountComponent` injects, spelled out rather than taken
// from the core `MountComponent<T>`: the SFC compiler resolves `defineProps`
// types itself, and it cannot follow the `@/` alias from a plugin directory.
interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: any): void;
}

const props = defineProps<Props>();
const uploadControl = new AbortController();
const open = ref(true);
const percentComplete = ref(0);

const submit = (path = "") => {
  open.value = false;
  props.emitResult(path);
  props.destroyComponent();
};

const uploadSelectedFile = async (value: unknown) => {
  const file = Array.isArray(value) ? value[0] : value;
  if (!(file instanceof File)) return;
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  try {
    const res = await execute({
      data: uploadFormData,
      timeout: Number.MAX_SAFE_INTEGER,
      signal: uploadControl.signal,
      onUploadProgress: (progressEvent: any) => {
        percentComplete.value = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      }
    });

    if (res.value) {
      message.success(t("TXT_CODE_773f36a0"));
      submit(`/upload_files/${res.value}`);
    } else {
      submit("");
    }
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const cancel = () => {
  uploadControl.abort();
  submit();
};
</script>

<template>
  <VDialog v-model="open" class="app-dialog" max-width="440" persistent scrollable>
    <VCard rounded="xl">
      <VCardTitle>{{ t("TXT_CODE_e00c858c") }}</VCardTitle>
      <VCardText class="upload-container">
        <VFileInput
          :disabled="percentComplete > 0"
          :label="t('TXT_CODE_335ba209')"
          accept="*/*"
          prepend-icon="mdi-folder-open-outline"
          hide-details="auto"
          @update:model-value="uploadSelectedFile"
        />
        <VProgressLinear v-if="percentComplete > 0" :model-value="percentComplete" color="primary" rounded="xl" height="6" />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.upload-container {
  min-height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}
</style>
