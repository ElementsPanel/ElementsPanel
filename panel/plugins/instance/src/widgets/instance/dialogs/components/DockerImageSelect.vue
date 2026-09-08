<script setup lang="ts">
import { useAppRouters } from "@/hooks/useAppRouters";
import { t } from "@/lang/i18n";
import { imageList } from "@/services/apis/envImage";
import { arrayFilter } from "@/tools/array";
import { ref, watch } from "vue";
import { VSelect, VTextField } from "vuetify/lib/components/index.mjs";

const IMAGE_DEFINE = {
  NEW: "__MCSM_NEW_IMAGE__",
  EDIT: "__MCSM_EDIT_IMAGE__"
};

const props = defineProps<{
  modelValue: string;
  daemonId?: string;
  isAllowEmpty?: boolean;
  isAllowText?: string;
  imageSelectMethod?: "SELECT" | "EDIT";
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:imageSelectMethod": [value: "SELECT" | "EDIT"];
}>();

const imageSelectMethod = ref<"SELECT" | "EDIT">("SELECT");
watch(() => props.imageSelectMethod, (value) => {
  if (value) imageSelectMethod.value = value;
}, { immediate: true });
const { toPage } = useAppRouters();
const dockerImages = ref<{ label: string; value: string }[]>([]);
const loading = ref(false);
const { execute: getImageList } = imageList();

const loadImages = async () => {
  loading.value = true;
  dockerImages.value = arrayFilter([
    {
      label: props.isAllowText ?? t("TXT_CODE_79d4205"),
      value: "",
      condition: () => props.isAllowEmpty
    },
    {
      label: t("TXT_CODE_435f4975"),
      value: IMAGE_DEFINE.EDIT
    }
  ]);

  try {
    const images = await getImageList({
      params: {
        daemonId: props.daemonId ?? ""
      },
      method: "GET"
    });

    if (images.value) {
      for (const iterator of images.value) {
        const repoTags = iterator?.RepoTags?.[0];
        if (repoTags)
          dockerImages.value.push({
            label: repoTags,
            value: repoTags
          });
      }
    }
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
};

const selectImage = (image: unknown) => {
  if (typeof image === "string" && image === IMAGE_DEFINE.NEW) {
    toPage({
      path: `/node/image?daemonId=${props.daemonId}`
    });
    return;
  }
  if (image === IMAGE_DEFINE.EDIT) {
    emit("update:modelValue", "");
    emit("update:imageSelectMethod", "EDIT");
    imageSelectMethod.value = "EDIT";
  }
};
</script>

<template>
  <template v-if="imageSelectMethod === 'SELECT'">
    <VSelect :model-value="modelValue" :items="dockerImages" item-title="label" item-value="value" :placeholder="t('TXT_CODE_3bb646e4')" :loading="loading" hide-details @focus="loadImages" @update:model-value="(v) => { emit('update:modelValue', v); selectImage(v); }" />
  </template>

  <template v-else>
    <VTextField :model-value="modelValue" :placeholder="t('TXT_CODE_d7638d7b')" variant="solo-filled" hide-details @update:model-value="(v) => emit('update:modelValue', v)" />
  </template>
</template>
