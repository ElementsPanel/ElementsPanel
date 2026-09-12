<script setup lang="ts">
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VIcon } from "vuetify/components";

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
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_docker_version_select_title") }}</VCardTitle>
      <VCardText>
    <p class="desc text-body-2 text-medium-emphasis">
      {{ t("TXT_CODE_docker_version_select_desc") }}
    </p>
    <div class="cards">
      <VCard class="choose-card docker-card" hoverable @click="selectDockerVersion">
        <VCardTitle>
          <div class="card-title">
            <VIcon icon="mdi-docker" />
            <span>{{ t("TXT_CODE_docker_version_select_docker_title") }}</span>
          </div>
        </VCardTitle>
        <VCardText class="text-medium-emphasis">
          {{ t("TXT_CODE_docker_version_select_docker_subtitle") }}
        </VCardText>
        <div class="card-action">
          <VBtn color="primary">
            {{ t("TXT_CODE_docker_version_select_docker_btn") }}
          </VBtn>
        </div>
      </VCard>

      <VCard class="choose-card normal-card" hoverable @click="selectNormalVersion">
        <VCardTitle>
          <div class="card-title">
            <VIcon icon="mdi-apps" />
            <span>{{ t("TXT_CODE_docker_version_select_normal_title") }}</span>
          </div>
        </VCardTitle>
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

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-action {
  margin-top: 16px;
  text-align: right;
}

.docker-card {
  // border-color: var(--color-primary, #1677ff);
}
</style>
