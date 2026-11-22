<script setup lang="ts">
defineProps<{
  time: string;
  date: string;
}>();
</script>

<template>
  <div class="app-h-100 flex-center">
    <div class="value app-pb-40" style="font-size: 60px">
      {{ time }}
    </div>
    <div class="app-ml-auto" style="font-size: 10px; position: absolute; right: 40px; bottom: 20px">
      {{ date }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.value {
  font-weight: bolder;
}
</style>
