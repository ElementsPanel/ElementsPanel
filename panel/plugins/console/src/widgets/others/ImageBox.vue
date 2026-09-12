<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { uploadFile } from "@/services/apis/layout";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import type { LayoutCard } from "@/types/index";
import { message } from "@/tools/vuetifyToast";
import { ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VFileInput, VIcon, VProgressLinear, VSpacer, VTabs, VTab, VTextField } from "vuetify/components";

const props = defineProps<{
  card: LayoutCard;
}>();

const { getMetaValue, setMetaValue } = useLayoutCardTools(props.card);
const { containerState } = useLayoutContainerStore();
const { isAdmin } = useAppStateStore();
const imgSrc = ref(getMetaValue("image", ""));
const open = ref(false);
const activeKey = ref("upload");
const percentComplete = ref(0);
const uploadControl = new AbortController();

const { state, execute } = uploadFile();
const beforeUpload = async (file: File) => {
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  await execute({
    data: uploadFormData,
    timeout: Number.MAX_VALUE,
    signal: uploadControl.signal,
    onUploadProgress: (progressEvent: any) => {
      percentComplete.value = Math.round((progressEvent.loaded * 100) / progressEvent.total);
    }
  });
  if (state.value) {
    imgSrc.value = `/upload_files/${state.value}`;
    setMetaValue("image", imgSrc.value);
    percentComplete.value = 0;
    message.success(t("TXT_CODE_773f36a0"));
    open.value = false;
    return false;
  }
};

const onFilePicked = async (file: File | File[] | null) => {
  const selected = Array.isArray(file) ? file[0] : file;
  if (selected) await beforeUpload(selected);
};

const save = async () => {
  setMetaValue("image", imgSrc.value);
  open.value = false;
};

const editImgSrc = async () => {
  open.value = true;
};

const close = () => {
  if (percentComplete.value !== 0) {
    percentComplete.value = 0;
    uploadControl.abort();
  }
  open.value = false;
};
</script>

<template>
  <div style="width: 100%; height: 100%; position: relative">
    <div v-if="imgSrc !== '' && containerState.isDesignMode" class="mask">
      <VBtn color="primary" @click="editImgSrc()">
        {{ t("TXT_CODE_fd13f431") }}
      </VBtn>
    </div>
    <img v-if="imgSrc !== ''" class="global-card-container-shadow" :src="imgSrc" />
    <CardPanel v-else style="height: 100%">
      <template #body>
        <div class="empty-placeholder">
          <VIcon icon="mdi-image-off-outline" size="32" />
          <span>{{ t("TXT_CODE_635d051") }}</span>
          <VBtn
            :disabled="!containerState.isDesignMode || !isAdmin"
            color="primary"
            @click="editImgSrc()"
          >
            {{ t("TXT_CODE_589e091c") }}
          </VBtn>
        </div>
      </template>
    </CardPanel>
  </div>
  <VDialog v-model="open" max-width="620" persistent>
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_fd13f431") }}</VCardTitle>
      <VTabs v-model="activeKey" color="primary">
        <VTab value="upload">{{ t("TXT_CODE_e00c858c") }}</VTab>
        <VTab value="url">{{ t("TXT_CODE_ba42d467") }}</VTab>
      </VTabs>
      <VCardText>
        <template v-if="activeKey === 'upload'">
        <VProgressLinear
          v-if="percentComplete > 0"
          :model-value="percentComplete"
          color="primary"
          class="mb-5"
        />
        <VFileInput
          :disabled="percentComplete > 0"
          :label="t('TXT_CODE_e00c858c')"
          accept="image/*"
          prepend-icon="mdi-upload"
          show-size
          hide-details
          @update:model-value="onFilePicked"
        >
          <template #append-inner>
            {{
              percentComplete > 0
                ? t("TXT_CODE_b625dbf0") + percentComplete + "%"
                : t("TXT_CODE_e00c858c")
            }}
          </template>
        </VFileInput>
        <h4 class="text-subtitle-1 mt-5">{{ t("TXT_CODE_e112412a") }}</h4>
        <ol class="text-body-2 text-medium-emphasis"><li>{{ t("TXT_CODE_2bcc4e34") }}</li><li>{{ t("TXT_CODE_498cd5c5") }}</li><li>{{ t("TXT_CODE_c1320e08") }}</li></ol>
        </template>
        <VTextField v-else v-model="imgSrc" autofocus :label="t('TXT_CODE_ba42d467')" :placeholder="t('TXT_CODE_c8a51b2e')" />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">{{ t("TXT_CODE_b1dedda3") }}</VBtn>
        <VBtn v-if="activeKey === 'url'" color="primary" @click="save">{{ t("TXT_CODE_abfe9512") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
img {
  border: 0;
  border-radius: 12px;
  width: 100%;
  height: 100%;
  object-fit: cover;
  aspect-ratio: 16/9;
}
.app-dark-theme {
  img {
    filter: brightness(0.7);
  }
}
.mask {
  position: absolute;
  z-index: 1;
  background-color: rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 100%;

  button {
    margin: auto;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    position: absolute;
    width: fit-content;
  }
}
.empty-placeholder { height: 100%; min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
</style>
