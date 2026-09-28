<script lang="ts" setup>
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { VCol, VForm, VRow, VTextField } from "vuetify/components";

interface FormDataType {
  javaPath: string;
  jarName: string;
  maxMemory: string;
  minMemory: string;
  suffix: string;
  additional: string;
}

const props = defineProps<{
  data: FormDataType;
}>();

const formRef = ref();

const form = ref<FormDataType>(props.data);

const validate = async () => {
  return await formRef.value.validate();
};

defineExpose({ validate });
</script>

<template>
  <VForm ref="formRef">
    <VTextField v-model="form.jarName" :label="t('TXT_CODE_58508fb7')" :placeholder="t('TXT_CODE_84f760fa')" :rules="[(value) => String(value || '').trim() ? true : t('TXT_CODE_58508fb7')]" />
    <VRow>
      <VCol cols="12" sm="6"><VTextField v-model="form.maxMemory" :label="t('TXT_CODE_dd238854')" :placeholder="t('TXT_CODE_d7fa3be3')" /></VCol>
      <VCol cols="12" sm="6"><VTextField v-model="form.minMemory" :label="t('TXT_CODE_e050b3be')" :placeholder="t('TXT_CODE_57c1b0a3')" /></VCol>
      <VCol cols="12"><VTextField v-model="form.javaPath" :label="t('TXT_CODE_43422ed3')" :placeholder="t('TXT_CODE_7f9b6758')" /></VCol>
      <VCol cols="12"><VTextField v-model="form.additional" :label="t('TXT_CODE_4efba567')" :placeholder="t('TXT_CODE_f79563ef')" /></VCol>
      <VCol cols="12"><VTextField v-model="form.suffix" :label="t('TXT_CODE_85770d4a')" :placeholder="t('TXT_CODE_6e3da823')" /></VCol>
    </VRow>
  </VForm>
</template>
