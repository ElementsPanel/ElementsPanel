<script setup lang="ts">
import { useDialog } from "@elementspanel/epanel-plugin-console/hooks/useDialog";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VBtn, VCard, VCardText, VDialog } from "vuetify/components";

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: number): void;
}

const props = defineProps<Props>();
const { isVisible, openDialog, submit } = useDialog<number>(props);

const selectNormalVersion = () => {
  submit(1);
};

const selectDockerVersion = () => {
  submit(2);
};

defineExpose({
  openDialog
});
</script>

<template>
  <VDialog v-model="isVisible" max-width="860" persistent>
    <VCard :title="t('TXT_CODE_DOCKER_VERSION_SELECT_TITLE')">
      <VCardText>
    <div class="cards">
      <VCard :title="t('TXT_CODE_DOCKER_VERSION_SELECT_DOCKER_TITLE')" prepend-icon="mdi-docker"
        class="choose-card docker-card" hoverable @click="selectDockerVersion">
        <VCardText class="text-medium-emphasis">
          {{ t("TXT_CODE_DOCKER_VERSION_SELECT_DOCKER_SUBTITLE") }}
        </VCardText>
        <div class="card-action">
          <VBtn color="primary">
            {{ t("TXT_CODE_DOCKER_VERSION_SELECT_DOCKER_BTN") }}
          </VBtn>
        </div>
      </VCard>

      <VCard :title="t('TXT_CODE_DOCKER_VERSION_SELECT_NORMAL_TITLE')" prepend-icon="mdi-apps"
        class="choose-card normal-card" hoverable @click="selectNormalVersion">
        <VCardText class="text-medium-emphasis">
          {{ t("TXT_CODE_DOCKER_VERSION_SELECT_NORMAL_SUBTITLE") }}
        </VCardText>
        <div class="card-action">
          <VBtn variant="tonal">
            {{ t("TXT_CODE_DOCKER_VERSION_SELECT_NORMAL_BTN") }}
          </VBtn>
        </div>
      </VCard>
    </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.cards {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.choose-card {
  flex: 1;
  transition: all 0.2s ease;
}

.choose-card:hover {
  transform: translateY(-2px);
}

.card-action {
  margin-top: 16px;
  text-align: right;
}

</style>
