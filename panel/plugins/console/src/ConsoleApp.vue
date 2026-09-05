<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { useAppConfigStore } from "@/stores/useAppConfigStore";

import { Button, Input, Select, Table } from "ant-design-vue";
import { computed, onMounted, ref, watch } from "vue";
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
import { VThemeProvider } from "vuetify/lib/components/index.mjs";

const { hasBgImage, initAppTheme, isDarkTheme, useSidebarLayout } = useAppConfigStore();
const { containerState } = useLayoutContainerStore();
const { state: appState } = useAppStateStore();
const { isPhone } = useScreen();
const route = useRoute();

// Overlays that belong to no route. Feature plugins add their own global
// components through `ctx.ui.globalComponent()` and leave with their scope.
const GLOBAL_COMPONENTS = computed(() => [InputDialogProvider, ...ctx.ui.globalComponents]);

[Button, Select, Input, Table].forEach((element) => {
  element.props.size.default = "large";
});

const designModeNavStyle = computed(() => {
  if (!appState.userInfo) return {};
  return {
    zIndex: containerState.isDesignMode ? 997 : 1
  };
});

const isLoginPage = computed(() => route.path === "/login");
const isImmersivePage = computed(() => route.meta.immersive === true);
const vuetifyTheme = computed(() => (isDarkTheme.value ? "dark" : "light"));

// One-shot entrance animation right after a successful login (route leaves
// `/login`). Header slides down, content fades in.
const justLoggedIn = ref(false);
let loginAnimTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => route.path,
  (to, from) => {
    clearTimeout(loginAnimTimer);
    if (from === "/login" && to !== "/login") {
      justLoggedIn.value = true;
      loginAnimTimer = setTimeout(() => (justLoggedIn.value = false), 1500);
    } else {
      justLoggedIn.value = false;
    }
  }
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
        <AppSidebarMenu v-if="useSidebarLayout && !isLoginPage && !isImmersivePage" :style="designModeNavStyle" />
        <main class="main-content" :class="{ 'app-layout-sidebar-only': useSidebarLayout && !isImmersivePage }">
          <AppHeader
            v-if="!useSidebarLayout && !isLoginPage && !isImmersivePage"
            :style="designModeNavStyle"
            :login-enter="justLoggedIn"
          />
          <div class="app-main-body" :class="{ 'login-enter-content': justLoggedIn }">
            <Breadcrumbs v-if="!isLoginPage && !isImmersivePage" />
            <RouterView v-slot="{ Component, route }">
              <transition name="page-fade" mode="out-in">
                <component :is="Component" :key="route.fullPath" />
              </transition>
            </RouterView>
          </div>
        </main>
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

@keyframes login-header-slide-in {
  from {
    transform: translateY(calc(-100% - 12px));
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes login-content-fade-in {
  from {
    transform: translateY(12px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.login-enter-header {
  animation: login-header-slide-in 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) 0.3s both;
}

.login-enter-content {
  animation: login-content-fade-in 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) 0.8s both;
}

@media (prefers-reduced-motion: reduce) {
  .login-enter-header,
  .login-enter-content {
    animation: none;
  }
}
</style>
