<script lang="ts" setup>
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VForm, VTextField } from "vuetify/components";

interface FormDataType {
  softwarePath: string;
  params: string;
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
    <VTextField v-model="form.softwarePath" :label="t('TXT_CODE_COMMON_PROGRAM')" :placeholder="t('TXT_CODE_COMMON_FOR_EXAMPLE_SERVER_EXE_APP_EXE_OR_USE_AN_ABSOLUTE_PATH_ETC')" :rules="[(value) => String(value || '').trim() ? true : t('TXT_CODE_COMMON_PROGRAM')]" />
    <VTextField v-model="form.params" :label="t('TXT_CODE_COMMAND_EXTRA_ARGS')" :placeholder="t('TXT_CODE_COMMON_OPTIONAL_FILL_IN_ACCORDING_TO_YOUR_PROGRAM_SUCH_AS_SERVER_XXX_ZZZ_ETC')">
      <template #details>
        <span class="text-body-small text-medium-emphasis">
          {{ t("TXT_CODE_COMMON_ADDITIONAL_PARAMETERS_WILL_BE_APPENDED_TO_THE_END_OF_THE_SOFTWARE_PATH") }}
        </span>
      </template>
    </VTextField>
  </VForm>
</template>
