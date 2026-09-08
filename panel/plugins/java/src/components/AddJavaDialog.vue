<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import { t } from "@/lang/i18n";
import type { AddJavaConfigItem } from "../types";
import { ref } from "vue";
import { VForm, VTextField } from "vuetify/lib/components/index.mjs";

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
    :title="t('TXT_CODE_8900e7ee')"
    compact
    :closable="false"
    @ok="submit"
    @cancel="cancel"
  >
    <VForm @submit.prevent="submit">
      <VTextField
        v-model="form.name"
        :label="t('TXT_CODE_3f36206f')"
        :placeholder="t('TXT_CODE_4ea93630')"
        class="mb-4"
      />
      <VTextField
        v-model="form.path"
        :label="t('TXT_CODE_43422ed3')"
        :placeholder="t('TXT_CODE_4ea93630')"
      />
    </VForm>
  </AppDialog>
</template>
