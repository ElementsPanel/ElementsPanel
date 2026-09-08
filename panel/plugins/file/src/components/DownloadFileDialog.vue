<script setup lang="ts">
import { t } from "@/lang/i18n";
import { reportValidatorError } from "@/tools/validator";
import type { DownloadFileConfigItem } from "@/types/fileManager";
import { ref, watch } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VSpacer,
  VTextField
} from "vuetify/lib/components/index.mjs";

// The two callbacks `useMountComponent` injects, spelled out rather than taken
// from the core `MountComponent<T>`: the SFC compiler resolves `defineProps`
// types itself, and it cannot follow the `@/` alias from a plugin directory.
interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: any): void;
}

const props = defineProps<Props>();

const open = ref(true);
const dataSource = ref<DownloadFileConfigItem>({
  url: "",
  fileName: ""
});

const submit = async () => {
  if (!dataSource.value.url) return reportValidatorError(t("TXT_CODE_b5095a15"));
  if (!dataSource.value.fileName) return reportValidatorError(t("TXT_CODE_de1b06cd"));
  try {
    new URL(dataSource.value.url);
  } catch (_) {
    return reportValidatorError(t("TXT_CODE_a4a960b9"));
  }
  close(dataSource.value);
};

const close = (result?: DownloadFileConfigItem) => {
  open.value = false;
  props.emitResult(result);
  if (props.destroyComponent) props.destroyComponent();
};

const cancel = () => close();

const getFileNameFromUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    const urlObject = new URL(url);
    const pathSegments = urlObject.pathname.split("/").filter(Boolean);
    const lastPathSegment = pathSegments.pop() || "";
    return decodeURIComponent(lastPathSegment);
  } catch (_) {
    return undefined;
  }
};

watch(
  () => dataSource.value.url,
  (newUrl, oldUrl) => {
    if (newUrl == oldUrl) return;
    const fileName = getFileNameFromUrl(newUrl);
    if (!fileName) return;
    dataSource.value.fileName = fileName;
  }
);
</script>

<template>
  <VDialog v-model="open" class="app-dialog" max-width="440" persistent scrollable>
    <VCard rounded="xl">
      <VCardTitle>{{ t("TXT_CODE_f27b68b3") }}</VCardTitle>
      <VCardText class="dialog-form">
        <div class="dialog-help">{{ t("TXT_CODE_3fd7fe73") }}</div>
        <VTextField v-model="dataSource.url" :label="t('TXT_CODE_ab8dd5a0')" :placeholder="t('TXT_CODE_4ea93630')" hide-details="auto" />
        <VTextField v-model="dataSource.fileName" :label="t('TXT_CODE_2eace3d5')" :placeholder="t('TXT_CODE_4ea93630')" hide-details="auto" />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" @click="submit">{{ t("TXT_CODE_d507abff") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-help {
  color: var(--color-gray-7);
  font-size: 12px;
}
</style>
