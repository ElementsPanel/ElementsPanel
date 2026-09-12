<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import { t } from "@/lang/i18n";
import { VCol, VContainer, VRow } from "vuetify/components";
import UserInstanceList from "../widgets/UserInstanceList.vue";
import UserStatusBlock from "../widgets/UserStatusBlock.vue";

const statusTypes = [
  "instance_all",
  "instance_running",
  "instance_stop",
  "instance_error"
];
</script>

<template>
  <main class="customer-page">
    <VContainer fluid class="customer-page-container">
      <PageToolbar :title="t('TXT_CODE_ec299306')" icon="mdi-account-outline" />
      <VRow dense class="customer-page-row">
        <VCol v-for="type in statusTypes" :key="type" cols="12" sm="6" lg="3">
          <UserStatusBlock :type="type" />
        </VCol>
        <VCol cols="12">
          <UserInstanceList :title="t('TXT_CODE_d655beec')" />
        </VCol>
      </VRow>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.customer-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.customer-page-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.customer-page-row {
  width: 100%;
  margin: 0;
}

@media (max-width: 992px) {
  .customer-page-container {
    padding: 16px 12px 28px;
  }
}
</style>
