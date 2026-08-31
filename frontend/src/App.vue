<script setup lang="ts">
import UploadBubble from "@/components/UploadBubble.vue";
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
import { ctx } from "./plugin/context";
import { useAppStateStore } from "./stores/useAppStateStore";
import { useLayoutContainerStore } from "./stores/useLayoutContainerStore";
import { closeAppLoading, setLoadingTitle } from "./tools/dom";

const { hasBgImage, initAppTheme, useSidebarLayout } = useAppConfigStore();
const { containerState } = useLayoutContainerStore();
const { state: appState } = useAppStateStore();
const { isPhone } = useScreen();
const route = useRoute();

// The account dialog is contributed by the "user" plugin through
// `ctx.ui.globalComponent()`, so it disappears with the plugin.
const GLOBAL_COMPONENTS = computed(() => [
  InputDialogProvider,
  UploadBubble,
  ...ctx.ui.globalComponents
]);

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

// One-shot entrance animation right after a successful login
// (route leaves /login). Header slides down, content fades in.
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
  <AppConfigProvider :has-bg-image="hasBgImage">
    <!-- App Container -->
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

    <!-- Mobile Bottom Navigation -->
    <AppBottomNav v-if="isPhone && !useSidebarLayout && !isLoginPage && !isImmersivePage" />

    <!-- Global Components -->
    <component :is="component" v-for="(component, index) in GLOBAL_COMPONENTS" :key="index" />
  </AppConfigProvider>
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

// Post-login entrance: header slides down from the top edge after 0.3s,
// the whole content area (breadcrumbs + page) fades in after 0.5s. The
// animation lives on a stable wrapper that never re-mounts, so inner
// component re-creation cannot replay it, and `both` keeps everything
// hidden during the delay.
.login-enter-header {
  animation: login-header-slide-in 0.4s ease-out 0.3s both;
}

.login-enter-content {
  animation: login-content-fade-in 0.4s ease-out 1s both;
}

@media (prefers-reduced-motion: reduce) {
  .login-enter-header,
  .login-enter-content {
    animation: none;
  }
}
</style>
