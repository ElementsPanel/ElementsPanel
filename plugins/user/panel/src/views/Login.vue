<script setup lang="ts">
import LoginCard from "../widgets/LoginCard.vue";
</script>

<template>
  <div class="login-wrapper-fixed">
    <div class="login-card-container">
      <LoginCard />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-wrapper-fixed {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.login-wrapper-fixed::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  background: transparent !important;
}

.login-wrapper-fixed::-webkit-scrollbar-thumb,
.login-wrapper-fixed::-webkit-scrollbar-track {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.login-card-container {
  width: min(100%, 420px);
}

@media (max-width: 480px) {
  .login-wrapper-fixed {
    align-items: flex-start;
    padding: 16px;
  }
}
</style>
