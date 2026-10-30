<script setup lang="ts">
import { t } from "@/lang/i18n";
import { onMounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VDialog,
  VImg,
  VProgressCircular,
  VSpacer
} from "vuetify/components";
import { useFileManager } from "../hooks/useFileManager";

const props = defineProps<{
  emitResult: () => void;
  destroyComponent: () => void;
  instanceId: string;
  daemonId: string;
  fileName: string;
  frontDir: string;
}>();

const { getFileLink } = useFileManager(props.instanceId, props.daemonId);

const isOpen = ref(true);
const imgLink = ref("");
const downloadBtnLoading = ref(false);

const onClose = () => {
  isOpen.value = false;
  props.emitResult();
  props.destroyComponent();
};

const onDownload = async () => {
  downloadBtnLoading.value = true;
  imgLink.value = (await getFileLink(props.fileName, props.frontDir)) || "";
  downloadBtnLoading.value = false;
  window.open(imgLink.value);
};

onMounted(async () => {
  imgLink.value = (await getFileLink(props.fileName, props.frontDir)) || "";
});
</script>

<template>
  <VDialog v-model="isOpen" class="app-dialog" max-width="960" persistent scrollable>
    <VCard rounded="xl" :title="t('TXT_CODE_eee2a47f')">
      <VCardText>
        <div class="image-view">
          <VProgressCircular v-if="!imgLink" indeterminate color="primary" />
          <VImg v-else :src="imgLink" :alt="props.fileName" max-height="65vh" contain />
        </div>
        <div class="image-name">{{ props.fileName }}</div>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="onClose">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" :loading="downloadBtnLoading" @click="onDownload">{{ t("TXT_CODE_65b21404") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.image-view {
  min-height: 240px;
  margin-bottom: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.image-name {
  text-align: center;
}
</style>
