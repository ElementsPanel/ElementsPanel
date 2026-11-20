<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { computed, onUnmounted, ref, watch } from "vue";
import { VAlert, VAutocomplete, VBtn } from "vuetify/components";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { getJavaCatalog } from "../api";
import mslLogo from "../assets/msl-logo.png";

const props = defineProps<{
  daemonId: string;
  modelValue?: string;
  installedJavaList?: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  (event: "update:modelValue", version: string): void;
}>();
const versions = ref<string[]>([]);
const loading = ref(false);
const error = ref("");
let request = 0;
let controller: AbortController | undefined;
const items = computed(() =>
  versions.value.map((version) => ({
    value: version,
    title: `Java ${version}`,
    props: { disabled: props.installedJavaList?.includes(`msl_${version}`) }
  }))
);

async function refresh() {
  const current = ++request;
  controller?.abort();
  controller = new AbortController();
  versions.value = [];
  emit("update:modelValue", "");
  loading.value = true;
  error.value = "";
  try {
    const result = await getJavaCatalog().execute({
      params: { daemonId: props.daemonId },
      signal: controller.signal
    });
    if (current !== request) return;
    versions.value = result.value?.versions ?? [];
    if (!versions.value.length) error.value = t("TXT_CODE_JAVA_MSL_NO_VERSIONS");
  } catch (cause: any) {
    if (current === request) error.value = cause.message;
  } finally {
    if (current === request) loading.value = false;
  }
}
watch(() => props.daemonId, refresh, { immediate: true });
onUnmounted(() => {
  request++;
  controller?.abort();
});
</script>

<template>
  <div>
    <VAutocomplete
      :model-value="modelValue"
      :items="items"
      :label="t('TXT_CODE_JAVA_MSL_VERSION')"
      :loading="loading"
      :disabled="disabled || loading || !!error"
      density="compact"
      hide-details="auto"
      @update:model-value="emit('update:modelValue', $event || '')"
    >
      <template #no-data><Empty :icon="false" compact /></template>
    </VAutocomplete>
    <VAlert v-if="error" type="error" variant="tonal" class="mt-3">
      {{ error }}
      <template #append>
        <VBtn variant="text" :disabled="disabled || loading" @click="refresh">{{
          t("TXT_CODE_COMMON_RETRY")
        }}</VBtn>
      </template>
    </VAlert>
    <a
      class="msl-attribution"
      href="https://www.mslmc.cn/"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img :src="mslLogo" alt="MSL" width="24" height="24" />
      <span>{{ t("TXT_CODE_JAVA_MSL_ATTRIBUTION") }}</span>
    </a>
  </div>
</template>

<style lang="scss" scoped>
@use "../../assets/msl-attribution";
</style>
