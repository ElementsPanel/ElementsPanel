<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { VAlert, VAutocomplete, VBtn } from "vuetify/components";
import { t } from "@/lang/i18n";
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
    if (!versions.value.length) error.value = t("TXT_CODE_javaMsl.noVersions");
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
      :label="t('TXT_CODE_javaMsl.version')"
      :loading="loading"
      :disabled="disabled || loading || !!error"
      variant="solo"
      density="compact"
      hide-details="auto"
      @update:model-value="emit('update:modelValue', $event || '')"
    />
    <VAlert v-if="error" type="error" variant="tonal" class="mt-3" rounded="lg">
      {{ error }}
      <template #append>
        <VBtn variant="text" :disabled="disabled || loading" @click="refresh">{{
          t("TXT_CODE_9277af78")
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
      <span>{{ t("TXT_CODE_javaMsl.attribution") }}</span>
    </a>
  </div>
</template>

<style scoped>
.msl-attribution {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  color: rgb(var(--v-theme-primary));
  font-size: 13px;
  text-decoration: none;
}
.msl-attribution:hover {
  text-decoration: underline;
}
.msl-attribution img {
  object-fit: contain;
}
</style>
