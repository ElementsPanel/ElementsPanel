<script setup lang="ts">
import type { LayoutCard } from "@/types";

const props = defineProps<{
  card: LayoutCard;
}>();
</script>

<template>
  <div class="">
    <h2 class="mb-0">
      {{ props.card.title }}
    </h2>
  </div>
</template>
