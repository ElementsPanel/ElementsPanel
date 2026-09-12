<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { uploadFile } from "@/services/apis/layout";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import type { LayoutCard } from "@/types/index";
import { message } from "@/tools/vuetifyToast";
import _ from "lodash";
import { ref } from "vue";
import { reportValidatorError } from "@/tools/validator";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCarousel, VCarouselItem, VDialog, VFileInput, VIcon, VProgressLinear, VSpacer, VTextField } from "vuetify/components";

const props = defineProps<{
  card: LayoutCard;
}>();

interface ImgList {
  url: string;
  key: number;
  uploadPercent: number;
  uploadControl?: AbortController;
}

const { getMetaValue, setMetaValue } = useLayoutCardTools(props.card);
const { containerState } = useLayoutContainerStore();
const { isAdmin } = useAppStateStore();
const open = ref(false);
const imgList = ref(getMetaValue<ImgList[]>("images", []));
const displayImgList = ref(_.cloneDeep(imgList.value));

const beforeUpload = async (file: File, imgItem: ImgList) => {
  imgItem.uploadControl = new AbortController();
  const { state, execute } = uploadFile();
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  await execute({
    data: uploadFormData,
    params: {
      t: Date.now()
    },
    timeout: Number.MAX_VALUE,
    signal: imgItem.uploadControl.signal,
    onUploadProgress: (progressEvent: any) => {
      imgItem.uploadPercent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
    },
    forceRequest: true
  });
  if (state.value) {
    imgItem.url = `/upload_files/${state.value}`;
    imgItem.uploadPercent = 0;
    message.success(t("TXT_CODE_773f36a0"));
    return false;
  }
};

const cancelUpload = (item: ImgList) => {
  if (!(item.uploadControl instanceof AbortController)) return;
  item.uploadPercent = 0;
  item.uploadControl.abort();
};

const removeImgSrc = (item: ImgList) => {
  const index = imgList.value.indexOf(item);
  if (index !== -1) {
    imgList.value.splice(index, 1);
  }
};
const addImgSrc = () => {
  imgList.value.push({
    url: "",
    key: Date.now(),
    uploadPercent: 0
  });
};

const editImgSrc = async () => {
  open.value = true;
};

const close = () => {
  imgList.value.forEach((item) => cancelUpload(item));
  open.value = false;
};

const save = async () => {
  if (imgList.value.some((item) => !item.url.trim())) {
    return reportValidatorError(new Error(t("TXT_CODE_c8a51b2e")));
  }
  setMetaValue("images", imgList.value);
  displayImgList.value = _.cloneDeep(imgList.value);
  open.value = false;
};

const onFilePicked = async (file: File | File[] | null, item: ImgList) => {
  const selected = Array.isArray(file) ? file[0] : file;
  if (selected) await beforeUpload(selected, item);
};
</script>

<template>
  <div style="width: 100%; height: 100%; position: relative">
    <VCarousel v-if="imgList.length !== 0" class="h-100" show-arrows="hover" cycle hide-delimiter-background>
      <VCarouselItem v-for="item in displayImgList" :key="item.url"><img :src="item.url" /></VCarouselItem>
    </VCarousel>
    <div v-if="imgList.length !== 0 && containerState.isDesignMode" class="mask">
      <VBtn color="primary" @click="editImgSrc()">
        {{ t("TXT_CODE_fd13f431") }}
      </VBtn>
    </div>
    <CardPanel v-if="imgList.length === 0" style="height: 100%">
      <template #body>
        <div class="empty-placeholder">
          <VIcon icon="mdi-image-multiple-outline" size="32" />
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
  <VDialog v-model="open" max-width="760" persistent>
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_4a56836d") }}</VCardTitle>
      <VCardText>
        <div v-for="(imgItem, index) in imgList" :key="imgItem.url + imgItem.key" class="d-flex align-center ga-2 mb-4">
          <div class="flex-grow-1">
            <div class="text-body-2 text-medium-emphasis mb-1">{{ `${t('TXT_CODE_9900f79e')} ${index + 1}` }}</div>
            <VProgressLinear v-if="imgItem.uploadPercent > 0" :model-value="imgItem.uploadPercent" color="primary" class="mb-1" />
            <VTextField v-if="imgItem.uploadPercent === 0" v-model="imgItem.url" :placeholder="t('TXT_CODE_c8a51b2e')" hide-details="auto" />
            <VTextField v-else :model-value="`${t('TXT_CODE_b625dbf0') + imgItem.uploadPercent}%`" disabled hide-details />
          </div>
          <VFileInput v-if="imgItem.uploadPercent === 0" class="carousel-file-input" accept="image/*" prepend-icon="mdi-upload" hide-details show-size @update:model-value="(file) => onFilePicked(file, imgItem)" />
          <VBtn v-else icon variant="text" color="error" :title="t('TXT_CODE_7ec87e8a')" @click="cancelUpload(imgItem)"><VIcon icon="mdi-close" /></VBtn>
          <VBtn v-if="imgList.length > 1" icon variant="text" color="error" @click="removeImgSrc(imgItem)"><VIcon icon="mdi-minus-circle-outline" /></VBtn>
        </div>
        <VBtn variant="tonal" @click="addImgSrc"><VIcon start icon="mdi-plus" />{{ t("TXT_CODE_589e091c") }}</VBtn>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">{{ t("TXT_CODE_b1dedda3") }}</VBtn>
        <VBtn color="primary" @click="save">{{ t("TXT_CODE_abfe9512") }}</VBtn>
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
  z-index: 10;
  background-color: rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 100%;
  top: 0;

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
