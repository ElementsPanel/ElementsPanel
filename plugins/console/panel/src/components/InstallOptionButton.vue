<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  option: {
    label: string;
    icon: Component;
    description: string;
    action: (e: Event) => void;
  };
}>();

const handleClick = (e: Event, action: (e: Event) => void) => {
  action(e);
};
</script>

<template>
  <div class="install-option-button" role="button" tabindex="0" @click="(e) => handleClick(e, option.action)"
    @keydown.enter.space.prevent="(e) => handleClick(e, option.action)">
    <div class="button-inner">
      <div class="button-icon">
        <component :is="option.icon" />
      </div>
      <div class="button-content">
        <span class="button-label">{{ option.label }}</span>
        <span class="button-desc">{{ option.description }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.install-option-button {
  --ai-gradient-from: #8b5cf6;
  --ai-gradient-via: #06b6d4;
  --ai-gradient-to: #3b82f6;
  cursor: pointer;
  border-radius: 12px;
  padding: 1px;
  background: var(--color-gray-3);
  border: none;
  height: 130px;

  .button-inner {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 11px;
    background: var(--color-gray-2);
    height: 100%;
    min-height: 72px;
    transition: background-color 0.25s ease;
  }

  &:hover .button-inner {
    background-color: var(--color-gray-4);
  }

  .button-icon {
    flex-shrink: 0;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    font-size: 20px;
    color: var(--color-blue-6);
    background: rgba(22, 119, 255, 0.1);
  }

  .button-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .button-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-gray-10);
  }

  .button-desc {
    font-size: 13px;
    color: var(--color-gray-7);
    line-height: 1.35;
  }

  .button-cta {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-blue-6);
  }
}
</style>
