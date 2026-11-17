<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VCard, VCardText, VDialog, VProgressLinear } from "vuetify/components";
import { applyingChanges, changingDependencies } from "../operations";
</script>

<template>
  <VDialog
    :model-value="applyingChanges || changingDependencies > 0"
    :aria-label="t('TXT_CODE_PLUGIN_MARKET_UPDATING_DEPENDENCIES')"
    max-width="480"
    persistent
    no-click-animation
  >
    <VCard :title="t('TXT_CODE_PLUGIN_MARKET_UPDATING_DEPENDENCIES')">
      <VCardText class="d-flex flex-column align-center ga-4 pa-6">
        <VProgressLinear
          indeterminate
          color="primary"
          :height="6"
          rounded
          :aria-label="t('TXT_CODE_PLUGIN_MARKET_UPDATING_DEPENDENCIES')"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>
