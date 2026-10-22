<script setup lang="ts">
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { useScreen } from "@/hooks/useScreen";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useUiStore } from "@/stores/useUiStore";
import { useEventListener } from "@vueuse/core";
import {
  VBadge,
  VBtn,
  VList,
  VListItem,
  VMenu,
  VIcon,
  VNavigationDrawer,
  VToolbar,
  VTooltip
} from "vuetify/components";
import { computed, watch } from "vue";
import { ctx } from "@/plugin/context";
import AppSidebarMenu from "./AppSidebarMenu.vue";

const { uiState } = useUiStore();
const { isSidebarOpen, logoImage, toggleSidebar, useSidebarLayout } = useAppConfigStore();

const { appMenus } = useHeaderMenus();
const desktopAppMenus = computed(() => appMenus.value.filter((item) => !item.onlyHeader));

const getMdiIcon = (explicitIcon?: string) => {
  return explicitIcon || "mdi-help-circle-outline";
};

const getFallbackMdiIcon = (icon: unknown) => {
  if (typeof icon === "string" && icon.startsWith("mdi-")) return icon;
  return "mdi-help-circle-outline";
};

const { isPhone } = useScreen();
const leadingSlots = computed(() =>
  ctx.slots.entries("shell.header.leading", { mobile: isPhone.value })
);
const actionSlots = computed(() =>
  ctx.slots.entries("shell.header.actions", { mobile: isPhone.value })
);

const openPhoneMenu = (b = false) => {
  uiState.showPhoneMenu = b;
};

watch(isPhone, (phone) => {
  if (!phone) openPhoneMenu(false);
});

useEventListener("keydown", (event) => {
  if (event.key === "Escape" && uiState.showPhoneMenu) openPhoneMenu(false);
});
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
        <component
          :is="entry.component"
          v-for="entry in leadingSlots"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: false }"
        />
      </div>
      <div class="btns header-actions">
        <component
          :is="entry.component"
          v-for="entry in actionSlots"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: false }"
        />
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
              <VBadge
                :content="item.badge"
                :model-value="item.badge != null && item.badge !== false"
                :max="99"
                :offset-x="14"
                :offset-y="14"
                color="primary"
                floating
              >
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
              </VBadge>
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
          aria-controls="app-phone-sidebar"
          :aria-expanded="uiState.showPhoneMenu"
          @click="openPhoneMenu(true)"
        >
          <VIcon icon="mdi-menu" />
        </VBtn>
        <component
          :is="entry.component"
          v-for="entry in leadingSlots"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: true }"
        />
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
        <component
          :is="entry.component"
          v-for="entry in actionSlots"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: true }"
        />
        <div v-for="(item, index) in appMenus" :key="index">
          <VBadge
            v-if="item.conditions && !item.onlyPC && !item.menus"
            :content="item.badge"
            :model-value="item.badge != null && item.badge !== false"
            :max="99"
            :offset-x="14"
            :offset-y="14"
            color="primary"
            floating
          >
            <VBtn
              class="phone-nav-button"
              icon
              variant="text"
              :aria-label="item.title"
              :title="item.title"
              @click="item.click()"
            >
              <VIcon :icon="getMdiIcon(item.mdiIcon || getFallbackMdiIcon(item.icon))" />
            </VBtn>
          </VBadge>
        </div>
      </div>
    </div>
  </VToolbar>

  <VNavigationDrawer
    v-if="isPhone"
    id="app-phone-sidebar"
    v-model="uiState.showPhoneMenu"
    class="phone-menu-drawer"
    color="surface"
    location="left"
    width="280"
    temporary
    retain-focus
    capture-focus
  >
    <AppSidebarMenu />
  </VNavigationDrawer>
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

.app-header-content-for-phone {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  height: 60px;
  width: 100%;
  background-color: var(--app-header-bg) !important;
  color: var(--app-header-text-color) !important;
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

.phone-menu-drawer {
  max-width: calc(100vw - 48px);
}

.phone-menu-drawer + :deep(.v-navigation-drawer__scrim) {
  position: fixed;
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
  color: var(--app-header-text-color) !important;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: saturate(180%) blur(20px);
}

.app-header-wrapper :deep(.v-toolbar__content),
.app-header-content-for-phone :deep(.v-toolbar__content) {
  width: 100%;
  padding: 0;
}

.app-header-wrapper :deep(.v-btn),
.app-header-content-for-phone :deep(.v-btn) {
  color: var(--app-header-text-color) !important;
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
    max-width: 160px;
    height: 28px;
    object-fit: contain;
  }
}

.header-actions {
  flex: 1 1 auto;
  justify-content: flex-end;
  padding: 0 24px;
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
