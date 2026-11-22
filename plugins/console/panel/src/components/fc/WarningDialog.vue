<script setup lang="ts">
import { ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VDialog,
  VSpacer
} from "vuetify/components";

interface Props {
  title: string;
  subTitle: string;
  checkText: string;
  destroyComponent?: (delay?: number) => void;
}

const props = defineProps<Props>();
const open = ref(false);
const checkbox = ref(false);
let resolve: Function;
let reject: Function;

const openDialog = () => {
  open.value = true;
  return new Promise<void>((y, n) => {
    resolve = y;
    reject = n;
  });
};

const cancel = () => {
  open.value = false;
  reject(new Error(t("TXT_CODE_COMMON_OPERATION_CANCELED")));
  if (props.destroyComponent) props.destroyComponent();
};

const confirm = () => {
  open.value = false;
  resolve();
  if (props.destroyComponent) props.destroyComponent();
};

defineExpose({
  cancel,
  confirm,
  openDialog
});
</script>

<template>
  <VDialog v-model="open" class="app-dialog warning-dialog" max-width="600" persistent scrollable>
    <VCard :title="props.title" rounded="xl">
      <VCardText class="warning-dialog__body">
        <pre class="warning-dialog__message">{{ props.subTitle }}</pre>
        <VCheckbox v-model="checkbox" :label="props.checkText" hide-details density="comfortable" />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn color="error" variant="text" rounded="xl" :disabled="!checkbox" @click="confirm">
          {{ t("TXT_CODE_COMMON_CONFIRM") }}
        </VBtn>
        <VBtn variant="text" rounded="xl" @click="cancel">
          {{ t("TXT_CODE_COMMON_CANCEL") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.warning-dialog__body {
  padding: 8px 24px 12px;
  text-align: center;
}

.warning-dialog__message {
  margin: 0 auto 16px;
  max-width: 100%;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
