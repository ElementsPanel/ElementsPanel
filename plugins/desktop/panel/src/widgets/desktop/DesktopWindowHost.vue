<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { desktopWindowContextKey, type WindowState } from "../../windowContext";
import DesktopWindow from "./DesktopWindow.vue";
import DesktopWindowContent from "./DesktopWindowContent.vue";

const props = defineProps<{ window: WindowState }>();
const desktop = inject(desktopWindowContextKey)!;
const active = computed(() => props.window.id === desktop.activeWindowId.value);
const transitioning = ref(false);
</script>

<template>
    <Transition name="desktop-window" appear @before-enter="transitioning = true"
        @after-enter="transitioning = false" @enter-cancelled="transitioning = false"
        @after-leave="desktop.closed(window.id)">
        <DesktopWindow v-if="window.visible" :id="window.id" :title="window.title" :icon="window.icon" :visible="window.visible"
            :minimized="window.minimized" :maximized="window.maximized" :active="active"
            :initial-x="window.initialX" :initial-y="window.initialY" :initial-width="window.initialWidth"
            :initial-height="window.initialHeight" :z-index="window.zIndex" :transitioning="transitioning" @close="desktop.close"
            @minimize="desktop.minimize" @maximize="desktop.maximize" @focus="desktop.focus"
            @moved="desktop.moved" @resized="desktop.resized" @contextmenu-titlebar="desktop.contextMenu">
            <template #default="{ suspended }">
                <KeepAlive>
                    <DesktopWindowContent v-if="!suspended" :key="window.id" :window="window" />
                </KeepAlive>
            </template>
        </DesktopWindow>
    </Transition>
</template>
