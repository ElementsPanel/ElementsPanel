<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import JavaIcon from "../assets/java.png";
import { t } from "@/lang/i18n";
import type { DownloadJavaConfigItem } from "../types";
import { computed, ref } from "vue";
import { VCard, VChip, VCol, VImg, VRow } from "vuetify/lib/components/index.mjs";

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: DownloadJavaConfigItem): void;
}
const props = defineProps<Props>();
const open = ref(true);
const selectedIndex = ref<number | null>(null);
const JAVA_OPTIONS: DownloadJavaConfigItem[] = [8, 11, 15, 17, 21, 25].map((version) => ({
  name: "zulu",
  version: String(version)
}));
const selectedItem = computed(() =>
  selectedIndex.value === null ? null : JAVA_OPTIONS[selectedIndex.value]
);
const cancel = () => {
  open.value = false;
  props.destroyComponent?.();
};
const submit = () => {
  if (selectedItem.value) props.emitResult(selectedItem.value);
  cancel();
};
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="t('TXT_CODE_84588601')"
    :max-width="820"
    :closable="false"
    :ok-button-props="{ disabled: selectedIndex === null }"
    @ok="submit"
    @cancel="cancel"
  >
    <VRow dense>
      <VCol
        v-for="(item, index) in JAVA_OPTIONS"
        :key="`${item.name}-${item.version}`"
        cols="6"
        sm="4"
        md="3"
      >
        <VCard
          class="java-card"
          :class="{ 'java-card-selected': selectedIndex === index }"
          rounded="xl"
          flat
          @click="selectedIndex = index"
        >
          <div class="java-card-cover"><VImg :src="JavaIcon" width="62" height="62" contain /></div>
          <div class="java-card-body">
            <div class="font-weight-medium">Java {{ item.version }}</div>
            <VChip size="small" color="primary" variant="tonal">{{
              item.name.toUpperCase()
            }}</VChip>
          </div>
        </VCard>
      </VCol>
    </VRow>
  </AppDialog>
</template>

<style scoped>
.java-card {
  cursor: pointer;
  border: 1px solid var(--color-gray-5);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  overflow: hidden;
}
.java-card:hover,
.java-card-selected {
  border-color: rgb(var(--v-theme-primary));
}
.java-card-selected {
  background: rgba(var(--v-theme-primary), 0.08);
}
.java-card-cover {
  display: flex;
  justify-content: center;
  padding: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.java-card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 14px;
}
</style>
