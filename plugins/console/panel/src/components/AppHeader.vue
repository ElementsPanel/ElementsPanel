<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useUiStore } from "@/stores/useUiStore";
import { useEventListener } from "@vueuse/core";
import {
  VBadge,
  VBtn,
  VIcon,
  VNavigationDrawer,
  VToolbar,
  VTooltip
} from "vuetify/components";
import { computed, watch } from "vue";
import { ctx } from "@/plugin/context";
import type { PanelFrontendHeaderAction } from "@/plugin/context";
import AppSidebarMenu from "./AppSidebarMenu.vue";
import ActionRipple from "./ActionRipple.vue";

const { uiState } = useUiStore();
const { isSidebarOpen, logoImage, toggleSidebar, useSidebarLayout } = useAppConfigStore();

const { isPhone } = useScreen();
const leadingSlots = computed(() =>
  ctx.slots.entries("shell.header.leading", { mobile: isPhone.value })
);
const actionSlots = computed(() =>
  ctx.slots.entries("shell.header.actions", { mobile: isPhone.value })
);
// Descriptors are rendered by the shell so every header button shares one
// style; components stay supported for older plugins.
const registeredActions = computed(() =>
  actionSlots.value.flatMap((entry) =>
    entry.action ? [{ id: entry.id, action: entry.action }] : []
  )
);
const registeredComponents = computed(() => actionSlots.value.filter((entry) => !entry.action));

const actionTitle = (action: PanelFrontendHeaderAction) =>
  typeof action.title === "function" ? action.title() : action.title;
const actionIcon = (action: PanelFrontendHeaderAction) =>
  typeof action.mdiIcon === "function" ? action.mdiIcon() : action.mdiIcon;
const actionBadge = (action: PanelFrontendHeaderAction) => {
  const badge = typeof action.badge === "function" ? action.badge() : action.badge;
  return badge === false || badge == null ? undefined : badge;
};
const actionExpanded = (action: PanelFrontendHeaderAction) => action.expanded?.();
const actionRipple = (action: PanelFrontendHeaderAction) => action.ripple?.();

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
        <template v-for="entry in registeredActions" :key="entry.id">
          <div class="header-action">
            <VTooltip :text="actionTitle(entry.action)" location="bottom">
              <template #activator="{ props: tooltipProps }">
                <VBadge
                  :content="actionBadge(entry.action)"
                  :model-value="actionBadge(entry.action) != null"
                  :max="99"
                  :offset-x="14"
                  :offset-y="14"
                  color="primary"
                  floating
                >
                  <VBtn
                    v-bind="tooltipProps"
                    :class="[entry.action.customClass, 'nav-button', 'right-nav-button']"
                    :aria-label="actionTitle(entry.action)"
                    :aria-controls="entry.action.ariaControls"
                    :aria-expanded="actionExpanded(entry.action)"
                    icon
                    variant="text"
                    @click="entry.action.click()"
                  >
                    <VIcon :icon="actionIcon(entry.action)" />
                  </VBtn>
                </VBadge>
              </template>
            </VTooltip>
            <ActionRipple :trigger="actionRipple(entry.action)" />
          </div>
        </template>
        <component
          :is="entry.component"
          v-for="entry in registeredComponents"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: false }"
        />
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
      </div>
      <div class="phone-toolbar-side phone-toolbar-side-end">
        <template v-for="entry in registeredActions" :key="entry.id">
          <div v-if="!entry.action.onlyPC">
            <VBadge
              :content="actionBadge(entry.action)"
              :model-value="actionBadge(entry.action) != null"
              :max="99"
              :offset-x="14"
              :offset-y="14"
              color="primary"
              floating
            >
              <VBtn
                class="phone-nav-button"
                :aria-label="actionTitle(entry.action)"
                :aria-controls="entry.action.ariaControls"
                :aria-expanded="actionExpanded(entry.action)"
                icon
                variant="text"
                @click="entry.action.click()"
              >
                <VIcon :icon="actionIcon(entry.action)" />
              </VBtn>
            </VBadge>
          </div>
        </template>
        <component
          :is="entry.component"
          v-for="entry in registeredComponents"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: true }"
        />
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
    floating
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

.header-action {
  position: relative;
  display: inline-flex;
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
