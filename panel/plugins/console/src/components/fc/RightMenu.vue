<script setup lang="ts">
import { useWindowSize } from "@vueuse/core";
import type { CSSProperties } from "vue";
import { computed, nextTick, ref } from "vue";
import { VIcon, VList, VListItem, VListItemTitle } from "vuetify/components";

interface MenuItem {
  key?: string;
  label?: string;
  title?: string;
  icon?: unknown;
  disabled?: boolean;
  children?: MenuItem[];
  onClick?: (event?: Event) => void;
}

const props = defineProps<{
  mouseX: number;
  mouseY: number;
  options: MenuItem[];
}>();

const { width: vw, height: vh } = useWindowSize();
const rightMenu = ref<HTMLElement>();

const x = ref(props.mouseX);
const y = ref(props.mouseY);

const menuStyle = computed<CSSProperties>(() => {
  return {
    position: "fixed",
    top: `${y.value}px`,
    left: `${x.value}px`
  };
});

const openMenu = () => {
  if (rightMenu.value) {
    const rw = rightMenu.value.offsetWidth;
    const rh = rightMenu.value.offsetHeight;
    if (x.value > vw.value - rw) x.value -= rw;
    if (y.value > vh.value - rh) y.value -= rh;
    rightMenu.value.style.visibility = "unset";
  }
  return new Promise((resolve) => {
    nextTick(() => resolve(true));
  });
};

defineExpose({
  openMenu
});
</script>
<template>
  <div ref="rightMenu" class="right-menu" :style="menuStyle">
    <VList density="compact" min-width="160" class="right-menu-list" nav>
      <template v-for="(item, index) in props.options" :key="item.key || index">
        <VListItem
          :value="item.key || index"
          :disabled="item.disabled"
          @click="item.onClick?.($event)"
        >
          <template #prepend>
            <VIcon v-if="typeof item.icon === 'string'" :icon="item.icon" />
          </template>
          <VListItemTitle>{{ item.label || item.title }}</VListItemTitle>
        </VListItem>
      </template>
    </VList>
  </div>
</template>

<style lang="scss" scoped>
.right-menu {
  z-index: 9999;
  box-shadow: 0px 0px 12px var(--color-gray-4);
  border-radius: 10px;
  overflow: hidden;
  visibility: hidden;

  background: var(--background-color-white, rgb(var(--v-theme-surface)));
}

.right-menu-list {
  padding: 4px;
}
</style>
