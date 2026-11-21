<script setup lang="ts">
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { usePluginService } from "@elements-panel/sdk";
import { computed } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VContainer } from "vuetify/components";
import UserInstanceList from "../widgets/UserInstanceList.vue";

const instanceAvailable = computed(() => !!usePluginService("instance"));
</script>

<template>
  <main class="customer-page">
    <VContainer fluid class="customer-page-container">
      <UserInstanceList v-if="instanceAvailable" :title="t('TXT_CODE_COMMON_MY_APPLICATION')" />
      <template v-else>
        <PageToolbar :title="t('TXT_CODE_COMMON_MY_APPLICATION')" icon="mdi-account-outline" />
        <Empty />
      </template>
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

@media (max-width: 992px) {
  .customer-page-container {
    padding: 16px 12px 28px;
  }
}
</style>
