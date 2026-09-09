<script setup lang="ts">
import {
  useHeaderMenus,
  type SidebarRouteEntry
} from "@/hooks/useHeaderMenus";
import { useRoute } from "vue-router";
import {
  VList,
  VListItem,
  VSheet
} from "vuetify/components";

const route = useRoute();
const { sidebarItems, handleToPage } = useHeaderMenus();

const isRouteActive = (path: string): boolean => {
  if (route.path === path) return true;
  if (path === "/") return false;
  return route.path.startsWith(path + "/");
};

const routePathIcons: Record<string, string> = {
  "/instances": "mdi-view-grid-outline",
  "/users": "mdi-account-group-outline",
  "/customer": "mdi-account-outline",
  "/login": "mdi-login",
  "/plugins/config": "mdi-view-grid-plus",
  "/overview": "mdi-monitor-dashboard",
  "/node": "mdi-server-network-outline",
  "/market": "mdi-storefront-outline"
};

const mdiIconMap: Record<string, string> = {
  AppstoreAddOutlined: "mdi-view-grid-plus",
  AreaChartOutlined: "mdi-chart-areaspline",
  BgColorsOutlined: "mdi-palette-outline",
  BuildOutlined: "mdi-hammer-wrench",
  CloudDownloadOutlined: "mdi-cloud-download-outline",
  CloudUploadOutlined: "mdi-cloud-upload-outline",
  ClusterOutlined: "mdi-server-network-outline",
  CodeOutlined: "mdi-code-tags",
  CloseCircleOutlined: "mdi-close-circle-outline",
  DesktopOutlined: "mdi-monitor",
  DashboardOutlined: "mdi-view-dashboard-outline",
  FileExcelOutlined: "mdi-file-excel-outline",
  FileTextOutlined: "mdi-file-document-outline",
  FileZipOutlined: "mdi-folder-zip-outline",
  FolderOpenOutlined: "mdi-folder-open-outline",
  GithubFilled: "mdi-github",
  HomeOutlined: "mdi-home-outline",
  InteractionOutlined: "mdi-gesture-tap-button",
  LinkOutlined: "mdi-link-variant",
  LogoutOutlined: "mdi-logout",
  MenuOutlined: "mdi-menu",
  NodeIndexOutlined: "mdi-source-branch",
  RedoOutlined: "mdi-restore",
  SaveOutlined: "mdi-content-save-outline",
  ShopOutlined: "mdi-storefront-outline",
  ShoppingCartOutlined: "mdi-cart-outline",
  TeamOutlined: "mdi-account-group-outline",
  TransactionOutlined: "mdi-swap-horizontal",
  UserOutlined: "mdi-account-outline",
  UsergroupDeleteOutlined: "mdi-account-multiple-minus-outline",
  LoginOutlined: "mdi-login"
};

const getMdiIcon = (icon: unknown, fallback?: string): string => {
  if (typeof icon === "string" && icon.startsWith("mdi-")) return icon;
  const component = icon as
    | {
      name?: string;
      displayName?: string;
      __name?: string;
      type?: { name?: string; __name?: string };
    }
    | undefined;
  const iconName =
    component?.name ??
    component?.displayName ??
    component?.__name ??
    component?.type?.name ??
    component?.type?.__name;
  return (iconName && mdiIconMap[iconName]) || fallback || "mdi-menu";
};

const getRouteIcon = (entry: SidebarRouteEntry): string =>
  routePathIcons[entry.path] || getMdiIcon(entry.icon);
</script>

<template>
  <VSheet tag="aside" class="left-sidebar" elevation="0" rounded="0">
    <VList class="sidebar-menu" density="comfortable" nav>
      <VListItem
        v-for="entry in sidebarItems"
        :key="entry.path"
        class="sidebar-item"
        :class="entry.customClass"
        :active="isRouteActive(entry.path)"
        active-color="primary"
        rounded="xl"
        :title="String(entry.name ?? '')"
        :prepend-icon="getRouteIcon(entry)"
        @click="handleToPage(entry.path)"
      />
    </VList>
  </VSheet>
</template>

<style lang="scss" scoped>
.left-sidebar {
  display: flex;
  flex: 0 0 240px;
  flex-direction: column;
  width: 240px;
  min-width: 240px;
  height: 100%;
  box-sizing: border-box;
  text-align: left;
  background-color: var(--app-header-bg);
  color: var(--app-header-text-color);
  backdrop-filter: saturate(180%) blur(20px);
  padding: 0 0 20px;
}

.sidebar-menu {
  flex: 1;
  min-height: 0;
  width: calc(100%);
  max-width: none !important;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 20px 8px;
  box-sizing: border-box;
  color: var(--app-header-text-color);
  background: transparent;
}

.sidebar-item {
  width: calc(100% + 24px);
  max-width: none !important;
  min-height: 44px;
  margin: 3px 0 3px -20px;
  padding-left: 36px !important;
  color: inherit;
  cursor: pointer;
  border-radius: 0 24px 24px 0 !important;
  background-color: transparent !important;

  :deep(.v-list-item__prepend > .v-icon) {
    margin-inline-end: 12px;
    color: currentColor;
  }

  :deep(.v-list-item-title) {
    font-size: 14px;
  }
}

.sidebar-item :deep(.v-list-item__overlay) {
  background: currentColor;
  opacity: 0;
}

.sidebar-item:hover :deep(.v-list-item__overlay),
.sidebar-item:focus-visible :deep(.v-list-item__overlay) {
  opacity: 0;
}

.sidebar-item.v-list-item--active {
  background-color: rgba(64, 156, 216, 0.16) !important;
  color: inherit;
}

</style>
