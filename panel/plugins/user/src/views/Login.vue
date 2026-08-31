<script setup lang="ts">
import type { LayoutCard } from "@/types";
import LoginCard from "../widgets/LoginCard.vue";
import { useScreen } from "@/hooks/useScreen";
import LayoutContainer from "@/views/LayoutContainer.vue";

defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();

const skeletonConfigs = [
  { span: 6, rows: 4 },
  { span: 6, rows: 4 },
  { span: 6, rows: 4 },
  { span: 6, rows: 4 },
  { span: 24, rows: 9 },
  { span: 8, rows: 6 },
  { span: 16, rows: 6 },
  { span: 8, rows: 6 },
  { span: 16, rows: 6 }
];
</script>

<template>
  <div v-if="!isPhone" class="login-wrapper-fixed">
    <div class="login-page-container">
      <div class="login-page-body">
        <LayoutContainer></LayoutContainer>
      </div>
    </div>
  </div>
  <div v-else class="login-wrapper-fixed">
    <LoginCard></LoginCard>
  </div>
</template>

<style>
.login-wrapper-fixed {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 100;
  overflow: hidden;
}
</style>

<style lang="scss">
@keyframes scaleAnimation {
  0% {
    transform: scale(1);
  }

  20% {
    transform: scale(0.9);
    opacity: 1;
  }

  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

.login-page-container {
  position: fixed;
  left: 0px;
  right: 0px;
  bottom: 0px;
  top: 0px;

  transition: all 0.8s;
  overflow-y: auto;
  overflow-x: hidden;

  .login-page-body {
    padding: 12px;
    padding-top: 84px;
    max-width: 1260px !important;
    margin: 0 auto;
    height: 100%;
    position: relative;

    .main-flex-center {
      margin-top: 0 !important;
      position: absolute;
      left: 0px;
      right: 0px;
      bottom: 0px;
      top: 0px;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: left !important;
    }
  }
}
</style>
