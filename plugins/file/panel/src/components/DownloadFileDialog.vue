<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportValidatorError } from "@elementspanel/epanel-plugin-console/tools/validator";
import type { DownloadFileConfigItem } from "@elementspanel/epanel-plugin-console/types/fileManager";
import { ref, watch } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VDialog,
  VSpacer,
  VTextField
} from "vuetify/components";

// Declare callbacks locally; the SFC compiler cannot resolve the host-aliased props type.
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
  if (!dataSource.value.url) return reportValidatorError(t("TXT_CODE_COMMON_URL_REQUIRED"));
  if (!dataSource.value.fileName) return reportValidatorError(t("TXT_CODE_COMMON_FILE_NAME_REQUIRED"));
  try {
    const url = new URL(dataSource.value.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
  } catch (_) {
    return reportValidatorError(t("TXT_CODE_COMMON_INVALID_URL"));
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
    <VCard :title="t('TXT_CODE_COMMON_REMOTE_DOWNLOAD_RESOURCES')" rounded="xl">
      <VCardText class="dialog-form">
        <div class="dialog-help">{{ t("TXT_CODE_COMMON_THE_URL_MUST_BE_REACHABLE_FROM_THE_NODE_DOWNLOAD_SPEED_MAY_BE_LIMITED") }}</div>
        <VTextField v-model="dataSource.url" :label="t('TXT_CODE_COMMON_FILE_URL_ADDRESS')" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')" hide-details="auto" />
        <VTextField v-model="dataSource.fileName" :label="t('TXT_CODE_COMMON_FILE_NAME')" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')" hide-details="auto" />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="cancel">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn>
        <VBtn color="primary" @click="submit">{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn>
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
