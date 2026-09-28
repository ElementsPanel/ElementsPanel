<script setup lang="ts">
import { t } from "@/lang/i18n";
import AppDialog from "@/components/AppDialog.vue";
import { VBtn, VIcon, VList, VListItem, VListItemSubtitle, VListItemTitle, VProgressLinear } from "vuetify/components";

defineProps<{
  visible: boolean;
  currentMod: any;
  configLoading: boolean;
  configFiles: any[];
}>();

const emit = defineEmits(["update:visible", "edit"]);
</script>

<template>
  <AppDialog :visible="visible" @update:visible="val => emit('update:visible', val)"
    :title="t('TXT_CODE_CONFIG') + ': ' + currentMod?.name" :footer="null">
    <VProgressLinear v-if="configLoading" indeterminate color="primary" class="mb-2" />
    <VList v-else lines="two">
      <VListItem v-for="item in configFiles" :key="item.path" :title="item.name" :subtitle="item.path">
        <template #prepend><VIcon icon="mdi-file-document-outline" /></template>
        <template #append><VBtn variant="text" @click="emit('edit', item)">{{ t("TXT_CODE_EDIT") }}</VBtn></template>
      </VListItem>
    </VList>
  </AppDialog>
</template>
