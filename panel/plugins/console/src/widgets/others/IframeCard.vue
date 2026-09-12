<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { $t as t } from "@/lang/i18n";
import { useAppToolsStore } from "@/stores/useAppToolsStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import CardPanel from "@/components/CardPanel.vue";
import IconBtn from "@/components/IconBtn.vue";
import type { LayoutCard } from "@/types/index";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { computed } from "vue";
import { VBtn, VIcon, VProgressLinear } from "vuetify/components";

const props = defineProps<{
  card: LayoutCard;
}>();

const { getMetaValue, setMetaValue } = useLayoutCardTools(props.card);

const { containerState } = useLayoutContainerStore();
const urlSrc = ref(getMetaValue("url", ""));
const fullCard = computed(() => getMetaValue("full"));
const { openInputDialog } = useAppToolsStore();

const editImgSrc = async () => {
  try {
    urlSrc.value = (await openInputDialog(t("TXT_CODE_45364559"))) as string;
    setMetaValue("url", urlSrc.value);
  } catch (error: any) {}
};

const myIframe = ref<HTMLIFrameElement | null>(null);
const myIframeLoading = ref(false);

const toggleFullCard = () => {
  setMetaValue("full", !fullCard.value);
};

onMounted(() => {
  watch([urlSrc, myIframe], () => {
    try {
      myIframeLoading.value = true;
      if (myIframe.value) {
        myIframe.value.onload = () => {
          myIframeLoading.value = false;
        };
      }
    } catch (error: any) {
      console.error(error);
    }
  });
});
</script>

<template>
  <div style="width: 100%; height: 100%; position: relative">
    <CardPanel v-if="urlSrc !== ''" style="backdrop-filter: blur()">
      <template #title>
        {{ card.title }}
        <VBtn
          v-if="urlSrc !== '' && containerState.isDesignMode"
          class="ml-10"
          color="primary"
          size="small"
          @click="editImgSrc()"
        >
          {{ t("TXT_CODE_78930f0f") }}
        </VBtn>
      </template>
      <template v-if="containerState.isDesignMode" #operator>
        <IconBtn
          :icon="fullCard ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
          :title="fullCard ? t('TXT_CODE_2818a7bc') : t('TXT_CODE_52ba5942')"
          @click="toggleFullCard"
        ></IconBtn>
      </template>

      <template #body>
        <VProgressLinear v-show="myIframeLoading" indeterminate color="primary" class="mb-2" />
        <iframe
          v-show="!myIframeLoading"
          ref="myIframe"
          :src="urlSrc"
          :style="{
            height: card.height,
            width: '100%',
            'z-index': containerState.isDesignMode ? -1 : 1
          }"
          :class="{ 'full-card-iframe': fullCard }"
          frameborder="0"
          marginwidth="0"
          marginheight="0"
        ></iframe>
      </template>
    </CardPanel>
    <CardPanel v-else style="height: 100%">
      <template #body>
        <div class="empty-placeholder"><VIcon icon="mdi-web-off" size="32" /><span>{{ t("TXT_CODE_6239c6b6") }}</span><VBtn color="primary" @click="editImgSrc()">{{ t("TXT_CODE_dde54f31") }}</VBtn></div>
      </template>
    </CardPanel>
  </div>
</template>

<style scoped lang="scss">
.full-card-iframe {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
  border-radius: 12px;
}
.empty-placeholder { height: 100%; min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
</style>
