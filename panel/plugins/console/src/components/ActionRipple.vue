<script setup lang="ts">
import { ref, watch } from "vue";

/**
 * Draws the shell's one-shot ripple in the page layer, not inside the toolbar.
 *
 * The anchor is an absolutely positioned child of the button wrapper, so its
 * rect is the button's rect. The circles themselves are teleported to `body`;
 * a fixed position there is never clipped by the header, drawer or taskbar.
 *
 * `inline` renders the circles inside the button wrapper instead: the desktop
 * taskbar lives in a stacking context (`.desktop-container`, z-index 100) that
 * paints over any body-level ripple, while nothing in the taskbar chain clips
 * overflow. Staying local keeps the ripple above the taskbar and windows, yet
 * still under the start menu, context menu and dialogs.
 */
const props = defineProps<{
  /** A changing value starts a new ripple; `0`/`undefined` render nothing. */
  trigger?: number;
  /** Render the ripple inside the button wrapper instead of the page layer. */
  inline?: boolean;
}>();

interface ActiveRipple {
  key: number;
  x: number;
  y: number;
  color: string;
}

const anchor = ref<HTMLElement>();
const ripples = ref<ActiveRipple[]>([]);

watch(
  () => props.trigger,
  (value, previous) => {
    if (!value || value === previous || !anchor.value) return;
    const rect = anchor.value.getBoundingClientRect();
    const primary = getComputedStyle(anchor.value).getPropertyValue("--v-theme-primary").trim();
    ripples.value.push({
      key: value,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      color: primary ? `rgb(${primary})` : "currentColor"
    });
  }
);

const remove = (key: number) => {
  ripples.value = ripples.value.filter((ripple) => ripple.key !== key);
};
</script>

<template>
  <span ref="anchor" class="action-ripple-anchor" aria-hidden="true" />
  <Teleport v-if="!inline" to="body">
    <span
      v-for="ripple in ripples"
      :key="ripple.key"
      class="action-ripple-circle"
      :style="{ left: `${ripple.x}px`, top: `${ripple.y}px`, background: ripple.color }"
      aria-hidden="true"
      @animationend="remove(ripple.key)"
    />
  </Teleport>
  <template v-else>
    <span
      v-for="ripple in ripples"
      :key="ripple.key"
      class="action-ripple-circle action-ripple-circle--inline"
      :style="{ background: ripple.color }"
      aria-hidden="true"
      @animationend="remove(ripple.key)"
    />
  </template>
</template>

<style lang="scss" scoped>
.action-ripple-anchor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Fixed to the page so the growth is never clipped by the header, and just
   above the shell chrome (header uses 20) while dialogs stay on top. */
.action-ripple-circle {
  position: fixed;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 30;
  animation: action-ripple 600ms cubic-bezier(0, -0.04, 0, 0.99) forwards;
}

/* Anchored to the button wrapper, so the ripple grows from the button itself
   and is painted inside the taskbar's own stacking context. */
.action-ripple-circle--inline {
  position: absolute;
  left: 50%;
  top: 50%;
}

@keyframes action-ripple {
  from {
    transform: scale(0.35);
    opacity: 0.4;
  }
  to {
    transform: scale(20);
    opacity: 0;
  }
}
</style>
