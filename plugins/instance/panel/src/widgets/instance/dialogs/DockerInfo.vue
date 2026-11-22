<script setup lang="ts">
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { dockerPortsArray } from "@elementspanel/epanel-plugin-console/tools/common";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
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
  <AppDialog v-model:open="open" :title="t('TXT_CODE_COMMON_CONTAINER_RESOURCE_LIMITATION')" compact :show-cancel="false" :ok-text="t('TXT_CODE_COMMON_CANCEL')" @ok="open = false">
    <VRow density="comfortable">
      <VCol cols="12" sm="6"><div class="text-body-small text-medium-emphasis">{{ t('TXT_CODE_COMMON_MAXIMUM_MEMORY') }}</div><div>{{ props.dockerInfo?.memory }}MB</div></VCol>
      <VCol cols="12" sm="6"><div class="text-body-small text-medium-emphasis">{{ t('TXT_CODE_COMMON_NETWORK_MODE') }}</div><div>{{ props.dockerInfo?.networkMode }}</div></VCol>
      <VCol cols="12" sm="6"><div class="text-body-small text-medium-emphasis">{{ t('TXT_CODE_COMMON_IMAGE') }}</div><div class="text-break">{{ props.dockerInfo?.image }}</div></VCol>
      <VCol cols="12" sm="6"><div class="text-body-small text-medium-emphasis">{{ t('TXT_CODE_COMMON_CONTAINER_NAME') }}</div><div>{{ props.dockerInfo?.containerName }}</div></VCol>
      <VCol v-if="props.dockerInfo?.ports" cols="12"><div class="text-body-small text-medium-emphasis app-mb-1">{{ t('TXT_CODE_COMMON_AVAILABLE_PORTS') }}</div><div v-for="(item, index) in dockerPortsArray(props.dockerInfo.ports ?? [])" :key="index" class="app-mb-1"><span>{{ t('TXT_CODE_COMMON_HOST') }}: {{ item.host }}</span><span class="app-ml-2">{{ t('TXT_CODE_COMMON_CONTAINER') }}: {{ item.container }}</span><VChip class="app-ml-2" color="success" size="x-small">{{ item.protocol.toUpperCase() }}</VChip></div></VCol>
    </VRow>
  </AppDialog>
</template>
