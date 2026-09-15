<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { VAlert, VBtn, VProgressLinear, VSelect, VTextField } from "vuetify/components";
import { t } from "@/lang/i18n";
import type { PreparedJava } from "../../../../../common/src/java";
import { downloadJava, getJavaList } from "../api";
import { useJavaList } from "../hooks/useJavaList";
import JavaVersionSelect from "./JavaVersionSelect.vue";

const props = defineProps<{ daemonId: string; disabled?: boolean }>();
const emit = defineEmits<{ (event: "valid", valid: boolean): void }>();
const mode = ref<"system" | "installed" | "download">("system");
const customPath = ref("");
const runtimeId = ref("");
const version = ref("");
const preparing = ref(false);
const progress = ref<number>();
const installError = ref("");
const { javaList, loading, error, refresh } = useJavaList({
  daemonId: () => props.daemonId,
  active: () => mode.value === "installed"
});
const installed = computed(() =>
  javaList.value.filter((item) => !item.info.downloading && !item.info.error)
);
const modes = computed(() => [
  { value: "system", title: t("TXT_CODE_javaMsl.system") },
  { value: "installed", title: t("TXT_CODE_javaMsl.installed") },
  { value: "download", title: t("TXT_CODE_javaMsl.online") }
]);
const pathRule = (value: string) => !/["\r\n\0]/.test(value) || t("TXT_CODE_javaMsl.invalidPath");
const valid = computed(() => {
  if (mode.value === "system") return pathRule(customPath.value) === true;
  if (mode.value === "download") return !!version.value;
  return !error.value && installed.value.some((item) => item.info.fullname === runtimeId.value);
});
watch(valid, (value) => emit("valid", value), { immediate: true, flush: "sync" });
watch(mode, () => {
  installError.value = "";
});

let controller = new AbortController();
let pending: Promise<PreparedJava> | undefined;
let wake: (() => void) | undefined;
let disposed = false;
watch(
  () => props.daemonId,
  () => {
    controller.abort();
    wake?.();
    controller = new AbortController();
    runtimeId.value = "";
    version.value = "";
    installError.value = "";
  }
);
onUnmounted(() => {
  disposed = true;
  controller.abort();
  wake?.();
});

function prepare(): Promise<PreparedJava> {
  if (pending) return pending;
  if (!valid.value || disposed) return Promise.reject(new Error(t("TXT_CODE_javaMsl.selectJava")));
  if (mode.value === "system")
    return Promise.resolve({ id: "", path: customPath.value.trim() || "java" });
  const selectedMode = mode.value;
  const selectedVersion = version.value;
  const selectedId = runtimeId.value;
  const daemonId = props.daemonId;
  const signal = controller.signal;
  const checkCancelled = () => {
    if (signal.aborted) throw new Error(t("TXT_CODE_javaMsl.interrupted"));
  };
  preparing.value = true;
  progress.value = undefined;
  installError.value = "";
  pending = (async () => {
    try {
      let id = selectedId;
      if (selectedMode === "download") {
        const result = await downloadJava().execute({
          params: { daemonId },
          data: { name: "msl", version: selectedVersion },
          signal
        });
        checkCancelled();
        id = result.value?.info.fullname || "";
      }
      if (!id) throw new Error(t("TXT_CODE_77ce8542"));
      while (true) {
        checkCancelled();
        const result = await getJavaList().execute({
          params: { daemonId },
          forceRequest: true,
          signal
        });
        checkCancelled();
        const runtime = result.value?.find((item) => item.info.fullname === id);
        if (!runtime) throw new Error(t("TXT_CODE_77ce8542"));
        if (runtime.info.error) throw new Error(runtime.info.error);
        progress.value = runtime.info.progress;
        if (!runtime.info.downloading) return { id, path: "{mcsm_java}" };
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = undefined;
            resolve();
          }, 1500);
          wake = () => {
            clearTimeout(timer);
            wake = undefined;
            resolve();
          };
        });
      }
    } catch (cause: any) {
      if (!signal.aborted) installError.value = cause.message;
      throw cause;
    } finally {
      preparing.value = false;
      pending = undefined;
    }
  })();
  return pending;
}
defineExpose({ prepare });
</script>

<template>
  <div class="java-setup">
    <VSelect
      v-model="mode"
      :items="modes"
      :label="t('TXT_CODE_javaMsl.environment')"
      :disabled="disabled || preparing"
      variant="solo"
      density="compact"
      hide-details="auto"
    />
    <VTextField
      v-if="mode === 'system'"
      v-model="customPath"
      :label="t('TXT_CODE_43422ed3')"
      :hint="t('TXT_CODE_javaMsl.pathHint')"
      persistent-hint
      placeholder="java"
      :rules="[pathRule]"
      :disabled="disabled || preparing"
      variant="solo"
      density="compact"
      hide-details="auto"
      class="mt-3"
    />
    <template v-else-if="mode === 'installed'">
      <VSelect
        v-model="runtimeId"
        :items="installed"
        item-title="info.fullname"
        item-value="info.fullname"
        :label="t('TXT_CODE_javaMsl.installed')"
        :loading="loading"
        :disabled="disabled || preparing"
        :no-data-text="t('TXT_CODE_javaMsl.noInstalled')"
        variant="solo"
        density="compact"
        hide-details="auto"
        class="mt-3"
      />
      <VAlert v-if="error" type="error" variant="tonal" class="mt-3" rounded="lg">{{
        error
      }}</VAlert>
      <VBtn
        variant="text"
        :disabled="disabled || preparing || loading"
        @click="refresh().catch(() => {})"
        >{{ t("TXT_CODE_b76d94e0") }}</VBtn
      >
    </template>
    <JavaVersionSelect
      v-else
      v-model="version"
      :daemon-id="daemonId"
      :disabled="disabled || preparing"
      class="mt-3"
    />
    <div v-if="preparing" class="mt-3" role="status" aria-live="polite">
      <p class="mb-2">
        {{ t("TXT_CODE_javaMsl.preparing") }}<span v-if="progress != null"> {{ progress }}%</span>
      </p>
      <VProgressLinear
        :model-value="progress"
        :indeterminate="progress == null"
        color="primary"
        rounded
      />
    </div>
    <VAlert v-if="installError" type="error" variant="tonal" class="mt-3" rounded="lg">{{
      installError
    }}</VAlert>
  </div>
</template>
