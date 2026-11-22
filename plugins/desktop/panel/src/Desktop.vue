<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { logoutUser } from "@elementspanel/epanel-plugin-console/services/apis";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { computed, provide, ref, watch, type Component } from "vue";
import { VIcon } from "vuetify/components";
import DesktopContextMenu from "./widgets/desktop/DesktopContextMenu.vue";
import DesktopIcon from "./widgets/desktop/DesktopIcon.vue";
import DesktopTaskbar from "./widgets/desktop/DesktopTaskbar.vue";
import DesktopWindowHost from "./widgets/desktop/DesktopWindowHost.vue";
import { desktopWindowContextKey } from "./windowContext";
import { useDesktopAppearance } from "./hooks/useDesktopAppearance";
import { useDesktopApplications } from "./hooks/useDesktopApplications";
import { useDesktopIcons } from "./hooks/useDesktopIcons";
import { useDesktopWindows } from "./hooks/useDesktopWindows";
import { useDesktopLayout } from "./hooks/useDesktopLayout";
import { useDesktopContextMenu } from "./hooks/useDesktopContextMenu";

const { state: appState, isAdmin, isLogged, authEnabled } = useAppStateStore();
const { startButtonIcon, wallpaperStyle } = useDesktopAppearance();
const applications = useDesktopApplications({ isAdmin });
const {
  desktopLoginWindow,
  desktopUsersWindow,
  desktopUserInfoWindow,
  desktopStartMenuAvatar,
  desktopFileEditorWindow,
  desktopImageViewerWindow,
  pluginInstanceActions,
  availableDesktopApps,
  viewsById,
  findView,
  savedViewProps
} = applications;
const showLoginOverlay = ref(authEnabled.value && !isLogged.value);
const icons = useDesktopIcons({
  availableDesktopApps,
  findView,
  saveDesktopLayout: () => saveDesktopLayout(),
  closeContextMenu: () => closeContextMenu(),
  onDesktopKeyDown: (event) => onDesktopKeyDown(event)
});
const {
  instanceShortcuts,
  desktopApps,
  selectedIconIds,
  selectIcon,
  desktopIconsRef,
  iconGrid,
  getIconGridX,
  getIconGridY,
  isDragging,
  draggedIcons,
  ghostX,
  ghostY,
  dropX,
  dropY,
  dropValid,
  selectionRect,
  handleDesktopMouseDown,
  handleIconDragStart,
  handleStartMenuAppDrop,
  handleTaskbarAppDrop,
  onDesktopClick
} = icons;
const windowManager = useDesktopWindows({
  availableDesktopApps,
  pluginInstanceActions,
  instanceShortcuts,
  desktopUserInfoWindow,
  findView,
  savedViewProps,
  saveDesktopLayout: () => saveDesktopLayout()
});
const {
  windows,
  openWindow,
  openInstanceConsole,
  openFileEditorWindow,
  openImageViewerWindow,
  openUserInfoWindow,
  closeWindow,
  removeClosedWindow,
  minimizeWindow,
  maximizeWindow,
  focusWindow,
  toggleWindow,
  handleWindowMoved,
  handleWindowResized,
  activeWindowId,
  taskbarWindows,
  handleReorderWindows
} = windowManager;
const { saveDesktopLayout, loadDesktopLayout } = useDesktopLayout({
  isLogged,
  icons,
  windowManager,
  applications
});
const {
  ctxMenu,
  closeContextMenu,
  ctxMenuItems,
  onDesktopContextMenu,
  onTaskbarContextMenu,
  onTitlebarContextMenu,
  onIconContextMenu,
  onDesktopKeyDown
} = useDesktopContextMenu({ showLoginOverlay, icons, windowManager, saveDesktopLayout });
const handleLoginSuccess = () => {
  showLoginOverlay.value = false;
};

watch(isLogged, (logged) => {
  if (logged) {
    loadDesktopLayout();
  } else if (authEnabled.value) {
    showLoginOverlay.value = true;
  }
});

const exitDesktop = () => {
  Modal.confirm({
    title: t("TXT_CODE_COMMON_LOGOUT"),
    content: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_LOG_OUT_THIS_USER"),
    async onOk() {
      if (authEnabled.value) await logoutUser().execute();
      window.location.reload();
    }
  });
};

const username = computed(() => appState.userInfo?.userName || "User");
provide(desktopWindowContextKey, {
  activeWindowId,
  views: viewsById,
  fileEditor: desktopFileEditorWindow,
  imageViewer: desktopImageViewerWindow,
  users: desktopUsersWindow,
  userInfo: desktopUserInfoWindow,
  close: closeWindow,
  closed: removeClosedWindow,
  minimize: minimizeWindow,
  maximize: maximizeWindow,
  focus: focusWindow,
  moved: handleWindowMoved,
  resized: handleWindowResized,
  contextMenu: onTitlebarContextMenu,
  openConsole: openInstanceConsole,
  openFileEditor: openFileEditorWindow,
  openImageViewer: openImageViewerWindow
});
const isMdiIcon = (icon: Component | string): icon is `mdi-${string}` =>
  typeof icon === "string" && icon.startsWith("mdi-");
</script>

<template>
  <div class="desktop-container" @click="onDesktopClick" @contextmenu="onDesktopContextMenu">
    <div class="desktop-wallpaper" :style="wallpaperStyle" aria-hidden="true"></div>
    <Transition name="desktop-fade">
      <div v-if="!showLoginOverlay" class="desktop-content-wrapper">
        <div
          ref="desktopIconsRef"
          class="desktop-icons"
          tabindex="-1"
          @mousedown="handleDesktopMouseDown"
          @dragover.prevent
          @drop.prevent="handleStartMenuAppDrop"
        >
          <DesktopIcon
            v-for="app in desktopApps"
            :id="app.id"
            :key="app.id"
            :label="app.label"
            :icon="app.icon"
            :color="app.color"
            :selected="selectedIconIds.has(app.id)"
            :scale="iconGrid.scale"
            :x="getIconGridX(app.id)"
            :y="getIconGridY(app.id)"
            @select="selectIcon"
            @open="openWindow"
            @dragstart="handleIconDragStart"
            @contextmenu="onIconContextMenu"
          />

          <div
            v-if="selectionRect && (selectionRect.width > 0 || selectionRect.height > 0)"
            class="desktop-drag-select-rect"
            :style="{
              left: selectionRect.x + 'px',
              top: selectionRect.y + 'px',
              width: selectionRect.width + 'px',
              height: selectionRect.height + 'px'
            }"
          ></div>

          <template v-if="isDragging && dropValid">
            <div
              v-for="item in draggedIcons"
              :key="item.id"
              class="drop-indicator"
              :style="{
                left: dropX + item.offsetX + 'px',
                top: dropY + item.offsetY + 'px',
                transform: `scale(${iconGrid.scale})`
              }"
            >
              <div class="drop-indicator__highlight"></div>
            </div>
          </template>

          <template v-if="isDragging">
            <div
              v-for="item in draggedIcons"
              :key="item.id"
              class="drag-ghost"
              :style="{
                left: ghostX + item.offsetX + 'px',
                top: ghostY + item.offsetY + 'px',
                transform: `scale(${iconGrid.scale})`,
                transformOrigin: 'top left'
              }"
            >
              <div class="drag-ghost__inner">
                <component
                  :is="item.icon"
                  v-if="typeof item.icon !== 'string'"
                  class="drag-ghost__icon"
                />
                <VIcon
                  v-else-if="isMdiIcon(item.icon)"
                  :icon="item.icon"
                  size="42"
                  class="drag-ghost__icon"
                />
                <span v-else class="drag-ghost__emoji">{{ item.icon }}</span>
                <span class="drag-ghost__label">{{ item.label }}</span>
              </div>
            </div>
          </template>
        </div>

        <DesktopWindowHost v-for="[id, win] in windows" :key="id" :window="win" />
        <DesktopTaskbar
          :windows="taskbarWindows"
          :apps="availableDesktopApps"
          :username="username"
          :user-avatar="desktopStartMenuAvatar"
          :start-button-icon="startButtonIcon"
          @toggle-window="toggleWindow"
          @open-app="openWindow"
          @add-shortcut="handleTaskbarAppDrop"
          @exit-desktop="exitDesktop"
          @open-user-info="openUserInfoWindow"
          @reorder-windows="handleReorderWindows"
          @contextmenu-window="onTaskbarContextMenu"
        />
        <DesktopContextMenu
          :visible="ctxMenu.visible"
          :x="ctxMenu.x"
          :y="ctxMenu.y"
          :items="ctxMenuItems"
          @close="closeContextMenu"
        />
      </div>
    </Transition>
    <Transition name="login-fade">
      <component
        :is="desktopLoginWindow"
        v-if="showLoginOverlay && desktopLoginWindow"
        @login-success="handleLoginSuccess"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.desktop-container {
  position: fixed;
  inset: 0;
  overflow: hidden;
  z-index: 100;
}

.desktop-wallpaper {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.desktop-icons {
  position: relative;
  z-index: 1;
  width: 100%;
  height: calc(100vh - 48px);
  overflow: hidden;
  user-select: none;
  outline: none;
}

.desktop-drag-select-rect {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  border-radius: 3px;
  background: rgba(22, 119, 255, 0.12);
  border: 1px solid rgba(22, 119, 255, 0.4);
}

.drag-ghost {
  position: absolute;
  z-index: 9999;
  pointer-events: none;
  user-select: none;
}

.drag-ghost__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 90px;
  padding: 8px 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  opacity: 0.65;
  transform: scale(1.05);
}

.drag-ghost__icon {
  font-size: 42px;
  color: #fff;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
  margin-bottom: 6px;
}

.drag-ghost__emoji {
  font-size: 42px;
  line-height: 1;
  margin-bottom: 6px;
}

.drag-ghost__label {
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  text-align: center;
  line-height: 1.3;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-indicator {
  position: absolute;
  z-index: 9998;
  pointer-events: none;
  width: 90px;
  height: 104px;
  transform-origin: top left;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-indicator__highlight {
  width: 74px;
  height: 74px;
  border-radius: 12px;
  border: 0;
  background: rgba(255, 255, 255, 0.06);
}

.desktop-content-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.desktop-fade-enter-active {
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.desktop-fade-leave-active {
  transition: all 0.3s ease;
}

.desktop-fade-enter-from {
  opacity: 0;
  transform: scale(1.05);
}

.desktop-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.login-fade-enter-active,
.login-fade-leave-active {
  transition: opacity 0.6s ease;
}

.login-fade-enter-from,
.login-fade-leave-to {
  opacity: 0;
}
</style>
