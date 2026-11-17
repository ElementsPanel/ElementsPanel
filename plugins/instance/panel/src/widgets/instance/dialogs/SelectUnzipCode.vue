<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import { VSelect } from "vuetify/components";

const emit = defineEmits(["selectCode"]);
const open = ref(false);
const openDialog = () => {
  open.value = true;
};

const zipCode = ref<string>();

const submit = async () => {
  try {
    if (!zipCode.value) throw new Error(t("TXT_CODE_COMMON_PLEASE_SELECT_DECOMPRESSION_ENCODING"));
    emit("selectCode", zipCode.value);
    open.value = false;
    return message.success(t("TXT_CODE_COMMON_CONFIGURATION_SUCCESSFUL"));
  } catch (err: any) {
    return reportErrorMsg(err.message);
  }
};

defineExpose({
  openDialog
});
</script>

<template>
  <AppDialog v-model:open="open" :title="t('TXT_CODE_COMMON_SELECT_DECOMPRESSION_ENCODING')" :mask-closable="false" :ok-text="t('TXT_CODE_COMMON_SAVE')" compact @ok="submit">
    <p class="text-medium-emphasis">
      {{ t("TXT_CODE_COMMON_FOR_GARBLED_FILENAMES_TRY_GBK_FOR_MAINLAND_CHINA_BIG5_FOR_TAIWAN_OR_HONG_KONG_AND_UTF") }}
    </p>
    <VSelect v-model="zipCode" :items="[
      { title: t('TXT_CODE_COMMON_PANEL_LINUX_UTF8'), value: 'utf-8' },
      { title: t('TXT_CODE_COMMON_SIMPLIFIED_CHINESE_GBK'), value: 'gbk' },
      { title: t('TXT_CODE_COMMON_TRADITIONAL_CHINESE_BIG5'), value: 'big5' }
    ]" :placeholder="t('TXT_CODE_COMMON_PLEASE_SELECT')" hide-details>
      <template #no-data><Empty :icon="false" compact /></template>
    </VSelect>
  </AppDialog>
</template>
