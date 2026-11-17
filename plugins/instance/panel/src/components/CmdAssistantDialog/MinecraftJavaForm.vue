<script lang="ts" setup>
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
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
    <VTextField v-model="form.jarName" :label="t('TXT_CODE_COMMON_SERVER_SOFTWARE_FILENAME')" :placeholder="t('TXT_CODE_COMMON_USUALLY_A_JAR_FILE_LIKE_PAPER_JAR_ETC')" :rules="[(value) => String(value || '').trim() ? true : t('TXT_CODE_COMMON_SERVER_SOFTWARE_FILENAME')]" />
    <VRow>
      <VCol cols="12" sm="6"><VTextField v-model="form.maxMemory" :label="t('TXT_CODE_COMMON_MAXIMUM_MEMORY')" :placeholder="t('TXT_CODE_COMMON_OPTIONAL_XMX_PARAMETER_LIKE_1024_M')" /></VCol>
      <VCol cols="12" sm="6"><VTextField v-model="form.minMemory" :label="t('TXT_CODE_COMMON_INITIAL_MEMORY')" :placeholder="t('TXT_CODE_COMMON_OPTIONAL_XMS_PARAMETER_LIKE_1024_M')" /></VCol>
      <VCol cols="12"><VTextField v-model="form.javaPath" :label="t('TXT_CODE_COMMON_JAVA_PATH')" :placeholder="t('TXT_CODE_COMMAND_JAVA_EXECUTABLE_PATH_HINT')" /></VCol>
      <VCol cols="12"><VTextField v-model="form.additional" :label="t('TXT_CODE_COMMAND_JAVA_EXTRA_ARGS')" :placeholder="t('TXT_CODE_COMMON_OPTIONAL_PARAMETERS_BEFORE_JAR')" /></VCol>
      <VCol cols="12"><VTextField v-model="form.suffix" :label="t('TXT_CODE_COMMON_SUFFIX_PARAMETERS')" :placeholder="t('TXT_CODE_COMMAND_JAVA_EXTRA_ARGS_HINT')" /></VCol>
    </VRow>
  </VForm>
</template>
