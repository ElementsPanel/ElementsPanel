<script setup lang="ts">
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { useScreen } from "@/hooks/useScreen";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { MenuUnfoldOutlined } from "@ant-design/icons-vue";
import { h } from "vue";
import { useRoute } from "vue-router";
import CardPanel from "@/components/CardPanel.vue";

defineProps<{
  /** One-shot entrance animation after a successful login */
  loginEnter?: boolean;
}>();

const route = useRoute();
const { containerState } = useLayoutContainerStore();
const { logoImage } = useAppConfigStore();

const { menus, headerMenus, appMenus, headerAppMenus, handleToPage } = useHeaderMenus();

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
  <header class="app-header-wrapper" :class="{ 'login-enter-header': loginEnter }">
    <div v-if="!isPhone" class="app-header-content">
      <nav class="btns">
        <a href="." style="margin-right: 12px">
          <div class="logo">
            <img :src="logoImage" style="height: 18px" />
          </div>
        </a>

        <div
          v-for="item in headerMenus"
          :key="item.path"
          class="nav-button"
          :class="[item.customClass, { 'nav-button-active': isRouteActive(item.path) }]"
          @click="handleToPage(item.path)"
        >
          <span>{{ item.name }}</span>
        </div>
      </nav>
      <div class="btns">
        <div v-for="(item, index) in headerAppMenus as any" :key="index">
          <a-dropdown v-if="item.menus && item.conditions" placement="bottom">
            <div
              :class="item.customClass"
              class="nav-button right-nav-button flex-center"
              @click.prevent
            >
              <component :is="item.icon" v-if="item.icon"></component>
            </div>
            <template #overlay>
              <a-menu @click="(e: any) => item.click(String(e.key))">
                <a-menu-item v-for="m in item.menus" :key="m.value">
                  {{ m.title }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-tooltip v-else-if="item.conditions" placement="bottom">
            <template #title>
              <span>{{ item.title }}</span>
            </template>
            <div
              :class="item.customClass"
              class="nav-button right-nav-button flex-center"
              type="text"
              @click="(e: any) => item.click(e.key)"
            >
              <component :is="item.icon" v-if="item.icon"></component>
              <span v-if="item?.iconText" class="ml-6" style="font-size: 12px">
                {{ item?.iconText }}
              </span>
            </div>
          </a-tooltip>
        </div>
      </div>
    </div>
  </header>
  <div v-if="!isPhone" style="height: 80px"></div>

  <!-- Menus for phone -->
  <header v-if="isPhone" class="app-header-content-for-phone" :class="{ 'login-enter-header': loginEnter }">
    <CardPanel class="card-panel">
      <template #body>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div style="width: 100px" class="flex">
            <a-button
              type="text"
              :icon="h(MenuUnfoldOutlined)"
              size="small"
              @click="openPhoneMenu(true)"
            ></a-button>
            <div v-for="(item, index) in appMenus" :key="index">
              <a-dropdown
                v-if="item.menus && item.conditions && !item.onlyPC"
                class="phone-nav-button"
                placement="bottom"
              >
                <a-button type="text" :icon="h(item.icon)" size="small" @click.prevent></a-button>
                <template #overlay>
                  <a-menu @click="(e: any) => item.click(String(e.key))">
                    <a-menu-item v-for="m in item.menus" :key="m.value">
                      {{ m.title }}
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </div>
          <div style="width: 100px" class="justify-end">
            <div v-for="(item, index) in appMenus" :key="index">
              <a-button
                v-if="item.conditions && !item.onlyPC && !item.menus"
                class="phone-nav-button"
                type="text"
                :icon="h(item.icon)"
                size="small"
                @click="item.click"
              ></a-button>
            </div>
          </div>
        </div>
      </template>
    </CardPanel>
  </header>

  <a-drawer
    :width="500"
    title="MENU"
    placement="top"
    :open="containerState.showPhoneMenu"
    @close="() => (containerState.showPhoneMenu = false)"
  >
    <div class="phone-menu">
      <div
        v-for="item in menus"
        :key="item.path"
        class="phone-menu-btn"
        :class="{ 'phone-menu-btn-active': isRouteActive(item.path) }"
        @click="handleToPage(item.path)"
      >
        {{ item.name }}
      </div>
    </div>
  </a-drawer>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

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
  .phone-menu-btn {
    padding: 16px 8px;
    color: var(--color-gray-12);
  }

  .phone-menu-btn-active {
    background-color: rgba(64, 156, 216, 0.12);
  }
}

.app-header-content-for-phone {
  height: 60px;
  width: 100%;

  // display: flex;
  // justify-content: space-between;
  // align-items: center;
  // margin: 0px;
  .card-panel {
    background-color: var(--app-header-bg);
    margin-top: 8px;

    button {
      color: var(--app-header-text-color) !important;
    }
  }

  .phone-nav-button,
  .phone-nav-button * {
    margin: 0px 6px;
  }
}

.app-header-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--app-header-bg);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--app-header-text-color);

  position: fixed;
  top: 10px;
  left: 12px;
  right: 12px;
  border-radius: 12px;

  z-index: 20;

  .app-header-content {
    @extend .global-app-container;

    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 64px;

    .btns {
      display: flex;
      align-items: center;
    }
  }

  .nav-button {
    margin: 0 4px;
    font-size: 14px;
    transition: all 0.4s;
    color: var(--app-header-text-color) !important;
    text-align: center;
    padding: 8px 12px;
    min-width: 40px;
    cursor: pointer;
    border-radius: 6px;
    user-select: none;
  }

  .right-nav-button {
    margin: 0 2px;
    font-size: 14px;
    padding: 8px 8px;
  }

  .icon-button {
    font-size: 16px !important;
  }
  .nav-button:hover {
    background-color: rgba(215, 215, 215, 0.261);
  }

  .nav-button-active {
    background-color: rgba(215, 215, 215, 0.35);
  }

  .logo {
    cursor: pointer;
  }

  .pro-mode-order-container {
    @extend .nav-button;
    @extend .nav-button-success;
  }

  // Sync margin
  @media (max-width: 1470px) {
    .app-header-content,
    .app-header-content-for-phone {
      margin: 0px 25px;
    }
  }

  @media (max-width: 992px) {
    .app-header-content {
      margin: 0px 8px;
    }
  }
}
</style>
