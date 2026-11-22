<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, type Component } from "vue";
import { desktopWindowContextKey, type WindowState } from "../../windowContext";

const props = defineProps<{ window: WindowState }>();
const desktop = inject(desktopWindowContextKey)!;
const contentElement = ref<HTMLElement>();
onBeforeUnmount(() => contentElement.value?.removeAttribute("data-desktop-window-content"));
const close = () => desktop.close(props.window.id);
const openFileEditor = (path: string, name: string) =>
  desktop.openFileEditor(props.window.instanceId!, props.window.daemonId!, path, name);
const openImageViewer = (path: string, name: string) =>
  desktop.openImageViewer(props.window.instanceId!, props.window.daemonId!, path, name);

interface WindowContent {
  component: Component;
  props?: Record<string, unknown>;
  events: Partial<Record<string, (...args: any[]) => unknown>>;
}

// Read content dependencies here, outside the desktop and window chrome render effects.
const content = computed<WindowContent | undefined>(() => {
  const win = props.window;
  const view = desktop.views.value.get(win.content);
  if (view)
    return {
      component: view.component,
      props: win.props ?? { instanceId: win.instanceId, daemonId: win.daemonId, type: win.type },
      events: { close }
    };
  if (win.content.startsWith("instance-action:") && win.component && win.instanceId && win.daemonId)
    return {
      component: win.component,
      props: { instanceUuid: win.instanceId, daemonId: win.daemonId, sessionId: win.id },
      events: { close, "open-file-editor": openFileEditor, "open-image-viewer": openImageViewer }
    };
  if (
    win.content === "file-editor" &&
    desktop.fileEditor.value &&
    win.instanceId &&
    win.daemonId &&
    win.filePath &&
    win.fileName
  )
    return {
      component: desktop.fileEditor.value,
      props: {
        instanceId: win.instanceId,
        daemonId: win.daemonId,
        filePath: win.filePath,
        fileName: win.fileName
      },
      events: { close }
    };
  if (
    win.content === "image-viewer" &&
    desktop.imageViewer.value &&
    win.instanceId &&
    win.daemonId &&
    win.filePath &&
    win.fileName
  )
    return {
      component: desktop.imageViewer.value,
      props: {
        instanceId: win.instanceId,
        daemonId: win.daemonId,
        filePath: win.filePath,
        fileName: win.fileName
      },
      events: { close }
    };
  if (win.content === "users" && desktop.users.value)
    return { component: desktop.users.value, events: {} };
  if (win.content === "user-info" && desktop.userInfo.value)
    return { component: desktop.userInfo.value, events: {} };
  if (win.component)
    return {
      component: win.component,
      events: {
        close,
        "open-console": desktop.openConsole
      }
    };
  return undefined;
});
</script>

<template>
  <div ref="contentElement" class="window-inner-content" :data-desktop-window-content="window.id">
    <component
      :is="content.component"
      v-if="content"
      v-bind="content.props"
      v-on="content?.events ?? {}"
    />
    <div v-else class="window-page">
      <p>{{ window.title }}</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.window-inner-content {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.window-page {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
