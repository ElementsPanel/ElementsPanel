<script lang="ts">
let dialogSequence = 0;
</script>

<script setup lang="ts">
import { ctx } from "@/plugin/context";
import { computed, onMounted, onUnmounted, ref, useSlots, type Component } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  modelValue: boolean;
  id?: string;
  title?: string | null;
  icon?: string | Component;
  width?: number | string;
  height?: number;
  zIndex?: number;
  resizable?: boolean;
  closable?: boolean;
  keyboard?: boolean;
  padded?: boolean;
  scrollable?: boolean;
  transition?: string;
}>(), {
  width: 420,
  height: 485,
  zIndex: 10001,
  resizable: false,
  closable: true,
  keyboard: true,
  padded: true,
  scrollable: true,
  transition: "desktop-window"
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  close: [];
  focus: [];
  "after-leave": [];
}>();
const slots = useSlots();
const shell = computed(() => ctx.desktop.window);
const instanceId = ++dialogSequence;
const windowId = computed(() => props.id || `desktop-dialog-${instanceId}`);
const dialogElement = ref<{ $el: HTMLElement }>();
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const updateViewport = () => {
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
};
const size = computed(() => ({
  width: Math.min(Number.parseFloat(String(props.width)) || 420, Math.max(1, viewport.value.width - 32)),
  height: Math.min(props.height, Math.max(1, viewport.value.height - 80))
}));
onMounted(() => window.addEventListener("resize", updateViewport));
onUnmounted(() => window.removeEventListener("resize", updateViewport));

const close = () => {
  if (!props.modelValue || !props.closable) return;
  emit("close");
  emit("update:modelValue", false);
};

defineExpose({ getElement: () => dialogElement.value?.$el });
</script>

<template>
  <Teleport to="body">
    <Transition :name="transition" @after-leave="emit('after-leave')">
      <component
        :is="shell"
        v-if="modelValue && shell"
        :id="windowId"
        ref="dialogElement"
        v-bind="$attrs"
        class="desktop-dialog"
        :title="title || ''"
        :icon="icon"
        :visible="true"
        :minimized="false"
        :maximized="false"
        :active="true"
        :initial-width="size.width"
        :initial-height="size.height"
        :initial-x="(viewport.width - size.width) / 2"
        :initial-y="Math.max(16, (viewport.height - 48 - size.height) / 2)"
        :z-index="zIndex"
        :show-minimize="false"
        :show-maximize="false"
        :show-close="closable"
        :resizable="resizable"
        role="dialog"
        :aria-labelledby="`${windowId}-title`"
        tabindex="-1"
        @focus="emit('focus')"
        @close="close"
        @keydown.esc.stop="keyboard && close()"
      >
        <template v-if="slots.title" #title><slot name="title" /></template>
        <div class="desktop-dialog__content">
          <div
            class="desktop-dialog__body"
            :class="{
              'desktop-dialog__body--unpadded': !padded,
              'desktop-dialog__body--contained': !scrollable
            }"
          ><slot /></div>
          <div v-if="slots.footer" class="desktop-dialog__footer"><slot name="footer" /></div>
        </div>
      </component>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.desktop-dialog__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.desktop-dialog__body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
  color: var(--desktop-window-text);

  &--unpadded { padding: 0; }
  &--contained {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
}

.desktop-dialog__footer {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
}
</style>
