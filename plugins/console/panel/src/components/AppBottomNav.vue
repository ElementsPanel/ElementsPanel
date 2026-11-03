<script setup lang="ts">
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { useElementSize, useLocalStorage, useTimeoutFn, useWindowSize } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { VIcon } from "vuetify/components";

const route = useRoute();
const { menus, handleToPage } = useHeaderMenus();
const isExpanded = ref(false);
const isDragging = ref(false);
const isIdle = ref(false);
const menuPanel = ref<HTMLElement>();
const { width: viewportWidth, height: viewportHeight } = useWindowSize();
const { width: panelWidth, height: panelHeight } = useElementSize(menuPanel, undefined, {
  box: "border-box"
});

const BALL_SIZE = 56;
const DRAG_THRESHOLD = 5;
const PANEL_GAP = 10;
const VIEWPORT_PADDING = 8;

const defaultTop = viewportHeight.value * 0.7 - BALL_SIZE;
const savedPosition = useLocalStorage("app-floating-navigation-position", {
  left: false,
  top: defaultTop
});
const position = ref({
  x: viewportWidth.value - BALL_SIZE - VIEWPORT_PADDING,
  y: Number.isFinite(savedPosition.value?.top) ? savedPosition.value.top : defaultTop
});
const dockedToLeft = ref(savedPosition.value?.left === true);
let dragStart: {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
} | undefined;
let suppressClick = false;
const { start: restartIdleTimer, stop: stopIdleTimer } = useTimeoutFn(
  () => { isIdle.value = true; },
  5000,
  { immediate: false }
);

const wakeBall = () => {
  isIdle.value = false;
  if (!isExpanded.value && !dragStart) restartIdleTimer();
};

watch(
  [isExpanded, isDragging],
  ([expanded, dragging]) => {
    isIdle.value = false;
    if (expanded || dragging || dragStart) stopIdleTimer();
    else restartIdleTimer();
  },
  { immediate: true }
);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const fitPosition = (x: number, y: number) => ({
  x: clamp(x, VIEWPORT_PADDING, viewportWidth.value - BALL_SIZE - VIEWPORT_PADDING),
  y: clamp(y, VIEWPORT_PADDING, viewportHeight.value - BALL_SIZE - VIEWPORT_PADDING)
});

const dockedX = () =>
  dockedToLeft.value ? VIEWPORT_PADDING : viewportWidth.value - BALL_SIZE - VIEWPORT_PADDING;

watch(
  [viewportWidth, viewportHeight],
  () => {
    position.value = fitPosition(dragStart ? position.value.x : dockedX(), position.value.y);
  },
  { immediate: true }
);

// Position the panel independently so opening it never changes the ball's anchor.
const panelStyle = computed(() => {
  const columns = Math.max(1, Math.min(3, menus.value.length));
  const fallbackWidth = columns * 52 + (columns - 1) * 6 + 20;
  const width = Math.min(panelWidth.value || fallbackWidth, viewportWidth.value - VIEWPORT_PADDING * 2);
  const openToLeft = position.value.x + BALL_SIZE / 2 > viewportWidth.value / 2;
  let left = openToLeft
    ? position.value.x - width - PANEL_GAP
    : position.value.x + BALL_SIZE + PANEL_GAP;
  let top = position.value.y + (BALL_SIZE - panelHeight.value) / 2;
  let maxHeight = viewportHeight.value - VIEWPORT_PADDING * 2;
  let transformOrigin = openToLeft ? "right center" : "left center";

  if (left < VIEWPORT_PADDING || left + width > viewportWidth.value - VIEWPORT_PADDING) {
    const spaceAbove = position.value.y - VIEWPORT_PADDING;
    const spaceBelow = viewportHeight.value - position.value.y - BALL_SIZE - VIEWPORT_PADDING;
    const openBelow = spaceBelow >= spaceAbove;
    maxHeight = Math.max(0, (openBelow ? spaceBelow : spaceAbove) - PANEL_GAP);
    left = position.value.x + (BALL_SIZE - width) / 2;
    top = openBelow
      ? position.value.y + BALL_SIZE + PANEL_GAP
      : position.value.y - Math.min(panelHeight.value, maxHeight) - PANEL_GAP;
    transformOrigin = openBelow ? "center top" : "center bottom";
  }

  return {
    left: `${clamp(left, VIEWPORT_PADDING, viewportWidth.value - width - VIEWPORT_PADDING)}px`,
    top: `${clamp(
      top,
      VIEWPORT_PADDING,
      viewportHeight.value - Math.min(panelHeight.value, maxHeight) - VIEWPORT_PADDING
    )}px`,
    maxHeight: `${maxHeight}px`,
    gridTemplateColumns: `repeat(${columns}, 52px)`,
    transformOrigin
  };
});

const onPointerDown = (event: PointerEvent) => {
  if (!event.isPrimary || event.button !== 0 || dragStart) return;
  wakeBall();
  stopIdleTimer();
  suppressClick = false;
  dragStart = {
    pointerId: event.pointerId,
    pointerX: event.clientX,
    pointerY: event.clientY,
    ...position.value
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const onPointerMove = (event: PointerEvent) => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  const dx = event.clientX - dragStart.pointerX;
  const dy = event.clientY - dragStart.pointerY;
  if (!isDragging.value && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

  isDragging.value = true;
  suppressClick = true;
  position.value = fitPosition(dragStart.x + dx, dragStart.y + dy);
  event.preventDefault();
};

const onPointerEnd = (event: PointerEvent) => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  if (event.type === "pointerup") onPointerMove(event);
  else suppressClick = true;
  if (isDragging.value) {
    dockedToLeft.value = position.value.x + BALL_SIZE / 2 < viewportWidth.value / 2;
    position.value = fitPosition(dockedX(), position.value.y);
    savedPosition.value = { left: dockedToLeft.value, top: position.value.y };
  }
  dragStart = undefined;
  isDragging.value = false;
  if (!isExpanded.value) restartIdleTimer();
  const ball = event.currentTarget as HTMLElement;
  if (ball.hasPointerCapture(event.pointerId)) ball.releasePointerCapture(event.pointerId);
};

const routePathIcons: Record<string, string> = {
  "/instances": "mdi-view-grid",
  "/users": "mdi-account-group-outline",
  "/customer": "mdi-account-outline",
  "/login": "mdi-login"
};

const getRouteIcon = (item: (typeof menus.value)[number]): string =>
  (item.meta.icon as string) ?? routePathIcons[item.path] ?? "mdi-menu";

const isActive = (path: string): boolean => {
  if (route.path === path) return true;
  if (path === "/") return false;
  return route.path.startsWith(path + "/");
};

const toggleMenu = (event: MouseEvent) => {
  wakeBall();
  if (suppressClick && event.detail > 0) {
    suppressClick = false;
    return;
  }
  suppressClick = false;
  isExpanded.value = !isExpanded.value;
};

const handleMenuItemClick = (path: string) => {
  handleToPage(path);
  isExpanded.value = false;
};
</script>

<template>
  <Transition name="fab-backdrop">
    <div v-if="isExpanded" class="fab-backdrop" @click="isExpanded = false" />
  </Transition>

  <div
    class="fab-container"
    :class="{ 'fab-container--dragging': isDragging }"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <Transition name="fab-panel">
      <div
        v-if="isExpanded"
        id="app-floating-navigation"
        ref="menuPanel"
        class="fab-menu-panel"
        :style="panelStyle"
      >
        <button
          v-for="item in menus"
          :key="item.path"
          type="button"
          class="fab-menu-item"
          :class="{ 'fab-menu-item--active': isActive(item.path) }"
          @click="handleMenuItemClick(item.path)"
        >
          <span class="fab-menu-icon-wrap">
            <VIcon :icon="getRouteIcon(item)" class="fab-menu-icon" />
          </span>
        </button>
      </div>
    </Transition>

    <button
      type="button"
      aria-label="Toggle navigation menu"
      aria-controls="app-floating-navigation"
      :aria-expanded="isExpanded"
      class="fab-ball"
      :class="{
        'fab-ball--expanded': isExpanded,
        'fab-ball--dragging': isDragging,
        'fab-ball--idle': isIdle,
        'fab-ball--left': dockedToLeft
      }"
      @pointerenter="wakeBall"
      @focus="wakeBall"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @lostpointercapture="onPointerEnd"
      @click="toggleMenu"
    >
      <Transition name="fab-icon" mode="out-in">
        <VIcon v-if="isExpanded" icon="mdi-close" class="fab-ball-icon" />
        <VIcon v-else icon="mdi-menu" class="fab-ball-icon" />
      </Transition>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.fab-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1001;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(2px);
}

.fab-container {
  position: fixed;
  z-index: 1002;
  width: 56px;
  height: 56px;
  pointer-events: none;
  transition: left 0.18s ease-out;

  > * {
    pointer-events: auto;
  }
}

.fab-container--dragging {
  transition: none;
}

// ---- Menu Panel ----

.fab-menu-panel {
  position: fixed;
  display: grid;
  grid-auto-rows: 52px;
  gap: 6px;
  padding: 10px;
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  border-radius: 18px;
  background: var(--bottom-nav-background-color);
  backdrop-filter: blur(12px);
  box-shadow:
    0 8px 32px var(--card-shadow-extend-color),
    0 2px 8px var(--card-shadow-color);
}

.fab-menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.fab-menu-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  transition: all 0.2s ease;

  .fab-menu-icon {
    font-size: 20px;
    color: var(--color-gray-7);
    transition: all 0.2s ease;
  }
}

.fab-menu-item--active .fab-menu-icon-wrap {
  background: var(--bottom-nav-background-color-hover);

  .fab-menu-icon {
    font-size: 22px;
    color: var(--color-gray-13);
  }
}

.fab-menu-item:not(.fab-menu-item--active):hover .fab-menu-icon-wrap {
  background: var(--bottom-nav-background-color-hover);
  opacity: 0.7;
}

.fab-menu-item:active .fab-menu-icon-wrap {
  transform: scale(0.88);
}

// ---- Floating Ball ----

.fab-ball {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  cursor: grab;
  touch-action: none;
  user-select: none;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bottom-nav-background-color);
  backdrop-filter: blur(12px);
  box-shadow:
    0 8px 24px var(--card-shadow-extend-color),
    0 2px 8px var(--card-shadow-color);
  transition:
    transform 0.18s ease-out,
    opacity 0.18s ease-out,
    box-shadow 0.22s ease;
  -webkit-tap-highlight-color: transparent;
}

.fab-ball:hover {
  box-shadow:
    0 12px 32px var(--card-shadow-extend-color),
    0 4px 12px var(--card-shadow-color);
}

.fab-ball--dragging {
  cursor: grabbing;
  transition: none;
}

.fab-ball--idle {
  transform: translateX(36px);
  opacity: 0.5;
}

.fab-ball--idle.fab-ball--left {
  transform: translateX(-36px);
}

.fab-ball--expanded {
  box-shadow:
    0 12px 32px var(--card-shadow-extend-color),
    0 4px 12px var(--card-shadow-color);
}

.fab-ball-icon {
  font-size: 20px;
  color: var(--color-gray-10);
}

// ---- Transitions ----

.fab-backdrop-enter-active,
.fab-backdrop-leave-active {
  transition: opacity 0.25s ease;
}

.fab-backdrop-enter-from,
.fab-backdrop-leave-to {
  opacity: 0;
}

.fab-panel-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.fab-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.fab-panel-enter-from,
.fab-panel-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(12px);
}

.fab-icon-enter-active,
.fab-icon-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fab-icon-enter-from {
  opacity: 0;
  transform: rotate(-90deg) scale(0.6);
}

.fab-icon-leave-to {
  opacity: 0;
  transform: rotate(90deg) scale(0.6);
}

@media (prefers-reduced-motion: reduce) {
  .fab-container,
  .fab-ball {
    transition: none;
  }
}
</style>
