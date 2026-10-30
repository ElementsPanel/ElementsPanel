<script setup lang="ts">
import DesktopDialog from "@/components/DesktopDialog.vue";
import { t } from "@/lang/i18n";
import AppDialog from "@/components/AppDialog.vue";

import { VBtn, VIcon, VList, VListItem } from "vuetify/components";

const SettingOutlined = "mdi-cog-outline";

defineProps<{
  visible: boolean;
  currentMod: any;
  configLoading: boolean;
  configFiles: any[];
  isDesktop?: boolean;
}>();

const emit = defineEmits(["update:visible", "edit"]);
</script>

<template>
  <template v-if="isDesktop">
    <DesktopDialog
      id="mod-config-dialog"
      :title="t('TXT_CODE_CONFIG') + ': ' + currentMod?.name"
      :icon="SettingOutlined"
      :model-value="visible"
      :width="600"
      :height="400"
      :z-index="10001"
      @close="emit('update:visible', false)"
    >
      <VList v-if="!configLoading" rounded="xl">
        <VListItem v-for="item in configFiles" :key="item.path || item.name" :title="item.name" :subtitle="item.path">
          <template #prepend><VIcon icon="mdi-file-document-outline" /></template>
          <template #append><VBtn variant="text" @click="emit('edit', item)">{{ t("TXT_CODE_EDIT") }}</VBtn></template>
        </VListItem>
        <VListItem v-if="!configFiles.length" :title="t('TXT_CODE_NO_DATA')" />
      </VList>
      <div v-else class="desktop-modal-loading"><VIcon icon="mdi-loading" /></div>
    </DesktopDialog>
  </template>
  <AppDialog v-else :visible="visible" @update:visible="val => emit('update:visible', val)"
    :title="t('TXT_CODE_CONFIG') + ': ' + currentMod?.name" :footer="null">
    <VList v-if="!configLoading" rounded="xl">
      <VListItem v-for="item in configFiles" :key="item.path || item.name" :title="item.name" :subtitle="item.path">
        <template #prepend><VIcon icon="mdi-file-document-outline" /></template>
        <template #append><VBtn variant="text" @click="emit('edit', item)">{{ t("TXT_CODE_EDIT") }}</VBtn></template>
      </VListItem>
      <VListItem v-if="!configFiles.length" :title="t('TXT_CODE_NO_DATA')" />
    </VList>
    <div v-else class="desktop-modal-loading"><VIcon icon="mdi-loading" /></div>
  </AppDialog>
</template>
