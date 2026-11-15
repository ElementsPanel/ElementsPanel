<!-- IframeBox 组件 -->
<template>
  <div class="iframe-box" :style="{ width: width, height: height }">
    <iframe
      v-if="iframeSrc"
      ref="iframeRef"
      :style="{ width: width, height: height }"
      :src="iframeSrc"
      class="iframe-content"
      @load="handleLoad"
      @error="handleError"
    ></iframe>

    <div v-if="error !== null" class="iframe-error">
      <Empty
        icon="mdi-alert-circle-outline"
        :title="t('TXT_CODE_ef8f8e29')"
        :description="error || undefined"
        compact
      >
        <template #actions>
          <VBtn variant="tonal" prepend-icon="mdi-refresh" @click="reload">{{
            t("TXT_CODE_9277af78")
          }}</VBtn>
        </template>
      </Empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import Empty from "@/components/Empty.vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { nextTick, onMounted, ref } from "vue";
import { VBtn } from "vuetify/components";
import { useIframeEventListener, type IframeBoxEmits, type IframeBoxProps } from "./config";

const props = withDefaults(defineProps<IframeBoxProps>(), {
  width: "100%",
  height: "100%"
});

const emit = defineEmits<IframeBoxEmits>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const error = ref<string | null>(null);
const iframeSrc = ref<string>("");
const { isDarkTheme } = useAppConfigStore();

useIframeEventListener(iframeRef);

// 处理iframe加载完成
const handleLoad = () => {
  error.value = null;
  emit("load");
};

// 处理iframe加载错误
const handleError = (err: any) => {
  console.error("IframeBox error", err);
  error.value = err?.message || "";
  emit("error");
};

const generateIframeAddr = () => {
  return `${props.src}?theme=${isDarkTheme.value ? "dark" : "light"}&t=${Date.now()}`;
};

// 重新加载iframe
const reload = () => {
  error.value = null;
  iframeSrc.value = "";
  nextTick(() => {
    iframeSrc.value = generateIframeAddr();
  });
};

onMounted(() => {
  iframeSrc.value = generateIframeAddr();
});
</script>

<style scoped>
.iframe-box {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.iframe-content {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}

.iframe-error {
  position: absolute;
  inset: 0;
  overflow: auto;
  background: var(--color-gray-1);
}

.iframe-error :deep(.app-empty) {
  min-height: 100%;
}
</style>
