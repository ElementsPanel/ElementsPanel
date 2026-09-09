<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { dockerPortsArray } from "@/tools/common";
import AppDialog from "@/components/AppDialog.vue";
import { VChip, VCol, VRow } from "vuetify/components";
const props = defineProps<{
  dockerInfo?: IGlobalInstanceDockerConfig;
}>();

const open = ref(false);
const openDialog = () => {
  open.value = true;
};

defineExpose({
  openDialog
});
</script>

<template>
  <AppDialog v-model:open="open" :title="t('TXT_CODE_a7f6b0e0')" compact :show-cancel="false" :ok-text="t('TXT_CODE_a0451c97')" @ok="open = false">
    <VRow density="comfortable">
      <VCol cols="12" sm="6"><div class="text-caption text-medium-emphasis">{{ t('TXT_CODE_dd238854') }}</div><div>{{ props.dockerInfo?.memory }}MB</div></VCol>
      <VCol cols="12" sm="6"><div class="text-caption text-medium-emphasis">{{ t('TXT_CODE_efcef926') }}</div><div>{{ props.dockerInfo?.networkMode }}</div></VCol>
      <VCol cols="12" sm="6"><div class="text-caption text-medium-emphasis">{{ t('TXT_CODE_77000411') }}</div><div class="text-break">{{ props.dockerInfo?.image }}</div></VCol>
      <VCol cols="12" sm="6"><div class="text-caption text-medium-emphasis">{{ t('TXT_CODE_c3a3b6b1') }}</div><div>{{ props.dockerInfo?.containerName }}</div></VCol>
      <VCol v-if="props.dockerInfo?.ports" cols="12"><div class="text-caption text-medium-emphasis mb-1">{{ t('TXT_CODE_d32301c1') }}</div><div v-for="(item, index) in dockerPortsArray(props.dockerInfo.ports ?? [])" :key="index" class="mb-1"><span>{{ t('TXT_CODE_8dfc41ef') }}: {{ item.host }}</span><span class="ml-2">{{ t('TXT_CODE_8f8103b7') }}: {{ item.container }}</span><VChip class="ml-2" color="success" size="x-small">{{ item.protocol.toUpperCase() }}</VChip></div></VCol>
    </VRow>
  </AppDialog>
</template>
