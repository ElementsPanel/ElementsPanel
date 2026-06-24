<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, type Component } from "vue";

export interface ContextMenuItem {
    label: string;
    icon?: Component | string | null;
    action: () => void;
    divider?: boolean;
}

const props = defineProps<{
    visible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const menuRef = ref<HTMLElement | null>(null);
const adjustedX = ref(0);
const adjustedY = ref(0);

watch(
    () => [props.visible, props.x, props.y],
    async ([visible, x, y]) => {
        if (visible) {
            adjustedX.value = x as number;
            adjustedY.value = y as number;

            await nextTick();

            if (menuRef.value) {
                const width = menuRef.value.offsetWidth;
                const height = menuRef.value.offsetHeight;
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;

                let newX = x as number;
                let newY = y as number;

                if (newX + width > windowWidth) {
                    newX = windowWidth - width - 8;
                }

                if (newY + height > windowHeight) {
                    newY = (y as number) - height;
                    if (newY < 8) {
                        newY = 8;
                    }
                }

                adjustedX.value = newX;
                adjustedY.value = newY;
            }
        }
    }
);

const handleClick = (item: ContextMenuItem) => {
    item.action();
    emit("close");
};

const handleClickOutside = () => {
    if (props.visible) {
        emit("close");
    }
};

const isComponent = (icon: unknown): icon is Component => {
    return icon !== null && icon !== undefined && typeof icon !== "string";
};

onMounted(() => {
    document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
    <Transition name="ctx-menu">
        <div v-if="visible" ref="menuRef" class="desktop-context-menu"
            :style="{ left: `${adjustedX}px`, top: `${adjustedY}px` }" @click.stop>
            <div v-for="(item, index) in items" :key="index">
                <div v-if="item.divider" class="ctx-menu__divider"></div>
                <div v-else class="ctx-menu__item" @click="handleClick(item)">
                    <span v-if="item.icon" class="ctx-menu__icon">
                        <component :is="item.icon" v-if="isComponent(item.icon)" />
                        <template v-else>{{ item.icon }}</template>
                    </span>
                    <span class="ctx-menu__label">{{ item.label }}</span>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style lang="scss" scoped>
.desktop-context-menu {
    position: fixed;
    min-width: 180px;
    background: var(--desktop-menu-bg);
    backdrop-filter: saturate(180%) blur(24px);
    border-radius: 8px;
    border: 1px solid var(--desktop-menu-border);
    box-shadow: 0 8px 32px var(--desktop-menu-shadow);
    z-index: 100001;
    padding: 4px 0;
    overflow: hidden;
}

.ctx-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
    color: var(--desktop-menu-text);
    font-size: 13px;
    transition: background-color 0.12s;

    &:hover {
        background-color: var(--desktop-menu-hover);
    }
}

.ctx-menu__icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
}

.ctx-menu__divider {
    height: 1px;
    background: var(--desktop-menu-divider);
    margin: 4px 12px;
}

.ctx-menu-enter-active {
    transition: opacity 0.15s cubic-bezier(0.25, 0.10, 0.25, 1.00), transform 0.15s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.ctx-menu-leave-active {
    transition: opacity 0.1s ease-in, transform 0.1s ease-in;
}

.ctx-menu-enter-from {
    opacity: 0;
    transform: scale(0.92);
}

.ctx-menu-leave-to {
    opacity: 0;
    transform: scale(0.92);
}
</style>
