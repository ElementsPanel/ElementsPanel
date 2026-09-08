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
