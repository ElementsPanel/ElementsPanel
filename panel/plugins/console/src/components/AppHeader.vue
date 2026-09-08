<script setup lang="ts">
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { useScreen } from "@/hooks/useScreen";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import {
  VBtn,
  VDialog,
  VList,
  VListItem,
  VMenu,
  VIcon,
  VToolbar,
  VTooltip
} from "vuetify/lib/components/index.mjs";
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const { containerState } = useLayoutContainerStore();
const { isSidebarOpen, logoImage, toggleSidebar, useSidebarLayout } = useAppConfigStore();

const { menus, appMenus, handleToPage } = useHeaderMenus();
const desktopAppMenus = computed(() => appMenus.value.filter((item) => !item.onlyHeader));

const getMdiIcon = (explicitIcon?: string) => {
  return explicitIcon || "mdi-help-circle-outline";
};

const getFallbackMdiIcon = (icon: unknown) => {
  if (typeof icon === "string" && icon.startsWith("mdi-")) return icon;
  return "mdi-help-circle-outline";
};

/** Whether route menu item is active (current path equals or is child of this path) */
const isRouteActive = (path: string): boolean => {
  if (route.path === path) return true;
  if (path === "/") return false;
  return route.path.startsWith(path + "/");
};

const { isPhone } = useScreen();

const openPhoneMenu = (b = false) => {
  containerState.showPhoneMenu = b;
};
</script>

<template>
  <VToolbar
    v-if="!isPhone"
    tag="header"
    class="app-header-wrapper"
    color="transparent"
    flat
    elevation="0"
    height="64"
  >
    <div class="app-header-content">
      <div
        class="header-leading"
        :class="{ 'header-leading--sidebar-open': isSidebarOpen }"
      >
        <VBtn
          v-if="useSidebarLayout"
          class="sidebar-toggle-button"
          icon
          variant="text"
          aria-label="MENU"
          aria-controls="app-sidebar"
          :aria-expanded="isSidebarOpen"
          @click="toggleSidebar"
        >
          <VIcon :icon="isSidebarOpen ? 'mdi-menu-open' : 'mdi-menu'" />
        </VBtn>
        <a href="." class="header-logo" aria-label="ElementsPanel">
          <img :src="logoImage" alt="ElementsPanel" />
        </a>
      </div>
      <div class="btns header-actions">
        <div v-for="(item, index) in desktopAppMenus as any" :key="index">
          <VMenu v-if="item.menus && item.conditions" location="bottom" :offset="6">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                :class="[item.customClass, 'nav-button', 'right-nav-button']"
                icon
                variant="text"
                :aria-label="item.title"
              >
                <VIcon :icon="getMdiIcon(item.mdiIcon || getFallbackMdiIcon(item.icon))" />
              </VBtn>
            </template>
            <VList density="compact">
              <VListItem
                v-for="menuItem in item.menus"
                :key="menuItem.value"
                :title="menuItem.title"
                @click="item.click(String(menuItem.value))"
              />
            </VList>
          </VMenu>
          <VTooltip v-else-if="item.conditions" location="bottom">
            <template #activator="{ props: tooltipProps }">
              <VBtn
                v-bind="tooltipProps"
                :class="[item.customClass, 'nav-button', 'right-nav-button']"
                :aria-label="item.title"
                :title="item.title"
                :icon="!item?.iconText"
                variant="text"
                @click="item.click()"
              >
                <VIcon :icon="getMdiIcon(item.mdiIcon || getFallbackMdiIcon(item.icon))" />
                <span v-if="item?.iconText" class="nav-button-text">
                  {{ item.iconText }}
                </span>
              </VBtn>
            </template>
            <span>{{ item.title }}</span>
          </VTooltip>
        </div>
      </div>
    </div>
  </VToolbar>

  <!-- Menus for phone -->
  <VToolbar
    v-if="isPhone"
    tag="header"
    class="app-header-content-for-phone"
    color="transparent"
    flat
    elevation="0"
    height="60"
  >
    <div class="phone-toolbar-content">
      <div class="phone-toolbar-side phone-toolbar-side-start">
        <VBtn
          icon
          variant="text"
          aria-label="MENU"
          title="MENU"
          @click="openPhoneMenu(true)"
        >
          <span class="mdi mdi-menu" aria-hidden="true"></span>
        </VBtn>
        <a href="." class="phone-logo" aria-label="ElementsPanel">
          <img :src="logoImage" alt="ElementsPanel" />
        </a>
        <div v-for="(item, index) in appMenus" :key="index">
          <VMenu
            v-if="item.menus && item.conditions && !item.onlyPC"
            location="bottom"
            :offset="6"
          >
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                class="phone-nav-button"
                icon
                variant="text"
                :aria-label="item.title"
              >
                <VIcon :icon="getMdiIcon(item.mdiIcon || getFallbackMdiIcon(item.icon))" />
              </VBtn>
            </template>
            <VList density="compact">
              <VListItem
                v-for="menuItem in item.menus"
                :key="menuItem.value"
                :title="menuItem.title"
                @click="item.click(String(menuItem.value))"
              />
            </VList>
          </VMenu>
        </div>
      </div>
      <div class="phone-toolbar-side phone-toolbar-side-end">
        <div v-for="(item, index) in appMenus" :key="index">
          <VBtn
            v-if="item.conditions && !item.onlyPC && !item.menus"
            class="phone-nav-button"
            icon
            variant="text"
            :aria-label="item.title"
            :title="item.title"
            @click="item.click()"
          >
            <VIcon :icon="getMdiIcon(item.mdiIcon || getFallbackMdiIcon(item.icon))" />
          </VBtn>
        </div>
      </div>
    </div>
  </VToolbar>

  <VDialog
    v-model="containerState.showPhoneMenu"
    class="phone-menu-dialog"
    max-width="500"
    location="top"
    transition="dialog-top-transition"
  >
    <VList class="phone-menu" density="comfortable">
      <VListItem
        v-for="item in menus"
        :key="item.path"
        :title="String(item.name)"
        :active="isRouteActive(item.path)"
        @click="handleToPage(item.path)"
      />
    </VList>
  </VDialog>
</template>

<style lang="scss" scoped>
.nav-button-warning:hover {
  background-color: rgba(255, 193, 7, 0.34) !important;
}

.nav-button-success:hover {
  background-color: rgba(64, 156, 216, 0.12) !important;
}

.nav-button-danger:hover {
  background-color: #ff19116f !important;
}

.nav-button-primary:hover {
  background-color: rgba(255, 255, 255, 0.25) !important;
}

.nav-button-success:hover {
  background-color: #48e6635a !important;
}

.phone-menu {
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  color: var(--app-header-text-color);

  :deep(.v-list-item) {
    min-height: 44px;
    margin: 4px 0;
    border-radius: 12px;
    color: var(--app-header-text-color);
  }

  :deep(.v-list-item--active) {
    background-color: rgba(64, 156, 216, 0.12);
  }
}

.app-header-content-for-phone {
  height: 60px;
  width: 100%;
  background-color: var(--app-header-bg) !important;
  color: var(--app-header-text-color);
  box-shadow: none;
  backdrop-filter: saturate(180%) blur(20px);
}

.phone-toolbar-content {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}

.phone-toolbar-side {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
}

.phone-toolbar-side-end {
  justify-content: flex-end;
}

.phone-nav-button {
  margin: 0 2px;
  color: var(--app-header-text-color) !important;
}

.phone-menu-dialog :deep(.v-overlay__content) {
  width: calc(100% - 24px);
  margin: 12px;
}

.phone-menu-dialog :deep(.v-list) {
  background-color: var(--app-header-bg);
  color: var(--app-header-text-color);
  border-radius: 24px;
}

.app-header-wrapper {
  position: relative;
  z-index: 20;
  display: flex;
  flex: 0 0 64px;
  width: 100%;
  height: 64px;
  min-height: 64px;
  align-items: center;
  justify-content: center;
  background-color: var(--app-header-bg) !important;
  color: var(--app-header-text-color);
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: saturate(180%) blur(20px);
}

.app-header-wrapper :deep(.v-toolbar__content),
.app-header-content-for-phone :deep(.v-toolbar__content) {
  width: 100%;
  padding: 0;
}

.app-header-content {
  display: flex;
  width: 100%;
  height: 64px;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;

  .btns {
    display: flex;
    min-width: 0;
    align-items: center;
  }
}

.header-leading {
  display: flex;
  flex: 0 0 200px;
  width: 200px;
  height: 64px;
  align-items: center;
  box-sizing: border-box;
  padding-left: 12px;
  transition:
    width 0.2s ease,
    flex-basis 0.2s ease;
}

.header-leading--sidebar-open {
  flex-basis: 240px;
  width: 240px;
}

.sidebar-toggle-button {
  flex: 0 0 auto;
  margin-right: 8px;
  color: var(--app-header-text-color) !important;
}

.header-logo {
  display: flex;
  min-width: 0;
  height: 64px;
  align-items: center;
  justify-content: flex-start;

  img {
    max-width: 130px;
    height: 20px;
  }
}

.header-actions {
  flex: 1 1 auto;
  justify-content: flex-end;
  padding: 0 24px;
}

.phone-logo {
  display: flex;
  min-width: 0;
  align-items: center;
  margin-left: 4px;

  img {
    max-width: 120px;
    height: 18px;
  }
}

.nav-button {
  min-width: 40px;
  min-height: 40px;
  margin: 0 4px;
  padding: 8px 12px;
  color: var(--app-header-text-color) !important;
  font-size: 14px;
  text-align: center;
  user-select: none;
}

.right-nav-button {
  margin: 0 2px;
  padding: 8px;
}

.nav-button-text {
  margin-left: 6px;
  font-size: 12px;
}

.icon-button {
  font-size: 16px !important;
}

.nav-button:hover {
  background-color: rgba(215, 215, 215, 0.261);
}

.pro-mode-order-container {
  @extend .nav-button;
  @extend .nav-button-success;
}

@media (max-width: 1470px) {
  .header-actions {
    padding-right: 25px;
    padding-left: 25px;
  }
}

@media (max-width: 992px) {
  .header-actions {
    padding-right: 8px;
    padding-left: 8px;
  }
}
</style>
