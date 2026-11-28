<script setup lang="ts">
import { VBtn, VDefaultsProvider, VIcon } from "vuetify/components";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Component
} from "vue";
import { provideDesktopWindowActivity } from "@elementspanel/epanel-plugin-console/hooks/useDesktopWindowActivity";
import { useWindowRendering } from "../../windowRendering";

export interface DesktopWindowProps {
  id: string;
  title: string;
  icon?: Component | string;
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
  transitioning?: boolean;
}

const props = withDefaults(defineProps<DesktopWindowProps>(), {
  icon: undefined,
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

// Keep menus outside the clipped frame but inside their owning window's stacking context.
const windowElement = ref<HTMLElement>();
const overlayDefaults = computed(() => ({
  VMenu: { attach: windowElement.value },
  VTooltip: { attach: windowElement.value }
}));

// Use display to avoid triggering the outer window transition group.
const renderWindow = ref(!props.minimized);
const isAnimatingVisibility = ref(false);
let visibilityAnimation: Animation | undefined;
let visibilityChangeId = 0;

const stopVisibilityAnimation = () => {
  visibilityChangeId++;
  if (visibilityAnimation) {
    visibilityAnimation.onfinish = null;
    visibilityAnimation.cancel();
    visibilityAnimation = undefined;
  }
  isAnimatingVisibility.value = false;
};

watch(
  () => [props.visible, props.minimized] as const,
  async ([visible, minimized], [wasVisible, wasMinimized]) => {
    const element = windowElement.value;
    const wasShown = renderWindow.value;
    const currentStyle =
      visibilityAnimation && element ? window.getComputedStyle(element) : undefined;
    const interruptedFrame = currentStyle
      ? {
          transform: currentStyle.transform,
          opacity: currentStyle.opacity,
          transformOrigin: "top left"
        }
      : undefined;
    stopVisibilityAnimation();
    const changeId = visibilityChangeId;

    if (
      !visible ||
      !wasVisible ||
      minimized === wasMinimized ||
      !element ||
      typeof element.animate !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (minimized && !wasShown) ||
      (!minimized && wasShown && !interruptedFrame)
    ) {
      renderWindow.value = !minimized;
      return;
    }

    // Keep the window mounted and visible until its trip to the taskbar ends.
    renderWindow.value = true;
    isAnimatingVisibility.value = true;
    await nextTick();
    if (changeId !== visibilityChangeId) return;
    if (!element.isConnected || !props.visible) {
      renderWindow.value = !minimized;
      isAnimatingVisibility.value = false;
      return;
    }

    const button = Array.from(
      document.querySelectorAll<HTMLElement>(".desktop-taskbar .taskbar__window-btn")
    ).find((item) => item.dataset.windowId === props.id);
    button?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const source = element.getBoundingClientRect();
    const target = button?.getBoundingClientRect();
    if (!target || !source.width || !source.height || !target.width || !target.height) {
      renderWindow.value = !minimized;
      isAnimatingVisibility.value = false;
      return;
    }

    const expandedFrame = {
      transform: "translate(0px, 0px) scale(1, 1)",
      opacity: 1,
      transformOrigin: "top left"
    };
    const minimizedFrame = {
      transform: `translate(${target.left - source.left}px, ${target.top - source.top}px) scale(${
        target.width / source.width
      }, ${target.height / source.height})`,
      opacity: 0,
      transformOrigin: "top left"
    };
    const animation = element.animate(
      minimized
        ? [interruptedFrame || expandedFrame, minimizedFrame]
        : [interruptedFrame || minimizedFrame, expandedFrame],
      { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" }
    );
    visibilityAnimation = animation;
    animation.onfinish = () => {
      if (visibilityAnimation !== animation) return;
      renderWindow.value = !minimized;
      void nextTick(() => {
        if (visibilityAnimation === animation) stopVisibilityAnimation();
      });
    };
  }
);

const TASKBAR_HEIGHT = 48;
interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const fitBounds = (bounds: WindowBounds): WindowBounds => {
  const availableWidth = Math.max(1, window.innerWidth);
  const availableHeight = Math.max(1, window.innerHeight - TASKBAR_HEIGHT);
  const fittedWidth = Math.min(
    Math.max(1, Number.isFinite(bounds.width) ? bounds.width : 800),
    availableWidth
  );
  const fittedHeight = Math.min(
    Math.max(1, Number.isFinite(bounds.height) ? bounds.height : 500),
    availableHeight
  );
  return {
    x: Math.max(
      0,
      Math.min(Number.isFinite(bounds.x) ? bounds.x : 0, availableWidth - fittedWidth)
    ),
    y: Math.max(
      0,
      Math.min(Number.isFinite(bounds.y) ? bounds.y : 0, availableHeight - fittedHeight)
    ),
    width: fittedWidth,
    height: fittedHeight
  };
};

// Fit restored and centered windows inside the screen before rendering.
const requestedBounds = {
  x: props.initialX,
  y: props.initialY,
  width: props.initialWidth,
  height: props.initialHeight
};
const initialBounds = fitBounds(requestedBounds);
const availableHeight = Math.max(1, window.innerHeight - TASKBAR_HEIGHT);
if (initialBounds.y >= availableHeight - initialBounds.height) {
  initialBounds.y = Math.min(16, Math.max(0, availableHeight - 1));
  initialBounds.height = Math.min(initialBounds.height, availableHeight - initialBounds.y);
}
const x = ref(initialBounds.x);
const y = ref(initialBounds.y);
const width = ref(initialBounds.width);
const height = ref(initialBounds.height);

const currentBounds = (): WindowBounds => ({
  x: x.value,
  y: y.value,
  width: width.value,
  height: height.value
});
const boundsDiffer = (a: WindowBounds, b: WindowBounds) =>
  a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
const setBounds = (bounds: WindowBounds) => {
  x.value = bounds.x;
  y.value = bounds.y;
  width.value = bounds.width;
  height.value = bounds.height;
};
const reportBounds = () => emit("resized", props.id, x.value, y.value, width.value, height.value);
const fitWindow = () => {
  const previous = currentBounds();
  const fitted = fitBounds(previous);
  if (!boundsDiffer(previous, fitted)) return;
  setBounds(fitted);
  reportBounds();
};

const isDragging = ref(false);
const isResizing = ref(false);
const isPointerSettling = ref(false);
let restoringFromDrag = false;
const rendering = useWindowRendering({
  bounds: () =>
    props.maximized
      ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight - TASKBAR_HEIGHT }
      : {
          left: x.value,
          top: y.value,
          right: x.value + width.value,
          bottom: y.value + height.value
        },
  visible: () => props.visible && renderWindow.value,
  zIndex: () => props.zIndex,
  maximized: () => props.maximized,
  interacting: () => isDragging.value || isResizing.value,
  animating: () => isAnimatingVisibility.value || !!props.transitioning,
  keepVisible: () =>
    !!windowElement.value?.querySelector(".v-overlay--active, .desktop-window") ||
    !!windowElement.value?.parentElement?.closest(".desktop-window")
});
const isRenderSuspended = rendering.suspended;
const scrollingElements = new Set<HTMLElement>();
const onWindowScroll = (event: Event) => {
  if (!isRenderSuspended.value && event.target instanceof HTMLElement)
    scrollingElements.add(event.target);
};
let savedScrollPositions: { element: HTMLElement; top: number; left: number }[] = [];
watch(
  isRenderSuspended,
  (suspended) => {
    if (suspended) {
      savedScrollPositions = [];
      const element = windowElement.value;
      for (const scroller of element?.querySelectorAll<HTMLElement>(
        ".window__content, .window-inner-content > *, .cm-scroller, .xterm-viewport"
      ) ?? [])
        scrollingElements.add(scroller);
      for (const element of scrollingElements) {
        if (!windowElement.value?.contains(element)) {
          scrollingElements.delete(element);
          continue;
        }
        if (element.scrollTop || element.scrollLeft)
          savedScrollPositions.push({ element, top: element.scrollTop, left: element.scrollLeft });
      }
    } else if (savedScrollPositions.length) {
      const positions = savedScrollPositions;
      savedScrollPositions = [];
      void nextTick(() => {
        for (const position of positions) {
          if (!position.element.isConnected) continue;
          position.element.scrollTop = position.top;
          position.element.scrollLeft = position.left;
        }
      });
    }
  },
  { flush: "pre" }
);
provideDesktopWindowActivity({
  visible: computed(() => props.visible && renderWindow.value && !isRenderSuspended.value),
  interacting: rendering.interacting
});
const resizeDirection = ref("");
const dragOffset = ref({ x: 0, y: 0 });
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0, winX: 0, winY: 0 });

const savedPos = ref({
  x: initialBounds.x,
  y: initialBounds.y,
  w: initialBounds.width,
  h: initialBounds.height
});

watch(
  () => [props.visible, props.minimized, props.maximized] as const,
  ([visible, minimized, maximized], [, , wasMaximized]) => {
    if (maximized !== wasMaximized) {
      if (activePointerId === undefined && !restoringFromDrag) cancelPointerSettling();
      restoringFromDrag = false;
    }
    if (!visible || minimized || (maximized && !wasMaximized)) finishPointerInteraction();
    if (maximized && !wasMaximized) {
      savedPos.value = { x: x.value, y: y.value, w: width.value, h: height.value };
    } else if (!maximized && wasMaximized) {
      const restored = fitBounds({
        x: savedPos.value.x,
        y: savedPos.value.y,
        width: savedPos.value.w,
        height: savedPos.value.h
      });
      setBounds(restored);
      reportBounds();
    }
    if (visible && !minimized && !maximized) fitWindow();
  },
  { flush: "sync" }
);

const onViewportResize = () => {
  finishPointerInteraction();
  fitWindow();
  const saved = fitBounds({
    x: savedPos.value.x,
    y: savedPos.value.y,
    width: savedPos.value.w,
    height: savedPos.value.h
  });
  savedPos.value = { x: saved.x, y: saved.y, w: saved.width, h: saved.height };
};

const isComponentIcon = computed(() => typeof props.icon !== "string");
const isMdiIcon = computed(() => typeof props.icon === "string" && props.icon.startsWith("mdi-"));

const windowStyle = computed(() => {
  if (props.maximized) {
    return {
      left: "0px",
      top: "0px",
      width: "100vw",
      height: `max(1px, calc(100vh - ${TASKBAR_HEIGHT}px))`,
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
let activePointerId: number | undefined;
let pointerElement: HTMLElement | undefined;
let pointerFrame: number | undefined;
let pendingPointerMove: PointerEvent | undefined;
let dragPosition: { x: number; y: number } | undefined;
let settlingFrame: number | undefined;
let settlingId = 0;

const cancelPointerSettling = () => {
  settlingId++;
  if (settlingFrame !== undefined) cancelAnimationFrame(settlingFrame);
  settlingFrame = undefined;
  if (isPointerSettling.value) windowElement.value?.classList.remove("desktop-window--settling");
  isPointerSettling.value = false;
};

const settlePointerPosition = () => {
  cancelPointerSettling();
  isPointerSettling.value = true;
  const id = settlingId;
  void nextTick(() => {
    if (id !== settlingId) return;
    // Paint committed bounds once before restoring geometry transitions.
    settlingFrame = requestAnimationFrame(() => {
      if (id !== settlingId) return;
      settlingFrame = requestAnimationFrame(() => {
        if (id !== settlingId) return;
        settlingFrame = undefined;
        isPointerSettling.value = false;
      });
    });
  });
};

const startPointerInteraction = (e: PointerEvent) => {
  cancelPointerSettling();
  restoringFromDrag = false;
  activePointerId = e.pointerId;
  const element = e.currentTarget;
  if (element instanceof HTMLElement) {
    pointerElement = element;
    element.setPointerCapture(e.pointerId);
    element.addEventListener("lostpointercapture", onPointerEnd);
  }
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerEnd);
  document.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("blur", onWindowBlur);
};

const stopPointerInteraction = () => {
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerEnd);
  document.removeEventListener("pointercancel", onPointerEnd);
  window.removeEventListener("blur", onWindowBlur);
  if (pointerFrame !== undefined) cancelAnimationFrame(pointerFrame);
  pointerFrame = undefined;
  pendingPointerMove = undefined;
  const pointerId = activePointerId;
  activePointerId = undefined;
  pointerElement?.removeEventListener("lostpointercapture", onPointerEnd);
  if (pointerId !== undefined && pointerElement?.hasPointerCapture?.(pointerId)) {
    pointerElement.releasePointerCapture(pointerId);
  }
  pointerElement = undefined;
};

const onPointerDownTitlebar = (e: PointerEvent) => {
  if (e.button !== 0 || !e.isPrimary || activePointerId !== undefined) return;
  startPointerInteraction(e);
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
  e.stopPropagation();
};

const isOutsideBrowser = (e: PointerEvent) => {
  return (
    e.clientX <= 0 ||
    e.clientX >= window.innerWidth - 1 ||
    e.clientY <= 0 ||
    e.clientY >= window.innerHeight - 1
  );
};

const finishPointerInteraction = (pointerId?: number) => {
  if (activePointerId === undefined) return;
  if (pointerId !== undefined && activePointerId !== pointerId) return;
  flushPointerMove();
  settlePointerPosition();
  stopPointerInteraction();
  if (dragPosition) {
    x.value = dragPosition.x;
    y.value = dragPosition.y;
    const element = windowElement.value;
    if (element) {
      // Commit the final position before removing the compositor offset.
      element.style.left = `${x.value}px`;
      element.style.top = `${y.value}px`;
      element.style.translate = "";
    }
    dragPosition = undefined;
  }
  if (isDragging.value) {
    isDragging.value = false;
    emit("moved", props.id, x.value, y.value);
  }
  if (isResizing.value) {
    isResizing.value = false;
    emit("resized", props.id, x.value, y.value, width.value, height.value);
  }
};
const onPointerEnd = (e: PointerEvent) => finishPointerInteraction(e.pointerId);
const onWindowBlur = () => finishPointerInteraction();

const applyPointerMove = (e: PointerEvent) => {
  if (isDragging.value && props.maximized && !isDragThresholdMet.value) {
    const dx = e.clientX - dragStartPos.value.x;
    const dy = e.clientY - dragStartPos.value.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= DRAG_THRESHOLD) {
      isDragThresholdMet.value = true;

      const restoredW = Math.min(savedPos.value.w, window.innerWidth - 40);
      const restoredH = Math.min(savedPos.value.h, window.innerHeight - 100);
      const titlebarHeight = 38;
      const restoredX = Math.max(
        0,
        Math.min(e.clientX - restoredW * 0.15, window.innerWidth - restoredW - 10)
      );
      const restoredY = Math.max(
        0,
        Math.min(e.clientY - titlebarHeight * 0.5, window.innerHeight - restoredH - 60)
      );

      x.value = restoredX;
      y.value = restoredY;
      width.value = restoredW;
      height.value = restoredH;

      savedPos.value = { x: restoredX, y: restoredY, w: restoredW, h: restoredH };

      restoringFromDrag = true;
      emit("maximize", props.id);

      dragOffset.value = {
        x: e.clientX - restoredX,
        y: e.clientY - restoredY
      };
    }
    return;
  }

  if (isDragging.value) {
    dragPosition = { x: e.clientX - dragOffset.value.x, y: e.clientY - dragOffset.value.y };
    const element = windowElement.value;
    if (element) {
      // Keep pointer movement out of Vue rendering and layout.
      element.style.translate = `${dragPosition.x - x.value}px ${dragPosition.y - y.value}px`;
    }
  }
  if (isResizing.value && props.resizable) {
    const dx = e.clientX - resizeStart.value.x;
    const dy = e.clientY - resizeStart.value.y;

    let newWidth = resizeStart.value.w;
    let newHeight = resizeStart.value.h;
    let newX = resizeStart.value.winX;
    let newY = resizeStart.value.winY;

    if (resizeDirection.value.includes("e")) {
      newWidth = Math.max(400, resizeStart.value.w + dx);
    }
    if (resizeDirection.value.includes("s")) {
      newHeight = Math.max(300, resizeStart.value.h + dy);
    }
    if (resizeDirection.value.includes("w")) {
      newWidth = Math.max(400, resizeStart.value.w - dx);
      newX = resizeStart.value.winX + (resizeStart.value.w - newWidth);
    }
    if (resizeDirection.value.includes("n")) {
      newHeight = Math.max(300, resizeStart.value.h - dy);
      newY = resizeStart.value.winY + (resizeStart.value.h - newHeight);
    }

    width.value = newWidth;
    height.value = newHeight;
    x.value = newX;
    y.value = newY;
  }
};

const flushPointerMove = () => {
  if (pointerFrame !== undefined) cancelAnimationFrame(pointerFrame);
  pointerFrame = undefined;
  const event = pendingPointerMove;
  pendingPointerMove = undefined;
  if (event) applyPointerMove(event);
};

const onPointerMove = (e: PointerEvent) => {
  if (activePointerId !== e.pointerId) return;
  if (e.pointerType === "mouse" && isOutsideBrowser(e)) {
    finishPointerInteraction(e.pointerId);
    return;
  }
  pendingPointerMove = e;
  if (pointerFrame === undefined) {
    pointerFrame = requestAnimationFrame(flushPointerMove);
  }
};

const onResizeStart = (e: PointerEvent, dir: string) => {
  if (
    e.button !== 0 ||
    !e.isPrimary ||
    activePointerId !== undefined ||
    props.maximized ||
    !props.resizable
  )
    return;
  startPointerInteraction(e);
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
  emit("maximize", props.id);
};

const handleFocus = () => {
  emit("focus", props.id);
};

const onContextMenuTitlebar = (e: MouseEvent) => {
  emit("contextmenu-titlebar", e, props.id);
};

onMounted(() => {
  if (boundsDiffer(requestedBounds, initialBounds)) reportBounds();
  window.addEventListener("resize", onViewportResize);
});

onBeforeUnmount(cancelPointerSettling);
onUnmounted(() => {
  stopPointerInteraction();
  stopVisibilityAnimation();
  window.removeEventListener("resize", onViewportResize);
});
</script>

<template>
  <div
    ref="windowElement"
    class="desktop-window"
    :class="{
      'desktop-window--active': active,
      'desktop-window--maximized': maximized,
      'desktop-window--dragging': isDragging,
      'desktop-window--resizing': isResizing,
      'desktop-window--settling': isPointerSettling,
      'desktop-window--animating': isAnimatingVisibility,
      'desktop-window--suspended': isRenderSuspended
    }"
    :style="[windowStyle, { display: visible && renderWindow ? undefined : 'none' }]"
    @pointerdown="handleFocus"
    @scroll.capture="onWindowScroll"
  >
    <div class="window__frame">
      <div
        class="window__titlebar"
        @pointerdown="onPointerDownTitlebar"
        @dblclick="handleMaximize"
        @contextmenu.stop.prevent="onContextMenuTitlebar"
      >
        <div class="window__titlebar-left">
          <span v-if="icon" class="window__icon">
            <component :is="icon" v-if="isComponentIcon" />
            <VIcon v-else-if="isMdiIcon" :icon="icon as string" size="small" />
            <img v-else :src="icon as string" alt="icon" />
          </span>
          <span :id="`${id}-title`" class="window__title"
            ><slot name="title">{{ title }}</slot></span
          >
        </div>
        <div class="window__controls" @pointerdown.stop>
          <VBtn
            v-if="showMinimize"
            class="window__control window__control--minimize"
            icon="mdi-minus"
            variant="text"
            density="compact"
            size="small"
            :aria-label="`Minimize ${title}`"
            @click.stop="emit('minimize', id)"
          />
          <VBtn
            v-if="showMaximize"
            class="window__control window__control--maximize"
            :icon="maximized ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
            variant="text"
            density="compact"
            size="small"
            :aria-label="maximized ? `Restore ${title}` : `Maximize ${title}`"
            @click.stop="handleMaximize"
          />
          <VBtn
            v-if="showClose"
            class="window__control window__control--close"
            icon="mdi-close"
            variant="text"
            density="compact"
            size="small"
            :aria-label="`Close ${title}`"
            @click.stop="emit('close', id)"
          />
        </div>
      </div>

      <div class="window__content" @contextmenu.stop>
        <VDefaultsProvider :defaults="overlayDefaults">
          <slot :suspended="isRenderSuspended"></slot>
        </VDefaultsProvider>
      </div>
    </div>

    <template v-if="!maximized && resizable">
      <div
        class="window__resize-handle window__resize-handle--nw"
        @pointerdown="onResizeStart($event, 'nw')"
      ></div>
      <div
        class="window__resize-handle window__resize-handle--ne"
        @pointerdown="onResizeStart($event, 'ne')"
      ></div>
      <div
        class="window__resize-handle window__resize-handle--sw"
        @pointerdown="onResizeStart($event, 'sw')"
      ></div>
      <div
        class="window__resize-handle window__resize-handle--se"
        @pointerdown="onResizeStart($event, 'se')"
      ></div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.desktop-window {
  position: fixed;
  box-shadow: 0 8px 32px var(--desktop-window-shadow);
  display: flex;
  flex-direction: column;
  transition:
    left 0.2s ease,
    top 0.2s ease,
    width 0.2s ease,
    height 0.2s ease,
    border-radius 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.25s cubic-bezier(0.25, 0.1, 0.25, 1),
    transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);

  &--active {
    box-shadow: 0 12px 48px var(--desktop-window-shadow);
  }

  &--dragging,
  &--resizing,
  &--settling,
  &--animating {
    transition: none;
  }

  &--animating {
    pointer-events: none;
    will-change: transform, opacity;
  }

  &--dragging {
    will-change: translate;
  }
}

.desktop-window-enter-from,
.desktop-window-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.window__frame {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-radius: inherit;
  overflow: hidden;
  contain: layout paint style;

  &:has(.desktop-window) {
    contain: style;
  }
}

.desktop-window--suspended > .window__frame {
  content-visibility: hidden;
}

.window__titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 8px 0 12px;
  background: var(--desktop-window-titlebar-bg);
  cursor: default;
  touch-action: none;
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
  position: relative;
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  transform: translateX(3px);
}

.window__control {
  width: 30px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  cursor: pointer;
  color: var(--desktop-window-text-secondary);
  font-size: 12px;
  transition: background-color 0.12s;

  :deep(.v-btn__content) {
    color: inherit;
  }

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
  --resize-handle-offset: -8px;

  position: absolute;
  width: 12px;
  height: 12px;
  z-index: 10;
  touch-action: none;

  &--nw {
    top: var(--resize-handle-offset);
    left: var(--resize-handle-offset);
    cursor: nwse-resize;
  }

  &--ne {
    top: var(--resize-handle-offset);
    right: var(--resize-handle-offset);
    cursor: nesw-resize;
  }

  &--sw {
    bottom: var(--resize-handle-offset);
    left: var(--resize-handle-offset);
    cursor: nesw-resize;
  }

  &--se {
    bottom: var(--resize-handle-offset);
    right: var(--resize-handle-offset);
    cursor: nwse-resize;

    &::after {
      content: "";
      position: absolute;
      bottom: 3px;
      right: 3px;
      width: 8px;
      height: 8px;
      background: transparent;
    }
  }
}

@media (any-pointer: coarse) {
  .window__resize-handle {
    --resize-handle-offset: -20px;

    width: 28px;
    height: 28px;
  }
}
</style>
