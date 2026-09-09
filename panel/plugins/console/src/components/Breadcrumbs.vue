<script setup lang="ts">
import type { RouterMetaInfo } from "@/config/router";
import { useAppRouters } from "@/hooks/useAppRouters";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { VBreadcrumbs } from "vuetify/components";

export interface BreadcrumbItem {
  title: string;
  disabled: boolean;
  href: string;
}

const route = useRoute();
const { getRouteParamsUrl } = useAppRouters();
const { state: appState } = useAppStateStore();

const items = computed<BreadcrumbItem[]>(() => {
  const arr: BreadcrumbItem[] = [
    {
      title: t("TXT_CODE_f5b9d58f"),
      disabled: false,
      href: "."
    }
  ];

  const queryUrl = getRouteParamsUrl();

  if (route.meta.breadcrumbs instanceof Array) {
    const meta = route.meta as RouterMetaInfo;
    meta.breadcrumbs?.forEach((v) => {
      const params = queryUrl && !v.mainMenu ? `?${queryUrl}` : "";
      if ((appState.userInfo?.permission || 0) < v.permission) return;
      arr.push({
        title: v.name,
        disabled: false,
        href: `./#${v.path}${params}`
      });
    });
  }

  arr.push({
    title: String(route.name),
    disabled: true,
    href: `./#${route.fullPath}`
  });

  return arr;
});
</script>

<template>
  <div class="breadcrumbs">
    <VBreadcrumbs
      class="breadcrumbs-list"
      density="comfortable"
      :items="items"
      divider=">"
    />
  </div>
</template>

<style lang="scss" scoped>
.breadcrumbs {
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0px;
  color: var(--text-color);
}

.breadcrumbs-list {
  padding: 0;
  font-size: inherit;

  :deep(.v-breadcrumbs-item--link),
  :deep(.v-breadcrumbs-item--disabled) {
    color: var(--text-color);
    font-size: inherit;
  }

  :deep(.v-breadcrumbs-divider) {
    padding: 0 6px;
    color: var(--color-gray-7);
  }
}

</style>
