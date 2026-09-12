<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { useAppConfigStore } from "@/stores/useAppConfigStore";

import { computed, onMounted, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppBottomNav from "./components/AppBottomNav.vue";
import AppConfigProvider from "./components/AppConfigProvider.vue";
import AppHeader from "./components/AppHeader.vue";
import AppSidebarMenu from "./components/AppSidebarMenu.vue";
import Breadcrumbs from "./components/Breadcrumbs.vue";
import InputDialogProvider from "./components/InputDialogProvider.vue";
import { ctx } from "@/plugin/context";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { closeAppLoading, setLoadingTitle } from "@/tools/dom";
import { VThemeProvider } from "vuetify/components";
import { setVuetifyTheme } from "./vuetify";

const {
  hasBgImage,
  initAppTheme,
  isDarkTheme,
  isSidebarOpen,
  useSidebarLayout
} = useAppConfigStore();
const { containerState } = useLayoutContainerStore();
const { state: appState } = useAppStateStore();
const { isPhone } = useScreen();
const route = useRoute();

// Overlays that belong to no route. Feature plugins add their own global
// components through `ctx.ui.globalComponent()` and leave with their scope.
const GLOBAL_COMPONENTS = computed(() => [InputDialogProvider, ...ctx.ui.globalComponents]);

const designModeNavStyle = computed(() => {
  if (!appState.userInfo) return {};
  return {
    zIndex: containerState.isDesignMode ? 997 : 1
  };
});

const isLoginPage = computed(() => route.path === "/login");
const isImmersivePage = computed(() => route.meta.immersive === true);
const vuetifyTheme = computed(() => (isDarkTheme.value ? "dark" : "light"));

// VThemeProvider covers the main tree, while dynamically mounted dialogs use
// Vuetify's global theme. Keep both in lockstep so every popup follows the
// current light/dark mode.
watch(
  isDarkTheme,
  (dark) => setVuetifyTheme(dark),
  { immediate: true }
);

onMounted(async () => {
  setLoadingTitle("Loading application settings...");
  await initAppTheme();
  closeAppLoading();
});
</script>

<template>
  <VThemeProvider :theme="vuetifyTheme">
    <AppConfigProvider :has-bg-image="hasBgImage">
      <div class="global-app-container">
        <AppHeader v-if="!isLoginPage && !isImmersivePage" :style="designModeNavStyle" />
        <div
          class="app-shell-content"
          :class="{
            'app-shell-content--sidebar': useSidebarLayout && !isLoginPage && !isImmersivePage
          }"
        >
          <div
            v-if="useSidebarLayout && !isLoginPage && !isImmersivePage"
            id="app-sidebar"
            class="app-sidebar-shell"
            :class="{ 'app-sidebar-shell--collapsed': !isSidebarOpen }"
            :aria-hidden="!isSidebarOpen"
          >
            <AppSidebarMenu :style="designModeNavStyle" />
          </div>
          <main
            class="main-content"
            :class="{
              'app-layout-sidebar-only': useSidebarLayout && !isLoginPage && !isImmersivePage
            }"
          >
            <div class="app-main-body">
              <Breadcrumbs v-if="!isLoginPage && !isImmersivePage" />
              <RouterView v-slot="{ Component, route }">
                <transition name="page-fade" mode="out-in">
                  <component :is="Component" :key="route.fullPath" />
                </transition>
              </RouterView>
            </div>
          </main>
        </div>
      </div>

      <AppBottomNav v-if="isPhone && !useSidebarLayout && !isLoginPage && !isImmersivePage" />

      <component :is="component" v-for="(component, index) in GLOBAL_COMPONENTS" :key="index" />
    </AppConfigProvider>
  </VThemeProvider>
</template>

<style lang="scss">
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.3s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

</style>
