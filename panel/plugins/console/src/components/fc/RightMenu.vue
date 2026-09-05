<script setup lang="ts">
import { useWindowSize } from "@vueuse/core";
import type { ItemType } from "ant-design-vue";
import type { CSSProperties } from "vue";
import { computed, nextTick, ref } from "vue";

const props = defineProps<{
  mouseX: number;
  mouseY: number;
  options: ItemType[];
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
    <a-menu mode="vertical" style="width: 160px" :items="props.options"> </a-menu>
  </div>
</template>

<style lang="scss" scoped>
.right-menu {
  z-index: 9999;
  box-shadow: 0px 0px 12px var(--color-gray-4);
  border-radius: 10px;
  overflow: hidden;
  visibility: hidden;

  :deep(.ant-menu) {
    border-inline-end: none;

    .ant-menu-item,
    .ant-menu-submenu-title {
      height: 32px !important;
      line-height: 32px !important;
      margin-block: 2px !important;
      padding-inline: 12px !important;
      display: flex !important;
      align-items: center !important;
    }

    .ant-menu-submenu-arrow {
      inset-inline-end: 8px !important;
    }
  }
}
</style>

<style lang="scss">
.right-menu {
  .ant-menu-submenu-popup {

    .ant-menu-item,
    .ant-menu-submenu-title {
      height: 32px !important;
      line-height: 32px !important;
      margin-block: 2px !important;
      padding-inline: 12px !important;
      display: flex !important;
      align-items: center !important;
    }

    .ant-menu-submenu-arrow {
      inset-inline-end: 8px !important;
    }
  }
}
</style>
