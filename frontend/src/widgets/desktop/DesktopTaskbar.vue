<script setup lang="ts">
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { AppTheme } from "@/types/const";
import {
    AppstoreOutlined,
    BgColorsOutlined,
    LogoutOutlined,
    UserOutlined
} from "@ant-design/icons-vue";
import { ref, type Component } from "vue";

const { currentTheme, isDarkTheme, setTheme } = useAppConfigStore();

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
}>();

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

const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

const onDragStart = (index: number, event: DragEvent) => {
    draggedIndex.value = index;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", index.toString());
    }
};

const onDragOver = (index: number, event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
    if (draggedIndex.value === null || draggedIndex.value === index) return;
    dragOverIndex.value = index;
};

const onDrop = (index: number, event: DragEvent) => {
    event.preventDefault();
    if (draggedIndex.value === null || draggedIndex.value === index) {
        draggedIndex.value = null;
        dragOverIndex.value = null;
        return;
    }

    const newWindows = [...props.windows];
    const [draggedItem] = newWindows.splice(draggedIndex.value, 1);
    newWindows.splice(index, 0, draggedItem);

    emit("reorder-windows", newWindows.map(w => w.id));

    draggedIndex.value = null;
    dragOverIndex.value = null;
};

const onDragEnd = () => {
    draggedIndex.value = null;
    dragOverIndex.value = null;
};

const currentTime = ref("");
const currentDate = ref("");

const updateTime = () => {
    const now = new Date();
    currentTime.value = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    currentDate.value = now.toLocaleDateString([], { month: "short", day: "numeric" });
};

updateTime();
setInterval(updateTime, 10000);

const startMenuOpen = ref(false);

const toggleStartMenu = () => {
    startMenuOpen.value = !startMenuOpen.value; if (startMenuOpen.value) {
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

const handleThemeMenuClick = ({ key }: { key: string | number }) => {
    setTheme(Number(key) as AppTheme);
};

const handleOpenApp = (id: string) => {
    startMenuOpen.value = false;
    emit("open-app", id);
};

const handleAppDragStart = (app: TaskbarApp, event: DragEvent) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-elements-desktop-app", app.id);
    event.dataTransfer.setData("text/plain", app.id);
};

const handleAppDrop = (event: DragEvent) => {
    const appId = event.dataTransfer?.getData("application/x-elements-desktop-app")
        || event.dataTransfer?.getData("text/plain");
    if (!appId) return;
    startMenuOpen.value = false;
    emit("add-shortcut", appId, event.clientX, event.clientY);
};

const isComponentIcon = (icon: Component | string): boolean => typeof icon !== "string";

const handleContextMenu = (event: MouseEvent, win: TaskbarWindow) => {
    emit("contextmenu-window", event, win.id);
};
</script>

<template>
    <div class="desktop-taskbar">
        <div class="taskbar__start" :class="{ 'taskbar__start--active': startMenuOpen }" @click="toggleStartMenu">
            <span class="taskbar__start-icon">
                <img :src="isDarkTheme ? '/desktop-icon.svg' : '/desktop-icon-b.svg'" alt="Start" />
            </span>
        </div>

        <Transition name="start-menu">
            <div v-if="startMenuOpen" class="taskbar__start-menu" @click.stop>
                <div class="start-menu__sidebar">
                    <button class="start-menu__function-btn" type="button" :title="username"
                        @click="handleOpenUserInfo"><UserOutlined /></button>
                    <div class="start-menu__sidebar-spacer"></div>
                    <a-dropdown placement="topRight">
                        <button class="start-menu__function-btn" type="button" :title="t('TXT_CODE_5d88a9b')"
                            @click.prevent>
                            <BgColorsOutlined />
                        </button>
                        <template #overlay>
                            <a-menu :selected-keys="[String(currentTheme)]" @click="handleThemeMenuClick">
                                <a-menu-item :key="AppTheme.AUTO">{{ t("TXT_CODE_dc8de4ff") }}</a-menu-item>
                                <a-menu-item :key="AppTheme.LIGHT">{{ t("TXT_CODE_673eac8e") }}</a-menu-item>
                                <a-menu-item :key="AppTheme.DARK">{{ t("TXT_CODE_5e4a370d") }}</a-menu-item>
                            </a-menu>
                        </template>
                    </a-dropdown>
                    <button class="start-menu__function-btn" type="button" :title="t('TXT_CODE_DESKTOP_EXIT')"
                        @click="handleSwitchToNormalMode"><AppstoreOutlined /></button>
                    <button class="start-menu__function-btn" type="button" :title="t('TXT_CODE_2c69ab15')"
                        @click="handleExitDesktop"><LogoutOutlined /></button>
                </div>
                <div class="start-menu__apps-panel">
                    <div class="start-menu__apps">
                        <div v-for="app in apps" :key="app.id" class="start-menu__item start-menu__app-item"
                            draggable="true" @dragstart="handleAppDragStart(app, $event)" @click="handleOpenApp(app.id)">
                            <span class="start-menu__item-icon">
                                <component :is="app.icon" v-if="isComponentIcon(app.icon)" />
                                <img v-else-if="typeof app.icon === 'string' && app.icon.endsWith('.svg')" :src="app.icon"
                                    alt="icon" />
                                <template v-else>{{ app.icon }}</template>
                            </span>
                            <span>{{ app.label }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <div class="taskbar__windows">
            <TransitionGroup name="taskbar-window-list">
                <div v-for="(win, index) in windows" :key="win.id" class="taskbar__window-btn" :class="{
                    'taskbar__window-btn--active': win.active,
                    'taskbar__window-btn--dragging': draggedIndex === index,
                    'taskbar__window-btn--drag-over-left': dragOverIndex === index && draggedIndex !== null && draggedIndex > index,
                    'taskbar__window-btn--drag-over-right': dragOverIndex === index && draggedIndex !== null && draggedIndex < index
                }" draggable="true" @dragstart="onDragStart(index, $event)" @dragover="onDragOver(index, $event)"
                    @drop="onDrop(index, $event)" @dragend="onDragEnd" @click="emit('toggle-window', win.id)"
                    @contextmenu.stop.prevent="handleContextMenu($event, win)">
                    <span class="taskbar__window-icon">
                        <component :is="win.icon" v-if="isComponentIcon(win.icon)" />
                        <img v-else-if="typeof win.icon === 'string' && win.icon.endsWith('.svg')" :src="win.icon"
                            alt="icon" />
                        <template v-else>{{ win.icon }}</template>
                    </span>
                    <span class="taskbar__window-title">{{ win.title }}</span>
                </div>
            </TransitionGroup>
        </div>

        <div class="taskbar__tray">
            <div class="taskbar__time">
                <div class="taskbar__time-text">{{ currentTime }}</div>
                <div class="taskbar__date-text">{{ currentDate }}</div>
            </div>
        </div>
    </div>

    <div v-if="startMenuOpen" class="start-menu-overlay" @click="startMenuOpen = false" @dragover.prevent
        @drop.prevent="handleAppDrop"></div>
</template>

<style lang="scss" scoped>
.desktop-taskbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 48px;
    background: var(--desktop-taskbar-bg);
    backdrop-filter: saturate(180%) blur(20px);
    display: flex;
    align-items: center;
    z-index: 99999;
    border-top: 1px solid var(--desktop-taskbar-border);
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
    backdrop-filter: saturate(180%) blur(24px);
    border-radius: 12px;
    border: 1px solid var(--desktop-menu-border);
    box-shadow: 0 8px 32px var(--desktop-menu-shadow);
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
        border-right: 1px solid var(--desktop-menu-divider);
    }

    .start-menu__sidebar-spacer {
        flex: 1;
    }

    .start-menu__function-btn {
        width: 36px;
        height: 36px;
        margin: 3px 0;
        border: 0;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--desktop-menu-text);
        background: transparent;
        cursor: pointer;
        font-size: 17px;

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
        cursor: default;
    }
}

.start-menu-enter-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.start-menu-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.start-menu-enter-from {
    opacity: 0;
    transform: translateY(10px);
}

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
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 4px;

    &::-webkit-scrollbar {
        height: 0;
    }
}

.taskbar__window-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s;
    color: var(--desktop-taskbar-text);
    white-space: nowrap;
    max-width: 180px;
    font-size: 12px;

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
    }

    &--drag-over-left {
        box-shadow: -2px 0 0 0 var(--desktop-taskbar-drag-indicator);
    }

    &--drag-over-right {
        box-shadow: 2px 0 0 0 var(--desktop-taskbar-drag-indicator);
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
    transition: transform 0.3s ease;
}
</style>
