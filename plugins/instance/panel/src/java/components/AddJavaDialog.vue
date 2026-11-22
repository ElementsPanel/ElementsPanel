<script setup lang="ts">
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { AddJavaConfigItem } from "../types";
import { ref } from "vue";
import { VForm, VTextField } from "vuetify/components";

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: AddJavaConfigItem): void;
}
const props = defineProps<Props>();
const open = ref(true);
const form = ref<AddJavaConfigItem>({ name: "", path: "" });
const cancel = () => {
  open.value = false;
  props.destroyComponent?.();
};
const submit = () => {
  props.emitResult(form.value);
  cancel();
};
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="t('TXT_CODE_COMMON_ADD_INSTALLED_JAVA')"
    compact
    :closable="false"
    @ok="submit"
    @cancel="cancel"
  >
    <VForm @submit.prevent="submit">
      <VTextField
        v-model="form.name"
        :label="t('TXT_CODE_COMMON_JAVA_NAME')"
        :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
        class="app-mb-4"
      />
      <VTextField
        v-model="form.path"
        :label="t('TXT_CODE_COMMON_JAVA_PATH')"
        :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
      />
    </VForm>
  </AppDialog>
</template>
