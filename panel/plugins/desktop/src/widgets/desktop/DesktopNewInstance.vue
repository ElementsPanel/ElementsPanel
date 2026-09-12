<script setup lang="ts">
import CreateInstancePage from "@instance/views/CreateInstance.vue";

const emit = defineEmits<{
    (event: "close"): void;
}>();
</script>

<template>
    <CreateInstancePage embedded @created="emit('close')" />
</template>
