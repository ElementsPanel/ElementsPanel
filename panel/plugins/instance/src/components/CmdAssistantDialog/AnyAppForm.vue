<script lang="ts" setup>
import { ref } from "vue";
import { t } from "@/lang/i18n";
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
    <VTextField v-model="form.softwarePath" :label="t('TXT_CODE_c7b1b8d0')" :placeholder="t('TXT_CODE_a2a0e054')" :rules="[(value) => String(value || '').trim() ? true : t('TXT_CODE_c7b1b8d0')]" />
    <VTextField v-model="form.params" :label="t('TXT_CODE_b9442311')" :placeholder="t('TXT_CODE_2a379a13')">
      <template #details>
        <span class="text-caption text-medium-emphasis">
          {{ t("TXT_CODE_d705a2bd") }}
        </span>
      </template>
    </VTextField>
  </VForm>
</template>
