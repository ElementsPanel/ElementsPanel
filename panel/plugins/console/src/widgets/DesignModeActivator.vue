<script setup lang="ts">
import Loading from "@/components/Loading.vue";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const { changeDesignMode } = useLayoutContainerStore();

onMounted(() => {
  changeDesignMode(true);
  void router.replace("/instances");
});
</script>

<template>
  <div class="design-mode-activator">
    <Loading />
  </div>
</template>

<style scoped>
.design-mode-activator {
  display: flex;
  width: 100%;
  min-height: 240px;
  align-items: center;
  justify-content: center;
}
</style>
