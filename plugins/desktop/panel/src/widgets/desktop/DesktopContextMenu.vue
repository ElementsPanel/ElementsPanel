<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { VIcon, VList, VListItem, VListItemTitle } from "vuetify/components";

export interface ContextMenuItem {
    label: string;
    icon?: string | null;
    action: () => void;
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
            <VList class="ctx-menu__list" density="compact" bg-color="transparent">
                <VListItem v-for="(item, index) in items" :key="index"
                    class="ctx-menu__item" rounded="xl" @click="handleClick(item)">
                    <template #prepend>
                        <span v-if="item.icon" class="ctx-menu__icon">
                            <VIcon :icon="item.icon" size="small" />
                        </span>
                    </template>
                    <VListItemTitle class="ctx-menu__label">{{ item.label }}</VListItemTitle>
                </VListItem>
            </VList>
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
    box-shadow: 0 8px 32px var(--desktop-menu-shadow);
    z-index: 100001;
    padding: 4px 0;
    overflow: hidden;
}

.ctx-menu__item {
    color: var(--desktop-menu-text);
    font-size: 13px;
    transition: background-color 0.12s;

    &:hover {
        background-color: var(--desktop-menu-hover);
    }
}

.ctx-menu__list {
    padding: 4px;
}

.ctx-menu__icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
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
