<script setup lang="ts">
const props = defineProps({
  fullHeight: {
    type: Boolean,
    default: true
  },
  padding: {
    type: Boolean,
    default: true
  }
});
</script>

<template>
  <div
    :class="{
      'card-panel': true,
      'global-card-container-shadow': true,
      'h-100': props.fullHeight,
      padding: props.padding
    }"
  >
    <div v-if="$slots.title" class="card-panel-title">
      <div>
        <h3 class="card-panel-heading">
          <slot name="title"></slot>
        </h3>
      </div>
      <div>
        <span>
          <slot name="operator"></slot>
        </span>
      </div>
    </div>
    <div class="card-panel-content">
      <slot name="body"></slot>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.padding {
  padding: 16px;
}

.card-panel {
  border: none;
  background-color: var(--background-color-white);
  display: flex;
  flex-direction: column;
  position: relative;

  .card-panel-title {
    font-weight: 600;
    color: var(--text-color);

    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0;
    margin-bottom: 8px;
  }

  .card-panel-heading {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
  }
  .card-panel-content {
    flex-grow: 1;
    color: var(--text-color);
    position: relative;
  }
}

.card-panel-content {
  overflow: hidden;
  zoom: 1;
  word-break: break-all;
}
</style>
