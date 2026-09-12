<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lang/i18n";
import { useLayoutConfigStore } from "@/stores/useLayoutConfig";
import LayoutContainer from "@/views/LayoutContainer.vue";
import { createModPageLayout } from "../layout";
import ModManager from "./ModManager.vue";

const { globalLayoutConfig } = useLayoutConfigStore();
const fallback = computed(() => createModPageLayout(t("TXT_CODE_MOD_MANAGER")));
const hasLayout = computed(() =>
  globalLayoutConfig.value.some((page) => page.page === fallback.value.page)
);
</script>

<template>
  <LayoutContainer v-if="hasLayout" />
  <!-- A plugin enabled after login may not yet be in the cached server layout. -->
  <ModManager v-else :card="fallback.items[0]" />
</template>
