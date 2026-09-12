<!-- IframeModal Dialog Component -->
<template>
  <AppDialog v-model:visible="visible" width="80%" :footer="null" class="iframe-modal" @cancel="handleCancel">
    <div class="iframe-modal-content">
      <IframeBox :src="src" width="100%" height="100%" />
    </div>
  </AppDialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import IframeBox from "@/components/IframeBox/index.vue";
import AppDialog from "@/components/AppDialog.vue";

interface IframeModalProps {
  src: string;
}

const props = defineProps<IframeModalProps>();

const visible = ref(false);

// Handle modal close
const handleCancel = () => {
  visible.value = false;
};

// Show modal after component mount
onMounted(() => {
  visible.value = true;
});

// Expose methods for external use
defineExpose({
  close: handleCancel
});
</script>

<style scoped>
.iframe-modal :deep(.app-dialog-content) {
  padding: 0;
  height: 100%;
}

.iframe-modal :deep(.app-dialog-content) {
  padding-top: 0;
}

.iframe-modal :deep(.app-dialog-card) {
  height: min(90vh, 960px);
  display: flex;
  flex-direction: column;
}

.iframe-modal-content {
  width: 100%;
  height: 80vh;
  min-height: 600px;
  overflow: hidden;
  padding: 14px 0;
}

.iframe-modal :deep(.app-dialog-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.iframe-modal :deep(.app-dialog-title) {
  flex-shrink: 0;
}
</style>
