<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "@/tools/vuetifyToast";
import { reportErrorMsg } from "@/tools/validator";
import AppDialog from "@/components/AppDialog.vue";
import { VSelect } from "vuetify/components";

const emit = defineEmits(["selectCode"]);
const open = ref(false);
const openDialog = () => {
  open.value = true;
};

const zipCode = ref<string>();

const submit = async () => {
  try {
    if (!zipCode.value) throw new Error(t("TXT_CODE_97ceb743"));
    emit("selectCode", zipCode.value);
    open.value = false;
    return message.success(t("TXT_CODE_f07610ed"));
  } catch (err: any) {
    return reportErrorMsg(err.message);
  }
};

defineExpose({
  openDialog
});
</script>

<template>
  <AppDialog v-model:open="open" :title="t('TXT_CODE_2dc23f7a')" :mask-closable="false" :ok-text="t('TXT_CODE_abfe9512')" compact @ok="submit">
    <p class="text-medium-emphasis">
      {{ t("TXT_CODE_b278707d") }}<br />
      {{ t("TXT_CODE_48044fc2") }}<br />
      {{ t("TXT_CODE_76a82338") }}
    </p>
    <VSelect v-model="zipCode" :items="[
      { title: t('TXT_CODE_91bb6101'), value: 'utf-8' },
      { title: t('TXT_CODE_4d6b06f0'), value: 'gbk' },
      { title: t('TXT_CODE_c4dfdb26'), value: 'big5' }
    ]" :placeholder="t('TXT_CODE_3bb646e4')" hide-details />
  </AppDialog>
</template>
