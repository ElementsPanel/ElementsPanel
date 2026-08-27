<script setup lang="ts">
import {
    CloseOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    MinusOutlined
} from "@ant-design/icons-vue";
import { computed, onMounted, onUnmounted, ref, type Component } from "vue";

export interface DesktopWindowProps {
    id: string;
    title: string;
    icon: Component | string;
    visible: boolean;
    minimized: boolean;
    maximized: boolean;
    active: boolean;
    initialX?: number;
    initialY?: number;
    initialWidth?: number;
    initialHeight?: number;
    zIndex?: number;
    showMinimize?: boolean;
    showMaximize?: boolean;
    showClose?: boolean;
    resizable?: boolean;
}

const props = withDefaults(defineProps<DesktopWindowProps>(), {
    initialX: 100,
    initialY: 60,
    initialWidth: 800,
    initialHeight: 500,
    zIndex: 100,
    showMinimize: true,
    showMaximize: true,
    showClose: true,
    resizable: true
});

const emit = defineEmits<{
    (e: "close", id: string): void;
    (e: "minimize", id: string): void;
    (e: "maximize", id: string): void;
    (e: "focus", id: string): void;
    (e: "moved", id: string, x: number, y: number): void;
    (e: "resized", id: string, x: number, y: number, width: number, height: number): void;
    (e: "contextmenu-titlebar", event: MouseEvent, id: string): void;
}>();

const x = ref(props.initialX);
const y = ref(props.initialY);
const width = ref(props.initialWidth);
const height = ref(props.initialHeight);

const isDragging = ref(false);
const isResizing = ref(false);
const resizeDirection = ref("");
const dragOffset = ref({ x: 0, y: 0 });
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0, winX: 0, winY: 0 });

const savedPos = ref({ x: props.initialX, y: props.initialY, w: props.initialWidth, h: props.initialHeight });

const isComponentIcon = computed(() => typeof props.icon !== "string");

const windowStyle = computed(() => {
    if (props.maximized) {
        return {
            left: "0px",
            top: "0px",
            width: "100vw",
            height: "calc(100vh - 48px)",
            zIndex: props.zIndex,
            borderRadius: "0px"
        };
    }
    return {
        left: `${x.value}px`,
        top: `${y.value}px`,
        width: `${width.value}px`,
        height: `${height.value}px`,
        zIndex: props.zIndex,
        borderRadius: "10px"
    };
});

const DRAG_THRESHOLD = 20;

const isDragThresholdMet = ref(false);
const dragStartPos = ref({ x: 0, y: 0 });

const onMouseDownTitlebar = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (props.maximized) {
        dragStartPos.value = { x: e.clientX, y: e.clientY };
        isDragThresholdMet.value = false;
        isDragging.value = true;
        dragOffset.value = { x: 0, y: 0 };
    } else {
        isDragging.value = true;
        dragOffset.value = {
            x: e.clientX - x.value,
            y: e.clientY - y.value
        };
    }
    emit("focus", props.id);
    e.preventDefault();
};

const isOutsideBrowser = (e: MouseEvent) => {
    return e.clientX <= 0 || e.clientX >= window.innerWidth - 1 ||
        e.clientY <= 0 || e.clientY >= window.innerHeight - 1;
};

const onMouseMove = (e: MouseEvent) => {
    if (isOutsideBrowser(e)) {
        if (isDragging.value || isResizing.value) {
            onMouseUp();
        }
        return;
    }

    if (isDragging.value && props.maximized && !isDragThresholdMet.value) {
        const dx = e.clientX - dragStartPos.value.x;
        const dy = e.clientY - dragStartPos.value.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= DRAG_THRESHOLD) {
            isDragThresholdMet.value = true;

            const restoredW = Math.min(savedPos.value.w, window.innerWidth - 40);
            const restoredH = Math.min(savedPos.value.h, window.innerHeight - 100);
            const titlebarHeight = 38;
            const restoredX = Math.max(0, Math.min(e.clientX - restoredW * 0.15, window.innerWidth - restoredW - 10));
            const restoredY = Math.max(0, Math.min(e.clientY - titlebarHeight * 0.5, window.innerHeight - restoredH - 60));

            x.value = restoredX;
            y.value = restoredY;
            width.value = restoredW;
            height.value = restoredH;

            savedPos.value = { x: restoredX, y: restoredY, w: restoredW, h: restoredH };

            emit("maximize", props.id);

            dragOffset.value = {
                x: e.clientX - restoredX,
                y: e.clientY - restoredY
            };
        }
        return;
    }

    if (isDragging.value) {
        x.value = e.clientX - dragOffset.value.x;
        y.value = e.clientY - dragOffset.value.y;
    }
    if (isResizing.value && props.resizable) {
        const dx = e.clientX - resizeStart.value.x;
        const dy = e.clientY - resizeStart.value.y;

        let newWidth = resizeStart.value.w;
        let newHeight = resizeStart.value.h;
        let newX = resizeStart.value.winX;
        let newY = resizeStart.value.winY;

        if (resizeDirection.value.includes('e')) {
            newWidth = Math.max(400, resizeStart.value.w + dx);
        }
        if (resizeDirection.value.includes('s')) {
            newHeight = Math.max(300, resizeStart.value.h + dy);
        }
        if (resizeDirection.value.includes('w')) {
            newWidth = Math.max(400, resizeStart.value.w - dx);
            newX = resizeStart.value.winX + (resizeStart.value.w - newWidth);
        }
        if (resizeDirection.value.includes('n')) {
            newHeight = Math.max(300, resizeStart.value.h - dy);
            newY = resizeStart.value.winY + (resizeStart.value.h - newHeight);
        }

        width.value = newWidth;
        height.value = newHeight;
        x.value = newX;
        y.value = newY;
    }
};

const onMouseUp = () => {
    if (isDragging.value) {
        isDragging.value = false;
        emit("moved", props.id, x.value, y.value);
    }
    if (isResizing.value) {
        isResizing.value = false;
        emit("resized", props.id, x.value, y.value, width.value, height.value);
    }
};

const onResizeStart = (e: MouseEvent, dir: string) => {
    if (props.maximized || !props.resizable) return;
    isResizing.value = true;
    resizeDirection.value = dir;
    resizeStart.value = {
        x: e.clientX,
        y: e.clientY,
        w: width.value,
        h: height.value,
        winX: x.value,
        winY: y.value
    };
    emit("focus", props.id);
    e.preventDefault();
    e.stopPropagation();
};

const handleMaximize = () => {
    if (!props.showMaximize) return;
    if (!props.maximized) {
        savedPos.value = { x: x.value, y: y.value, w: width.value, h: height.value };
    } else {
        x.value = savedPos.value.x;
        y.value = savedPos.value.y;
        width.value = savedPos.value.w;
        height.value = savedPos.value.h;
    }
    emit("maximize", props.id);
};

const handleFocus = () => {
    emit("focus", props.id);
};

const onContextMenuTitlebar = (e: MouseEvent) => {
    emit("contextmenu-titlebar", e, props.id);
};

onMounted(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
    <div v-show="visible && !minimized" class="desktop-window" :class="{
        'desktop-window--active': active,
        'desktop-window--maximized': maximized,
        'desktop-window--dragging': isDragging,
        'desktop-window--resizing': isResizing
    }" :style="windowStyle" @mousedown="handleFocus">
        <div class="window__titlebar" @mousedown="onMouseDownTitlebar" @dblclick="handleMaximize"
            @contextmenu.stop.prevent="onContextMenuTitlebar">
            <div class="window__titlebar-left">
                <span class="window__icon">
                    <component :is="icon" v-if="isComponentIcon" />
                    <img v-else :src="icon as string" alt="icon" />
                </span>
                <span class="window__title">{{ title }}</span>
            </div>
            <div class="window__controls" @mousedown.stop>
                <div v-if="showMinimize" class="window__control window__control--minimize"
                    @click.stop="emit('minimize', id)">
                    <MinusOutlined />
                </div>
                <div v-if="showMaximize" class="window__control window__control--maximize" @click.stop="handleMaximize">
                    <FullscreenExitOutlined v-if="maximized" />
                    <FullscreenOutlined v-else />
                </div>
                <div v-if="showClose" class="window__control window__control--close" @click.stop="emit('close', id)">
                    <CloseOutlined />
                </div>
            </div>
        </div>

        <div class="window__content" @contextmenu.stop>
            <slot></slot>
        </div>

        <template v-if="!maximized && resizable">
            <div class="window__resize-handle window__resize-handle--nw" @mousedown="onResizeStart($event, 'nw')"></div>
            <div class="window__resize-handle window__resize-handle--ne" @mousedown="onResizeStart($event, 'ne')"></div>
            <div class="window__resize-handle window__resize-handle--sw" @mousedown="onResizeStart($event, 'sw')"></div>
            <div class="window__resize-handle window__resize-handle--se" @mousedown="onResizeStart($event, 'se')"></div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.desktop-window {
    position: fixed;
    background: var(--desktop-window-bg);
    backdrop-filter: saturate(180%) blur(20px);
    border: 1px solid var(--desktop-window-border);
    box-shadow: 0 8px 32px var(--desktop-window-shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: left 0.2s ease,
        top 0.2s ease,
        width 0.2s ease,
        height 0.2s ease,
        border-radius 0.2s ease,
        box-shadow 0.2s ease;

    &--active {
        border-color: var(--desktop-window-border);
        box-shadow: 0 12px 48px var(--desktop-window-shadow);
    }

    &--dragging,
    &--resizing {
        transition: none;
    }

    &--maximized {
        border: none;
    }
}

.window__titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 38px;
    padding: 0 8px 0 12px;
    background: var(--desktop-window-titlebar-bg);
    cursor: default;
    user-select: none;
    flex-shrink: 0;

    &-left {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
    }
}

.window__icon {
    font-size: 14px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--desktop-window-text);

    img {
        width: 14px;
        height: 14px;
    }
}

.window__title {
    font-size: 12px;
    color: var(--desktop-window-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.window__controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    transform: translateX(3px);
}

.window__control {
    width: 32px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    color: var(--desktop-window-text-secondary);
    font-size: 12px;
    transition: background-color 0.12s;

    &:hover {
        background-color: var(--desktop-window-control-hover);
        color: var(--desktop-window-text);
    }

    &--close:hover {
        background-color: var(--desktop-window-control-close-hover-bg);
        color: var(--desktop-window-control-close-hover-text);
    }
}

.window__content {
    flex: 1;
    overflow: auto;
    color: var(--desktop-window-text);
}

.window__resize-handle {
    position: absolute;
    width: 12px;
    height: 12px;
    z-index: 10;

    &--nw {
        top: 0;
        left: 0;
        cursor: nwse-resize;
    }

    &--ne {
        top: 0;
        right: 0;
        cursor: nesw-resize;
    }

    &--sw {
        bottom: 0;
        left: 0;
        cursor: nesw-resize;
    }

    &--se {
        bottom: 0;
        right: 0;
        cursor: nwse-resize;

        &::after {
            content: "";
            position: absolute;
            bottom: 3px;
            right: 3px;
            width: 8px;
            height: 8px;
            border-right: 2px solid var(--desktop-resize-handle-color);
            border-bottom: 2px solid var(--desktop-resize-handle-color);
        }
    }
}
</style>
