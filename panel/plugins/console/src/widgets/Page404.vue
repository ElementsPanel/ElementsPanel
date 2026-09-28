<script setup lang="ts">
import { t } from "@/lang/i18n";
import { VIcon } from "vuetify/components";
</script>

<template>
  <main class="page-404">
    <VIcon icon="mdi-alert-circle-outline" size="70" />
    <h2 class="mt-24">
      {{ t("TXT_CODE_fd63a181") }}
    </h2>
  </main>
</template>

<style lang="scss" scoped>
.page-404 {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 60vh;
  color: var(--text-color);
  text-align: center;
}
</style>
