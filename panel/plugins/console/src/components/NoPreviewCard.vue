<script lang="ts" setup>
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "../types/index";

defineProps<{
  card: LayoutCard;
}>();
</script>

<template>
  <CardPanel>
    <template #title>{{ card.title }}</template>
    <template #body>
      <div class="flex justify-center align-center h-100">
        <p style="max-width: 320px; margin: auto; text-align: center">
          <VIcon icon="mdi-alert-circle-outline" />
          {{ t("TXT_CODE_5ec10cc8") }}
        </p>
      </div>
    </template>
  </CardPanel>
</template>
