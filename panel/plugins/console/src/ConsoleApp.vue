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
const { isPhone } = useScreen();
const route = useRoute();

// Typed, effect-scoped overlays contributed by feature plugins.
const OVERLAY_COMPONENTS = computed(() => ctx.slots.entries("shell.overlay", {}));

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
        <AppHeader v-if="!isLoginPage && !isImmersivePage" />
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
          >
            <AppSidebarMenu :collapsed="!isSidebarOpen" />
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
                <Transition name="page" mode="out-in">
                  <component :is="Component" :key="route.fullPath" />
                </Transition>
              </RouterView>
            </div>
          </main>
        </div>
      </div>

      <AppBottomNav v-if="isPhone && !useSidebarLayout && !isLoginPage && !isImmersivePage" />

      <InputDialogProvider />
      <component
        :is="entry.component"
        v-for="entry in OVERLAY_COMPONENTS"
        :key="entry.id"
        v-bind="entry.props"
      />
    </AppConfigProvider>
  </VThemeProvider>
</template>

<style lang="scss">
.page-enter-active,
.page-leave-active {
  will-change: opacity;
}

.page-enter-active {
  transition: opacity 260ms ease-out;
}

.page-leave-active {
  transition: opacity 180ms ease-in;
}

.page-enter-from {
  opacity: 0;
}

.page-enter-to,
.page-leave-from {
  opacity: 1;
}

.page-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
    will-change: auto;
  }
}
</style>
