<script setup lang="ts">
import {
  useHeaderMenus,
  type SidebarAppDropdownEntry,
  type SidebarEntry
} from "@/hooks/useHeaderMenus";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import {
  AppstoreOutlined,
  LinkOutlined,
  LoginOutlined,
  MenuOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons-vue";
import type { Key } from "ant-design-vue/es/table/interface";
import type { Component } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const { sidebarItems, handleToPage } = useHeaderMenus();
const { logoImage } = useAppConfigStore();

/** Whether route menu item is active (current path equals or is child of this path) */
const isRouteActive = (path: string): boolean => {
  if (route.path === path) return true;
  if (path === "/") return false;
  return route.path.startsWith(path + "/");
};

/** Sidebar icon for each route path */
const routePathIcons: Record<string, Component> = {
  "/instances": AppstoreOutlined,
  "/users": TeamOutlined,
  "/customer": UserOutlined,
  "/login": LoginOutlined,
  "/_open_page": LinkOutlined
};

const getRouteIcon = (
  entry: Extract<SidebarEntry, { type: "route" }>
): Component | string => {
  return entry.icon ?? routePathIcons[entry.path] ?? MenuOutlined;
};

const getItemKey = (entry: SidebarEntry, index: number): string => {
  if (entry.type === "divider") return "sidebar-divider";
  if (entry.type === "route") return entry.path;
  return `app-${index}-${entry.title}`;
};

const onAppDropdownClick = (item: SidebarAppDropdownEntry, info: { key: Key }) => {
  item.click(String(info.key));
};
</script>

<template>
  <aside class="left-sidebar">
    <a href="." class="logo">
      <img :src="logoImage" />
    </a>
    <nav class="sidebar-menu">
      <template v-for="(entry, index) in sidebarItems" :key="getItemKey(entry, index)">
        <!-- Divider -->
        <div v-if="entry.type === 'divider'" class="sidebar-divider" />

        <!-- Route link -->
        <a v-else-if="entry.type === 'route'" class="sidebar-item"
          :class="[entry.customClass, { 'sidebar-item-active': isRouteActive(entry.path) }]"
          @click.prevent="handleToPage(entry.path)">
          <component :is="getRouteIcon(entry)" class="sidebar-item-icon" />
          <span class="sidebar-item-text">{{ entry.name }}</span>
        </a>

        <!-- App menu (dropdown) -->
        <a-dropdown v-else-if="entry.type === 'app-dropdown'" trigger="click" placement="topRight">
          <a class="sidebar-item" @click.prevent>
            <component :is="entry.icon" v-if="entry.icon" class="sidebar-item-icon" />
            <span class="sidebar-item-text">{{ entry.title }}</span>
          </a>
          <template #overlay>
            <a-menu @click="onAppDropdownClick(entry, $event)">
              <a-menu-item v-for="m in entry.menus" :key="String(m.value)">
                {{ m.title }}
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>

        <!-- App menu (single click) -->
        <a v-else-if="entry.type === 'app'" class="sidebar-item" :class="entry.customClass"
          @click.prevent="entry.click()">
          <component :is="entry.icon" v-if="entry.icon" class="sidebar-item-icon" />
          <span class="sidebar-item-text">{{ entry.title }}</span>
        </a>
      </template>
    </nav>
  </aside>
</template>

<style lang="scss" scoped>
.logo {
  display: block;
  text-align: center;
  padding-top: 10px;
  padding-bottom: 18px;

  img {
    height: 20px;
  }
}

.left-sidebar:hover {
  width: 246px;
}

.left-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 240px;
  text-align: left;
  background-color: var(--app-header-bg);
  backdrop-filter: saturate(180%) blur(20px);
  padding: 20px 12px;
  transition: all 0.3s ease;
}

.sidebar-menu {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px;
  color: var(--app-header-text-color);
  flex: 1;
  gap: 8px;
  width: 100%;
  overflow-y: auto;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 32px 12px 20px;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.4s ease;
  width: 100%;

  &:hover {
    background-color: rgba(128, 128, 128, 0.15);
  }

  &.sidebar-item-active {
    background-color: rgba(128, 128, 128, 0.22);
  }

  .sidebar-item-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .sidebar-item-text {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.sidebar-divider {
  height: 1px;
  background-color: rgba(128, 128, 128, 0.18);
  margin: 12px 0;
  flex-shrink: 0;
  width: 100%;
}

/* Same semantic highlight as AppHeader */
:deep(.nav-button-warning:hover) {
  background-color: rgba(255, 193, 7, 0.2) !important;
}

:deep(.nav-button-success:hover) {
  background-color: rgba(64, 156, 216, 0.15) !important;
}

:deep(.nav-button-danger:hover) {
  background-color: rgba(255, 25, 17, 0.25) !important;
}
</style>
