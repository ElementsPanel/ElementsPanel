<script setup lang="ts">
import { computed, toRef, watch } from "vue";
import { VAlert, VAutocomplete, VBtn, VCol, VRow } from "vuetify/components";
import { t } from "@/lang/i18n";
import type { MinecraftServerSelection } from "../../../../../../common/src/minecraft";
import { useMinecraftDownload } from "../../hooks/useMinecraftDownload";
import { MINECRAFT_SERVERS } from "../../minecraft";
import mslLogo from "../../assets/msl-logo.png";

const props = defineProps<{ instanceType: string; disabled?: boolean }>();
const emit = defineEmits<{
  (event: "update:modelValue", selection: MinecraftServerSelection | undefined): void;
}>();
const {
  servers,
  versions,
  builds,
  server,
  version,
  build,
  description,
  loading,
  error,
  selection,
  selectServer,
  selectVersion,
  retry
} = useMinecraftDownload(toRef(props, "instanceType"));
const serverItems = computed(() =>
  servers.value.map((value) => ({ value, title: MINECRAFT_SERVERS[value].title }))
);
watch(selection, (value) => emit("update:modelValue", value), { immediate: true, flush: "sync" });
</script>

<template>
  <div class="minecraft-download">
    <VRow density="compact">
      <VCol cols="12" md="4">
        <VAutocomplete
          :model-value="server"
          :items="serverItems"
          :label="t('TXT_CODE_minecraft.server')"
          :loading="loading === 'servers'"
          :disabled="disabled || loading === 'servers'"
          variant="solo"
          density="compact"
          hide-details="auto"
          @update:model-value="selectServer($event || '')"
        />
      </VCol>
      <VCol cols="12" md="4">
        <VAutocomplete
          :model-value="version"
          :items="versions"
          :label="t('TXT_CODE_minecraft.version')"
          :loading="loading === 'versions'"
          :disabled="
            disabled || !versions.length || loading === 'servers' || loading === 'versions'
          "
          variant="solo"
          density="compact"
          hide-details="auto"
          @update:model-value="selectVersion($event || '')"
        />
      </VCol>
      <VCol cols="12" md="4">
        <VAutocomplete
          v-model="build"
          :items="builds"
          :label="t('TXT_CODE_minecraft.build')"
          :loading="loading === 'builds'"
          :disabled="disabled || !!loading || !builds.length"
          variant="solo"
          density="compact"
          hide-details="auto"
        />
      </VCol>
    </VRow>
    <p v-if="description" class="text-medium-emphasis mt-2">{{ description }}</p>
    <VAlert v-if="error" type="error" variant="tonal" class="mt-3" rounded="lg">
      {{ error }}
      <template #append
        ><VBtn variant="text" :disabled="disabled" @click="retry">{{
          t("TXT_CODE_9277af78")
        }}</VBtn></template
      >
    </VAlert>
    <p v-if="server === 'bedrock-server'" class="text-medium-emphasis mt-2">
      {{ t("TXT_CODE_minecraft.bedrockHint") }}
    </p>
    <a
      class="msl-attribution"
      href="https://www.mslmc.cn/"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img :src="mslLogo" alt="MSL" width="24" height="24" />
      <span>{{ t("TXT_CODE_minecraft.attribution") }}</span>
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
