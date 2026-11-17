<script setup lang="ts">
import { ref, watch } from "vue";

/** Teleport page ripples to avoid clipping; taskbar ripples stay inside their stacking context. */
const props = defineProps<{
  /** A changing value starts a new ripple; `0`/`undefined` render nothing. */
  trigger?: number;
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

/* Keep page ripples above the header but below dialogs. */
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

/* Draw taskbar ripples inside the button's stacking context. */
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
