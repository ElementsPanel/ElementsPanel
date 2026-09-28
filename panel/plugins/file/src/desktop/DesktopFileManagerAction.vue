<script setup lang="ts">
import DesktopFileManager from "./DesktopFileManager.vue";

const props = defineProps<{
  instanceUuid: string;
  daemonId: string;
  sessionId?: string;
}>();

const emit = defineEmits<{
  (e: "open-file-editor", filePath: string, fileName: string): void;
  (e: "open-image-viewer", filePath: string, fileName: string): void;
}>();
</script>

<template>
  <DesktopFileManager
    :instance-id="props.instanceUuid"
    :daemon-id="props.daemonId"
    :session-id="props.sessionId"
    @open-file-editor="(...args) => emit('open-file-editor', ...args)"
    @open-image-viewer="(...args) => emit('open-image-viewer', ...args)"
  />
</template>
