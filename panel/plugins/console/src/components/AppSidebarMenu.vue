<script setup lang="ts">
import {
  useHeaderMenus,
  type SidebarAppDropdownEntry,
  type SidebarEntry
} from "@/hooks/useHeaderMenus";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useRoute } from "vue-router";
import {
  VDivider,
  VList,
  VListItem,
  VMenu,
  VSheet
} from "vuetify/lib/components/index.mjs";

const route = useRoute();
const { sidebarItems, handleToPage } = useHeaderMenus();
const { logoImage } = useAppConfigStore();

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

const getRouteIcon = (entry: Extract<SidebarEntry, { type: "route" }>): string =>
  routePathIcons[entry.path] || getMdiIcon(entry.icon);

const getItemKey = (entry: SidebarEntry, index: number): string => {
  if (entry.type === "divider") return "sidebar-divider";
  if (entry.type === "route") return entry.path;
  return `app-${index}-${entry.title}`;
};

const onAppDropdownClick = (item: SidebarAppDropdownEntry, key: string | number) => {
  item.click(String(key));
};
</script>

<template>
  <VSheet tag="aside" class="left-sidebar" elevation="0" rounded="0">
    <a href="." class="logo" aria-label="ElementsPanel">
      <img :src="logoImage" alt="ElementsPanel" />
    </a>

    <VList class="sidebar-menu" density="comfortable" nav>
      <template v-for="(entry, index) in sidebarItems" :key="getItemKey(entry, index)">
        <VDivider v-if="entry.type === 'divider'" class="sidebar-divider" />

        <VListItem v-else-if="entry.type === 'route'" class="sidebar-item" :class="entry.customClass"
          :active="isRouteActive(entry.path)" active-color="primary" rounded="xl" :title="String(entry.name ?? '')"
          :prepend-icon="getRouteIcon(entry)" @click="handleToPage(entry.path)" />

        <VMenu v-else-if="entry.type === 'app-dropdown'" location="end" :offset="8">
          <template #activator="{ props: menuProps }">
            <VListItem v-bind="menuProps" class="sidebar-item" :class="entry.customClass" rounded="xl"
              :title="entry.title" :prepend-icon="entry.mdiIcon || getMdiIcon(entry.icon)"
              append-icon="mdi-chevron-right" />
          </template>
          <VList class="sidebar-submenu" density="comfortable" nav>
            <VListItem v-for="menuItem in entry.menus" :key="String(menuItem.value)" rounded="xl"
              :title="menuItem.title" @click="onAppDropdownClick(entry, menuItem.value)" />
          </VList>
        </VMenu>

        <VListItem v-else-if="entry.type === 'app'" class="sidebar-item" :class="entry.customClass" rounded="xl"
          :title="entry.title" :prepend-icon="entry.mdiIcon || getMdiIcon(entry.icon)" @click="entry.click()" />
      </template>
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
  text-align: left;
  background-color: var(--app-header-bg);
  color: var(--app-header-text-color);
  backdrop-filter: saturate(180%) blur(20px);
  padding: 20px 0;
}

.logo {
  display: block;
  padding-top: 10px;
  padding-bottom: 18px;
  text-align: center;

  img {
    height: 20px;
  }
}

.sidebar-menu {
  flex: 1;
  width: calc(100%);
  max-width: none !important;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 20px;
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

.sidebar-divider {
  margin: 12px 0;
  opacity: 0.18;
}

.sidebar-submenu {
  min-width: 180px;
  padding: 8px;
  border-radius: 16px;
  background: var(--app-header-bg);
  color: var(--app-header-text-color);
}
</style>
