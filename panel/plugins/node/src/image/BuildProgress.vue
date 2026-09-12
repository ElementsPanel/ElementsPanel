<script setup lang="ts">
import { ref, computed } from "vue";
import { t } from "@/lang/i18n";
import { useScreen } from "@/hooks/useScreen";
import { reportErrorMsg } from "@/tools/validator";
import { buildProgress } from "@/services/apis/envImage";
import Loading from "@/components/Loading.vue";
import CardPanel from "@/components/CardPanel.vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCol, VDialog, VProgressLinear, VRow } from "vuetify/components";
const props = defineProps<{
  daemonId: string;
}>();

const screen = useScreen();
const isPhone = computed(() => screen.isPhone.value);
const open = ref(false);
const openDialog = async () => {
  open.value = true;
  await getProgress();
};

const progressList = ref<{ name: string; status: number }[]>([]);
const statusType: { [propsName: string]: string } = {
  "-1": t("TXT_CODE_20ce2aae"),
  "1": t("TXT_CODE_978da1c1"),
  "2": t("TXT_CODE_47e182a5")
};

const { execute, state, isLoading } = buildProgress();
const getProgress = async () => {
  progressList.value = [];
  try {
    await execute({
      params: {
        daemonId: props.daemonId
      }
    });
    if (state.value) {
      for (const k in state.value) {
        progressList.value.push({
          name: k,
          status: state.value[k]
        });
      }
    }
  } catch (err: any) {
    console.error(err);
    return reportErrorMsg(err.message);
  }
};

defineExpose({
  openDialog
});
</script>

<template>
  <VDialog v-model="open" max-width="900" persistent>
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_4bbd3fde") }}</VCardTitle>
      <VCardText>
    <VRow v-if="!isLoading" dense>
      <VCol v-for="i in progressList" :key="i.name + i.status" cols="12" lg="6" md="8" sm="12">
        <CardPanel>
          <template #title>{{ i.name }}</template>
          <template #body>
            <span>
              {{ statusType[i.status.toString()] }}
            </span>
          </template>
        </CardPanel>
      </VCol>
    </VRow>
    <VRow v-else>
      <VCol cols="12">
        <Loading />
      </VCol>
    </VRow>
      </VCardText>
      <VCardActions><VBtn :loading="isLoading" variant="tonal" @click="getProgress">{{ t("TXT_CODE_b76d94e0") }}</VBtn><VBtn color="primary" @click="open = false">{{ t("TXT_CODE_b1dedda3") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
