<script setup lang="ts">
import type { PanelFrontendHeaderAction } from "@elements-panel/sdk";
import { ctx } from "@elements-panel/sdk";
import ActionRipple from "@elementspanel/epanel-plugin-console/components/ActionRipple";
import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { usePointerDrag } from "@elementspanel/epanel-plugin-console/hooks/usePointerDrag";
import { useThemeSwitch } from "@elementspanel/epanel-plugin-console/hooks/useThemeSwitch";
import { useAppConfigStore } from "@elementspanel/epanel-plugin-console/stores/useAppConfigStore";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, onBeforeUnmount, ref, watch, type Component } from "vue";
import { VBadge, VBtn, VIcon, VList, VListItem, VMenu } from "vuetify/components";
import { desktopIconDarkUrl, desktopIconUrl } from "../../assets";

const { isDarkTheme } = useAppConfigStore();
const { themeIcon, themeTitle, cycleTheme } = useThemeSwitch();
const actionSlots = computed(() => ctx.slots.entries("shell.header.actions", { mobile: false }));
const slotActions = computed(() =>
  actionSlots.value.flatMap((entry) =>
    entry.action && entry.action.taskbar !== false ? [{ id: entry.id, action: entry.action }] : []
  )
);
const slotComponents = computed(() => actionSlots.value.filter((entry) => !entry.action));
const actionTitle = (action: PanelFrontendHeaderAction) =>
  typeof action.title === "function" ? action.title() : action.title;
const actionIcon = (action: PanelFrontendHeaderAction) =>
  typeof action.mdiIcon === "function" ? action.mdiIcon() : action.mdiIcon;
const actionBadge = (action: PanelFrontendHeaderAction) => {
  const badge = typeof action.badge === "function" ? action.badge() : action.badge;
  return badge === false || badge == null ? undefined : badge;
};
const actionRipple = (action: PanelFrontendHeaderAction) => action.ripple?.();

export interface TaskbarWindow {
  id: string;
  title: string;
  icon: Component | string;
  minimized: boolean;
  active: boolean;
}

export interface TaskbarApp {
  id: string;
  label: string;
  icon: Component | string;
  color?: string;
}

const props = defineProps<{
  windows: TaskbarWindow[];
  apps: TaskbarApp[];
  username: string;
  userAvatar?: Component | string;
  startButtonIcon?: string;
}>();

const startButtonIconUrl = computed(
  () => props.startButtonIcon || (isDarkTheme.value ? desktopIconUrl : desktopIconDarkUrl)
);

const emit = defineEmits<{
  (e: "toggle-window", id: string): void;
  (e: "open-app", id: string): void;
  (e: "add-shortcut", id: string, clientX: number, clientY: number): void;
  (e: "open-start-menu"): void;
  (e: "exit-desktop"): void;
  (e: "open-user-info"): void;
  (e: "reorder-windows", newOrder: string[]): void;
  (e: "contextmenu-window", event: MouseEvent, id: string): void;
}>();

const windowsRow = ref<HTMLElement>();
const draggedId = ref("");
const previewOrder = ref<string[]>([]);
const displayedWindows = computed(() => {
  if (!draggedId.value) return props.windows;
  const byId = new Map(props.windows.map((win) => [win.id, win]));
  return previewOrder.value.flatMap((id) => {
    const win = byId.get(id);
    return win ? [win] : [];
  });
});

const onDragEnd = () => {
  draggedId.value = "";
  previewOrder.value = [];
  document.removeEventListener("dragover", handleOutsideDragOver, true);
  document.removeEventListener("drop", handleOutsideDrop, true);
};

watch(
  () => props.windows.map((win) => win.id),
  (ids, previous) => {
    if (ids.length !== previous.length || ids.some((id, index) => id !== previous[index]))
      onDragEnd();
  }
);
onBeforeUnmount(onDragEnd);

const savePreview = () => {
  if (!draggedId.value) return;
  const ids = [...previewOrder.value];
  onDragEnd();
  if (
    ids.length === props.windows.length &&
    ids.some((id, index) => id !== props.windows[index].id)
  )
    emit("reorder-windows", ids);
};

function handleOutsideDragOver(event: DragEvent) {
  if (!draggedId.value || windowsRow.value?.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleOutsideDrop(event: DragEvent) {
  if (!draggedId.value || windowsRow.value?.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
  savePreview();
}

const onDragStart = (id: string, event: DragEvent) => {
  if (props.windows.length < 2 || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  draggedId.value = id;
  previewOrder.value = props.windows.map((win) => win.id);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
  document.addEventListener("dragover", handleOutsideDragOver, true);
  document.addEventListener("drop", handleOutsideDrop, true);
};

const updatePreview = (event: DragEvent) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>(".taskbar__window-btn");
  const id = button?.dataset.windowId;
  if (!button || !id || id === draggedId.value) return;
  const from = previewOrder.value.indexOf(draggedId.value);
  const to = previewOrder.value.indexOf(id);
  const bounds = button.getBoundingClientRect();
  const after = event.clientX >= bounds.left + bounds.width / 2;
  if (from === -1 || to === -1 || from < to !== after) return;
  const ids = [...previewOrder.value];
  ids.splice(from, 1);
  ids.splice(to, 0, draggedId.value);
  previewOrder.value = ids;
};

const onDragOver = (event: DragEvent) => {
  if (!draggedId.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  updatePreview(event);

  const container = windowsRow.value;
  if (container && container.scrollWidth > container.clientWidth) {
    const bounds = container.getBoundingClientRect();
    if (event.clientX < bounds.left + 32) container.scrollLeft -= 20;
    else if (event.clientX > bounds.right - 32) container.scrollLeft += 20;
  }
};

const onDragLeave = (event: DragEvent) => {
  if (draggedId.value) event.stopPropagation();
};

const onDrop = (event: DragEvent) => {
  if (!draggedId.value) return;
  event.preventDefault();
  event.stopPropagation();
  updatePreview(event);
  savePreview();
};

const currentTime = ref("");
const currentDate = ref("");

const updateTime = () => {
  const now = new Date();
  currentTime.value = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  currentDate.value = now.toLocaleDateString([], { month: "short", day: "numeric" });
};

updateTime();
const timeTimer = window.setInterval(updateTime, 10000);
onBeforeUnmount(() => window.clearInterval(timeTimer));

const startMenuOpen = ref(false);

const toggleStartMenu = () => {
  startMenuOpen.value = !startMenuOpen.value;
  if (startMenuOpen.value) {
    emit("open-start-menu");
  }
};

const handleExitDesktop = () => {
  startMenuOpen.value = false;
  emit("exit-desktop");
};

const handleSwitchToNormalMode = () => {
  startMenuOpen.value = false;
  router.push("/");
};

const handleOpenUserInfo = () => {
  startMenuOpen.value = false;
  emit("open-user-info");
};

const handleAccountMenuClick = ({ key }: { key: string | number }) => {
  if (String(key) === "exit-desktop") {
    handleSwitchToNormalMode();
  } else if (String(key) === "logout") {
    handleExitDesktop();
  }
};

const appDrag = usePointerDrag<TaskbarApp>({
  previewClass: "desktop-app-drag-preview",
  scrollContainer: ".start-menu__apps",
  onDrop: (app, event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target?.closest(".desktop-icons, .start-menu-overlay")) return;
    startMenuOpen.value = false;
    emit("add-shortcut", app.id, event.clientX, event.clientY);
  }
});
const draggedAppId = appDrag.draggingId;

watch(startMenuOpen, (open) => {
  if (!open && draggedAppId.value) appDrag.cancelDrag();
});

const handleOpenApp = (id: string, event: MouseEvent) => {
  if (appDrag.suppressDragClick(event)) return;
  startMenuOpen.value = false;
  emit("open-app", id);
};

const prepareAppDrag = (app: TaskbarApp, event: PointerEvent) => {
  appDrag.prepareDrag(event, { id: app.id, label: app.label, value: app });
};

const isComponentIcon = (icon: Component | string | undefined): icon is Component =>
  typeof icon !== "string" && Boolean(icon);
const isMdiIcon = (icon: Component | string | undefined): icon is `mdi-${string}` =>
  typeof icon === "string" && icon.startsWith("mdi-");

const handleContextMenu = (event: MouseEvent, win: TaskbarWindow) => {
  emit("contextmenu-window", event, win.id);
};
</script>

<template>
  <div class="desktop-taskbar">
    <VBtn
      class="taskbar__start"
      :class="{ 'taskbar__start--active': startMenuOpen }"
      icon
      variant="text"
      :aria-label="t('TXT_CODE_UI_START_MENU')"
      @click="toggleStartMenu"
    >
      <span class="taskbar__start-icon">
        <img :src="startButtonIconUrl" alt="" />
      </span>
    </VBtn>

    <div
      ref="windowsRow"
      class="taskbar__windows"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <TransitionGroup name="taskbar-window-list">
        <VBtn
          v-for="win in displayedWindows"
          :key="win.id"
          :data-window-id="win.id"
          class="taskbar__window-btn"
          variant="text"
          :class="{
            'taskbar__window-btn--active': win.active,
            'taskbar__window-btn--dragging': draggedId === win.id
          }"
          :draggable="windows.length > 1"
          @dragstart.stop="onDragStart(win.id, $event)"
          @dragend.stop="onDragEnd"
          @click="emit('toggle-window', win.id)"
          @contextmenu.stop.prevent="handleContextMenu($event, win)"
        >
          <span class="taskbar__window-icon">
            <component :is="win.icon" v-if="isComponentIcon(win.icon)" />
            <VIcon v-else-if="isMdiIcon(win.icon)" :icon="win.icon" size="small" />
            <img
              v-else-if="typeof win.icon === 'string' && win.icon.endsWith('.svg')"
              :src="win.icon"
              alt="icon"
            />
            <template v-else>{{ win.icon }}</template>
          </span>
          <span class="taskbar__window-title">{{ win.title }}</span>
        </VBtn>
      </TransitionGroup>
    </div>

    <div class="taskbar__tray">
      <div class="taskbar__actions">
        <template v-for="entry in slotActions" :key="entry.id">
          <div class="taskbar__action">
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
                icon
                size="x-small"
                variant="text"
                :aria-label="actionTitle(entry.action)"
                :title="actionTitle(entry.action)"
                @click="(entry.action.desktopClick ?? entry.action.click)()"
              >
                <VIcon :icon="actionIcon(entry.action)" size="small" />
              </VBtn>
            </VBadge>
            <ActionRipple :trigger="actionRipple(entry.action)" inline />
          </div>
        </template>
        <component
          :is="entry.component"
          v-for="entry in slotComponents"
          :key="entry.id"
          v-bind="{ ...entry.props, mobile: false }"
        />
      </div>

      <div class="taskbar__time">
        <div class="taskbar__time-text">{{ currentTime }}</div>
        <div class="taskbar__date-text">{{ currentDate }}</div>
      </div>
    </div>
  </div>

  <div v-if="startMenuOpen" class="start-menu-overlay" @click="startMenuOpen = false"></div>

  <Transition name="start-menu">
    <div v-if="startMenuOpen" class="taskbar__start-menu" @click.stop>
      <div class="start-menu__sidebar">
        <VBtn
          class="start-menu__function-btn"
          icon
          variant="text"
          :title="username"
          @click="handleOpenUserInfo"
        >
          <component :is="userAvatar" v-if="isComponentIcon(userAvatar)" />
          <VIcon v-else-if="isMdiIcon(userAvatar)" :icon="userAvatar" size="small" />
          <VIcon v-else icon="mdi-account-outline" size="small" />
        </VBtn>
        <div class="start-menu__sidebar-spacer"></div>
        <VBtn
          class="start-menu__function-btn"
          icon
          variant="text"
          :aria-label="themeTitle"
          :title="themeTitle"
          @click="cycleTheme"
        >
          <VIcon :icon="themeIcon" size="small" />
        </VBtn>
        <VMenu location="top end">
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              class="start-menu__function-btn"
              icon
              variant="text"
              :aria-label="t('TXT_CODE_UI_ACCOUNT')"
            >
              <VIcon icon="mdi-logout" size="small" />
            </VBtn>
          </template>
          <VList>
            <VListItem @click="handleAccountMenuClick({ key: 'exit-desktop' })">
              {{ t("TXT_CODE_DESKTOP_EXIT") }}
            </VListItem>
            <VListItem @click="handleAccountMenuClick({ key: 'logout' })">
              {{ t("TXT_CODE_COMMON_LOGOUT") }}
            </VListItem>
          </VList>
        </VMenu>
      </div>
      <div class="start-menu__apps-panel">
        <div class="start-menu__apps">
          <div
            v-for="app in apps"
            :key="app.id"
            class="start-menu__item start-menu__app-item"
            :class="{ 'start-menu__app-item--dragging': draggedAppId === app.id }"
            draggable="false"
            @pointerdown="prepareAppDrag(app, $event)"
            @dragstart.prevent
            @click="handleOpenApp(app.id, $event)"
          >
            <span class="start-menu__item-icon">
              <component :is="app.icon" v-if="isComponentIcon(app.icon)" />
              <VIcon v-else-if="isMdiIcon(app.icon)" :icon="app.icon" size="small" />
              <img
                v-else-if="typeof app.icon === 'string' && app.icon.endsWith('.svg')"
                :src="app.icon"
                alt="icon"
              />
              <template v-else>{{ app.icon }}</template>
            </span>
            <span>{{ app.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.desktop-taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: var(--desktop-taskbar-bg);
  display: flex;
  align-items: center;
  z-index: 99999;
  border-radius: 0;
  padding: 0 4px;
  user-select: none;
}

.taskbar__start {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
  color: var(--desktop-taskbar-text-active);
  margin-left: 2px;
  margin-right: 4px;

  &:hover {
    background-color: var(--desktop-taskbar-btn-hover);
  }

  &--active {
    background-color: var(--desktop-taskbar-btn-active) !important;
  }

  &-icon {
    display: flex;
    align-items: center;

    img {
      width: 20px;
      height: 20px;
      object-fit: contain;
    }
  }
}

.taskbar__start-menu {
  position: fixed;
  bottom: 56px;
  left: 8px;
  width: 420px;
  height: 360px;
  display: flex;
  background: var(--desktop-start-menu-bg);
  border-radius: 12px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--desktop-menu-shadow) 40%, transparent);
  z-index: 100000;
  overflow: hidden;
  color: var(--desktop-menu-text);

  .start-menu__sidebar {
    width: 56px;
    flex: 0 0 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 6px;
    background: var(--desktop-start-menu-bg);
    border-right: none;
  }

  .start-menu__sidebar-spacer {
    flex: 1;
  }

  .start-menu__function-btn {
    width: 32px;
    height: 32px;
    margin: 3px 0;
    border: 0;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desktop-menu-text);
    background: transparent;
    cursor: pointer;
    font-size: 16px;

    &:hover {
      background: var(--desktop-menu-hover);
    }
  }

  .start-menu__apps-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .start-menu__apps {
    flex: 1;
    overflow-y: auto;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .start-menu__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    cursor: pointer;
    border-radius: 8px;
    font-size: 13px;
    transition: background-color 0.15s;

    &:hover {
      background-color: var(--desktop-menu-hover);
    }

    &-icon {
      font-size: 16px;
      display: flex;
      align-items: center;
      color: var(--desktop-menu-text);

      img {
        width: 16px;
        height: 16px;
        object-fit: contain;
      }
    }
  }

  .start-menu__app-item {
    cursor: grab;
    user-select: none;

    &--dragging {
      cursor: grabbing;
    }
  }
}

.start-menu-enter-active,
.start-menu-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.start-menu-enter-from,
.start-menu-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.start-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 99998;
}

.taskbar__windows {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
}

.taskbar__window-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  min-width: 0;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  color: var(--desktop-taskbar-text);
  white-space: nowrap;
  max-width: 180px;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;

  :deep(.v-btn__content) {
    display: flex;
    min-width: 0;
    gap: 6px;
  }

  &:hover {
    background-color: var(--desktop-taskbar-btn-hover);
    color: var(--desktop-taskbar-text-active);
  }

  &--active {
    background-color: var(--desktop-taskbar-btn-active);
    color: var(--desktop-taskbar-text-active);
  }

  &--dragging {
    opacity: 0.4;
    cursor: grabbing;
  }
}

.taskbar__window-icon {
  font-size: 14px;
  display: flex;
  align-items: center;
  pointer-events: none;

  img {
    width: 14px;
    height: 14px;
  }
}

.taskbar__window-title {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  pointer-events: none;
}

.taskbar__tray {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  margin-left: auto;
}

.taskbar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 12px;
}

.taskbar__action {
  position: relative;
  display: inline-flex;
}

.taskbar__time {
  text-align: right;
  color: var(--desktop-taskbar-text-active);

  &-text {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
  }
}

.taskbar__date-text {
  font-size: 10px;
  opacity: 0.7;
  line-height: 1.3;
}

.taskbar-window-list-enter-active,
.taskbar-window-list-leave-active {
  transition: all 0.3s ease;
}

.taskbar-window-list-enter-from,
.taskbar-window-list-leave-to {
  opacity: 0;
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  margin-left: 0;
  margin-right: 0;
}

.taskbar-window-list-move {
  transition: transform 0.16s ease;
}

@media (prefers-reduced-motion: reduce) {
  .taskbar-window-list-move {
    transition: none;
  }
}
</style>
