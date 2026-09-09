<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCheckbox, VDialog, VSpacer } from "vuetify/components";

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
  reject(new Error(t("TXT_CODE_1b7a8832")));
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
  <VDialog
    v-model="open"
    class="app-dialog warning-dialog"
    max-width="600"
    persistent
    scrollable
  >
    <VCard rounded="xl">
      <VCardTitle class="warning-dialog__title">{{ props.title }}</VCardTitle>
      <VCardText class="warning-dialog__body">
        <pre class="warning-dialog__message">{{ props.subTitle }}</pre>
        <VCheckbox v-model="checkbox" :label="props.checkText" hide-details density="comfortable" />
      </VCardText>
      <VCardActions class="warning-dialog__actions">
        <VSpacer />
        <VBtn color="error" variant="text" rounded="xl" :disabled="!checkbox" @click="confirm">
          {{ t("TXT_CODE_d507abff") }}
        </VBtn>
        <VBtn variant="text" rounded="xl" @click="cancel">
          {{ t("TXT_CODE_a0451c97") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.warning-dialog__title {
  padding: 20px 24px 8px;
  text-align: center;
}

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

.warning-dialog__actions {
  padding: 8px 16px 16px;
}
</style>
