<script setup lang="ts">
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
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
    <VCard :title="t('TXT_CODE_docker_version_select_title')">
      <VCardText>
    <p class="desc text-body-medium text-medium-emphasis">
      {{ t("TXT_CODE_docker_version_select_desc") }}
    </p>
    <div class="cards">
      <VCard :title="t('TXT_CODE_docker_version_select_docker_title')" prepend-icon="mdi-docker"
        class="choose-card docker-card" hoverable @click="selectDockerVersion">
        <VCardText class="text-medium-emphasis">
          {{ t("TXT_CODE_docker_version_select_docker_subtitle") }}
        </VCardText>
        <div class="card-action">
          <VBtn color="primary">
            {{ t("TXT_CODE_docker_version_select_docker_btn") }}
          </VBtn>
        </div>
      </VCard>

      <VCard :title="t('TXT_CODE_docker_version_select_normal_title')" prepend-icon="mdi-apps"
        class="choose-card normal-card" hoverable @click="selectNormalVersion">
        <VCardText class="text-medium-emphasis">
          {{ t("TXT_CODE_docker_version_select_normal_subtitle") }}
        </VCardText>
        <div class="card-action">
          <VBtn variant="tonal">
            {{ t("TXT_CODE_docker_version_select_normal_btn") }}
          </VBtn>
        </div>
      </VCard>
    </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.desc {
  margin-bottom: 16px;
}

.cards {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.choose-card {
  flex: 1;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.choose-card:hover {
  transform: translateY(-2px);
}

.card-action {
  margin-top: 16px;
  text-align: right;
}

.docker-card {
  // border-color: var(--color-primary, #1677ff);
}
</style>
