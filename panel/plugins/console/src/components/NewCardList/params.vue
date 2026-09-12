<script setup lang="ts">
import type { LayoutCard } from "@/types/index";
import { ref } from "vue";
import type { MapData } from "@/types/index";
import { $t as t } from "@/lang/i18n";
import { useSelectInstances } from "@/components/fc";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCol, VDialog, VForm, VIcon, VRow, VSpacer, VTextField } from "vuetify/components";

const open = ref(false);
const card = ref<LayoutCard>();
let resolveFn: (value: unknown) => void;

const formData = ref<MapData<string>>({});
const formRef = ref<InstanceType<typeof VForm>>();

const openInstanceSelectDialog = async () => {
  try {
    const selectedInstances = await useSelectInstances();
    if (selectedInstances && selectedInstances.length > 0) {
      formData.value.instanceId = selectedInstances[0].instanceUuid;
      formData.value.daemonId = selectedInstances[0].daemonId;
    }
  } catch (err: any) {
    console.error(err);
  }
};

const onClose = () => {
  open.value = false;
  resolveFn(false);
};
const openDialog = (cardInfo: LayoutCard) => {
  formData.value = {};
  open.value = true;
  if (!cardInfo.meta) cardInfo.meta = {};
  card.value = cardInfo;
  return new Promise((resolve) => {
    resolveFn = resolve;
  });
};

const onSubmit = async () => {
  const result = await formRef.value?.validate();
  if (result && !result.valid) return;
  if (card.value) card.value.meta = formData.value;

  open.value = false;
  resolveFn(true);
};

defineExpose({
  openDialog
});
</script>

<template>
  <VDialog v-model="open" class="global-text-color" location="bottom" max-width="900" scrollable>
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_e4c84088") }}</VCardTitle>
      <VCardText v-if="card && card.meta">
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VRow>
            <VCol v-for="item in card.params" :key="item.field" cols="12" md="6">
              <VTextField v-if="item.type === 'string'" v-model="formData[item.field]" :label="item.label" :rules="[(value) => String(value ?? '').trim() ? true : t('TXT_CODE_cb08d342')]" />
              <div v-else-if="item.type === 'instance'" class="d-flex flex-column ga-2">
                <div class="text-body-2 text-medium-emphasis">{{ item.label }}</div>
                <VBtn color="primary" variant="tonal" @click="openInstanceSelectDialog">
                  <VIcon start icon="mdi-server-outline" />
                  {{ t("TXT_CODE_2c9083a1") }}
                </VBtn>
              </div>
            </VCol>
          </VRow>
        </VForm>
        <p><VIcon icon="mdi-lightbulb-outline" class="mr-1" />{{ t("TXT_CODE_e29b79df") }}</p>
        <p>{{ t("TXT_CODE_13663120") }}</p>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="onClose">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" @click="onSubmit">{{ t("TXT_CODE_d507abff") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
